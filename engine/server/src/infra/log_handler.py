"""Redis-backed log handler for real-time log streaming.

Pushes structured log records into a Redis list as a ring buffer.
Uses an internal buffer to batch writes and reduce Redis round-trips.
"""

import json
import logging
import threading
import time
from datetime import UTC, datetime

import redis as sync_redis

from .redis_utils import get_sync_redis_client


class RedisLogHandler(logging.Handler):
    """Logging handler that pushes records to a Redis list.

    Uses a sync Redis client backed by the shared connection pool.
    Buffers log entries and flushes them in a single pipeline every
    FLUSH_INTERVAL seconds or when BUFFER_SIZE is reached.
    """

    MAX_ENTRIES = 2000
    MAX_BUFFER = 500  # cap retained entries to prevent memory leak on prolonged Redis outage
    REDIS_KEY = "runtime:logs"
    BUFFER_SIZE = 50
    FLUSH_INTERVAL = 2.0  # seconds

    def __init__(self, source: str = "runtime", level: int = logging.DEBUG):
        super().__init__(level)
        self.source = source
        self._client: sync_redis.Redis | None = None
        self._buffer: list[str] = []
        self._lock = threading.Lock()
        self._last_flush = time.monotonic()

    def get_client(self) -> sync_redis.Redis | None:
        if self._client is not None:
            return self._client
        try:
            self._client = get_sync_redis_client()
            return self._client
        except Exception:
            return None

    def emit(self, record: logging.LogRecord) -> None:
        try:
            entry = json.dumps({
                "ts": datetime.now(UTC).isoformat(),
                "level": record.levelname,
                "logger": record.name,
                "message": self.format(record),
                "source": self.source,
            })

            with self._lock:
                self._buffer.append(entry)
                now = time.monotonic()
                should_flush = (
                    len(self._buffer) >= self.BUFFER_SIZE
                    or (now - self._last_flush) >= self.FLUSH_INTERVAL
                )

            if should_flush:
                self.flush()
        except Exception:
            # Never let logging errors propagate
            pass

    def flush(self) -> None:
        """Flush buffered entries to Redis in a single pipeline.

        On Redis failure, entries are kept in the buffer (up to MAX_BUFFER
        to prevent unbounded memory growth). On the next successful flush
        they will be retried.
        """
        with self._lock:
            if not self._buffer:
                return
            entries = self._buffer[:]
            self._last_flush = time.monotonic()

        client = self.get_client()
        if client is None:
            # Keep entries for retry; cap at MAX_BUFFER to prevent memory leak
            with self._lock:
                if len(self._buffer) > self.MAX_BUFFER:
                    self._buffer = self._buffer[-self.MAX_BUFFER:]
            return

        try:
            pipe = client.pipeline(transaction=False)
            for entry in entries:
                pipe.rpush(self.REDIS_KEY, entry)
            pipe.ltrim(self.REDIS_KEY, -self.MAX_ENTRIES, -1)
            pipe.execute()
            # Success — remove flushed entries from buffer
            with self._lock:
                self._buffer = self._buffer[len(entries):]
        except Exception as exc:
            # Keep entries for retry; cap buffer size
            with self._lock:
                if len(self._buffer) > self.MAX_BUFFER:
                    dropped = len(self._buffer) - self.MAX_BUFFER
                    self._buffer = self._buffer[-self.MAX_BUFFER:]
                    # Use stderr logging to avoid recursion
                    import sys
                    print(
                        f"[RedisLogHandler] flush failed ({exc}), "
                        f"dropped {dropped} log entries",
                        file=sys.stderr,
                    )

    def close(self) -> None:
        """Flush remaining entries before closing."""
        self.flush()
        super().close()
