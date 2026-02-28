"""Fair-Scheduler with Redis semaphores.

Prevents any single team (or user) from monopolizing worker slots.
Uses Redis atomic operations for distributed counting.

Key layout:
    scheduler:global              — INCR/DECR counter for global concurrency
    scheduler:team:{team_id}      — INCR/DECR counter for per-team concurrency
    scheduler:slot:{execution_id} — SET with TTL, proves slot ownership for crash recovery
    scheduler:active_slots        — SET of currently active execution_ids for stale cleanup
"""

import logging

import redis.asyncio as redis

from src.infra.config import get_settings
from src.infra.redis import get_redis_pool

logger = logging.getLogger(__name__)
settings = get_settings()


class FairScheduler:
    """Distributed fair-scheduler using Redis semaphores."""

    # Lua script for atomic acquire: returns {1, global_count, team_count} on
    # success, {0, global_count, team_count} on limit exceeded.
    _ACQUIRE_LUA = """
    local global_key = KEYS[1]
    local team_key   = KEYS[2]
    local slot_key   = KEYS[3]
    local slots_set  = KEYS[4]
    local global_max = tonumber(ARGV[1])
    local team_max   = tonumber(ARGV[2])
    local slot_ttl   = tonumber(ARGV[3])
    local team_id    = ARGV[4]
    local exec_id    = ARGV[5]

    local g = redis.call('INCR', global_key)
    if g > global_max then
        redis.call('DECR', global_key)
        return {0, g - 1, 0}
    end

    local t = redis.call('INCR', team_key)
    if t > team_max then
        redis.call('DECR', team_key)
        redis.call('DECR', global_key)
        return {0, g - 1, t - 1}
    end

    redis.call('SET', slot_key, team_id, 'EX', slot_ttl)
    redis.call('SADD', slots_set, exec_id)
    return {1, g, t}
    """

    # Lua script for atomic release: cleans up slot and decrements counters,
    # ensuring counters never go below 0.
    _RELEASE_LUA = """
    local global_key = KEYS[1]
    local team_key   = KEYS[2]
    local slot_key   = KEYS[3]
    local slots_set  = KEYS[4]
    local exec_id    = ARGV[1]

    redis.call('DEL', slot_key)
    redis.call('SREM', slots_set, exec_id)

    local g = redis.call('DECR', global_key)
    if g < 0 then
        redis.call('SET', global_key, 0)
    end

    local t = redis.call('DECR', team_key)
    if t < 0 then
        redis.call('SET', team_key, 0)
    end

    return {g, t}
    """

    def __init__(self) -> None:
        self._global_max = settings.FAIR_SCHEDULE_GLOBAL_MAX
        self._team_max = settings.FAIR_SCHEDULE_MAX_PER_TEAM
        # TTL for slot keys — crash recovery safety net
        self._slot_ttl = settings.MAX_EXECUTION_TIMEOUT + 60
        self._client: redis.Redis | None = None

    async def get_client(self) -> redis.Redis:
        """Get or create a persistent async Redis client from the pool."""
        if self._client is None:
            pool = get_redis_pool()
            self._client = redis.Redis(connection_pool=pool)
        return self._client

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def acquire(self, team_id: str, execution_id: str) -> bool:
        """Try to acquire a scheduler slot.

        Returns True if both global and per-team limits allow the execution.
        Returns False (backpressure) if either is full.
        """
        r = await self.get_client()
        return await self.try_acquire(r, team_id, execution_id)

    async def release(self, team_id: str, execution_id: str) -> None:
        """Release a scheduler slot."""
        r = await self.get_client()
        await self.do_release(r, team_id, execution_id)

    async def cleanup_stale_slots(self) -> int:
        """Scan active slots and release any whose execution is in a terminal state.

        Should be called periodically (e.g. every 60s via APScheduler or BackgroundTasks).

        Returns:
            Number of stale slots cleaned up.
        """
        from sqlalchemy import select as sa_select

        from src.executions.models import ExecutionRun, ExecutionStatus
        from src.infra.database import async_session_maker

        terminal_statuses = {
            ExecutionStatus.COMPLETED,
            ExecutionStatus.FAILED,
            ExecutionStatus.STOPPED,
        }

        r = await self.get_client()
        cleaned = 0

        members = await r.smembers("scheduler:active_slots")
        if not members:
            return 0

        # Batch-check execution statuses in DB
        async with async_session_maker() as session:
            result = await session.execute(
                sa_select(ExecutionRun.id, ExecutionRun.status).where(
                    ExecutionRun.id.in_(list(members))
                )
            )
            rows = result.all()

        status_map = {row[0]: row[1] for row in rows}

        for exec_id in members:
            status = status_map.get(exec_id)
            # If execution not found in DB or in terminal state → stale
            if status is None or status in terminal_statuses:
                # We need to recover the team_id from the slot key
                slot_data = await r.get(f"scheduler:slot:{exec_id}")
                if slot_data:
                    team_id = slot_data
                    await self.do_release(r, team_id, exec_id)
                    cleaned += 1
                    logger.info(
                        "Cleaned stale slot: execution=%s team=%s status=%s",
                        exec_id, team_id, status,
                    )
                else:
                    # Slot key already expired (TTL), just remove from set
                    await r.srem("scheduler:active_slots", exec_id)
                    cleaned += 1

        if cleaned:
            logger.info("Stale slot cleanup: removed %d slots", cleaned)
        return cleaned

    async def get_status(self) -> dict:
        """Get current scheduler status for monitoring."""
        r = await self.get_client()
        global_count = int(await r.get("scheduler:global") or 0)
        active_count = await r.scard("scheduler:active_slots")
        return {
            "global_current": global_count,
            "global_max": self._global_max,
            "active_slots": active_count,
        }

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    async def try_acquire(
        self, r: redis.Redis, team_id: str, execution_id: str
    ) -> bool:
        """Atomically try to acquire both global and team semaphores.

        Uses a Lua script so the INCR/check/DECR sequence is executed
        atomically on the Redis server, preventing race conditions.
        """
        global_key = "scheduler:global"
        team_key = f"scheduler:team:{team_id}"
        slot_key = f"scheduler:slot:{execution_id}"

        result = await r.eval(
            self._ACQUIRE_LUA,
            4,  # number of KEYS
            global_key, team_key, slot_key, "scheduler:active_slots",
            self._global_max, self._team_max, self._slot_ttl,
            team_id, execution_id,
        )

        acquired = bool(result[0])
        global_count = int(result[1])
        team_count = int(result[2])

        if acquired:
            logger.debug(
                "Acquired slot: execution=%s team=%s (global=%d/%d, team=%d/%d)",
                execution_id, team_id, global_count, self._global_max,
                team_count, self._team_max,
            )
        else:
            logger.warning(
                "Backpressure: limit reached for execution %s "
                "(global=%d/%d, team=%d/%d)",
                execution_id, global_count, self._global_max,
                team_count, self._team_max,
            )

        return acquired

    async def do_release(
        self, r: redis.Redis, team_id: str, execution_id: str
    ) -> None:
        """Atomically release semaphores and clean up slot tracking.

        Uses a Lua script to ensure counters never go below 0 and
        all cleanup happens in a single atomic operation.
        """
        global_key = "scheduler:global"
        team_key = f"scheduler:team:{team_id}"
        slot_key = f"scheduler:slot:{execution_id}"

        await r.eval(
            self._RELEASE_LUA,
            4,  # number of KEYS
            global_key, team_key, slot_key, "scheduler:active_slots",
            execution_id,
        )

        logger.debug(
            "Released slot: execution=%s team=%s",
            execution_id, team_id,
        )


# Module-level singleton
fair_scheduler = FairScheduler()
