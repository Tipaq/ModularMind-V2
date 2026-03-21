"""Service layer for scheduled task CRUD operations."""

import math
from uuid import uuid4

from sqlalchemy import func, select

from src.infra.database import async_session_maker
from src.infra.utils import utcnow
from src.scheduled_tasks.models import ScheduledTask, ScheduledTaskRun
from src.scheduled_tasks.schemas import (
    ScheduledTaskCreate,
    ScheduledTaskUpdate,
    compute_next_run_at,
)


async def list_tasks(
    search: str = "",
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """List scheduled tasks with pagination and search."""
    async with async_session_maker() as session:
        query = select(ScheduledTask).order_by(ScheduledTask.updated_at.desc())

        if search:
            pattern = f"%{search}%"
            query = query.where(ScheduledTask.name.ilike(pattern))

        count_query = select(func.count()).select_from(query.subquery())
        total = (await session.execute(count_query)).scalar() or 0

        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)
        result = await session.execute(query)
        items = list(result.scalars().all())

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, math.ceil(total / page_size)),
        }


async def get_task(task_id: str) -> ScheduledTask | None:
    """Get a scheduled task by ID."""
    async with async_session_maker() as session:
        result = await session.execute(
            select(ScheduledTask).where(ScheduledTask.id == task_id)
        )
        return result.scalar_one_or_none()


async def create_task(data: ScheduledTaskCreate) -> ScheduledTask:
    """Create a new scheduled task."""
    next_run = compute_next_run_at(
        data.schedule_type, data.interval_value, data.interval_unit, data.scheduled_at,
    )
    async with async_session_maker() as session:
        task = ScheduledTask(
            id=str(uuid4()),
            name=data.name,
            description=data.description,
            schedule_type=data.schedule_type,
            interval_value=data.interval_value,
            interval_unit=data.interval_unit,
            scheduled_at=data.scheduled_at,
            next_run_at=next_run,
            target_type=data.target_type,
            target_id=data.target_id,
            input_text=data.input_text,
            config=data.config,
            tags=data.tags,
        )
        session.add(task)
        await session.commit()
        await session.refresh(task)
        return task


async def update_task(task_id: str, data: ScheduledTaskUpdate) -> ScheduledTask | None:
    """Update a scheduled task. Returns None if not found."""
    async with async_session_maker() as session:
        result = await session.execute(
            select(ScheduledTask).where(ScheduledTask.id == task_id)
        )
        task = result.scalar_one_or_none()
        if not task:
            return None

        if data.name is not None:
            task.name = data.name
        if data.description is not None:
            task.description = data.description
        if data.enabled is not None:
            task.enabled = data.enabled
        if data.schedule_type is not None:
            task.schedule_type = data.schedule_type
        if data.interval_value is not None:
            task.interval_value = data.interval_value
        if data.interval_unit is not None:
            task.interval_unit = data.interval_unit
        if data.scheduled_at is not None:
            task.scheduled_at = data.scheduled_at
        if data.target_type is not None:
            task.target_type = data.target_type
        if data.target_id is not None:
            task.target_id = data.target_id
        if data.input_text is not None:
            task.input_text = data.input_text
        if data.config is not None:
            task.config = data.config
        if data.tags is not None:
            task.tags = data.tags

        # Recompute next_run_at if schedule changed
        schedule_changed = any([
            data.schedule_type is not None,
            data.interval_value is not None,
            data.interval_unit is not None,
            data.scheduled_at is not None,
        ])
        if schedule_changed:
            task.next_run_at = compute_next_run_at(
                task.schedule_type, task.interval_value, task.interval_unit, task.scheduled_at,
            )

        task.version += 1
        task.updated_at = utcnow()
        await session.commit()
        await session.refresh(task)
        return task


async def delete_task(task_id: str) -> bool:
    """Delete a scheduled task. Returns True if deleted."""
    async with async_session_maker() as session:
        result = await session.execute(
            select(ScheduledTask).where(ScheduledTask.id == task_id)
        )
        task = result.scalar_one_or_none()
        if not task:
            return False
        await session.delete(task)
        await session.commit()
        return True


async def duplicate_task(task_id: str) -> ScheduledTask | None:
    """Duplicate a scheduled task. Returns None if source not found."""
    async with async_session_maker() as session:
        result = await session.execute(
            select(ScheduledTask).where(ScheduledTask.id == task_id)
        )
        source = result.scalar_one_or_none()
        if not source:
            return None

        copy = ScheduledTask(
            id=str(uuid4()),
            name=f"{source.name} (copy)",
            description=source.description,
            enabled=False,
            schedule_type=source.schedule_type,
            interval_value=source.interval_value,
            interval_unit=source.interval_unit,
            scheduled_at=source.scheduled_at,
            target_type=source.target_type,
            target_id=source.target_id,
            input_text=source.input_text,
            config=dict(source.config) if source.config else {},
            tags=list(source.tags) if source.tags else [],
        )
        session.add(copy)
        await session.commit()
        await session.refresh(copy)
        return copy


async def get_task_runs(
    task_id: str,
    limit: int = 20,
    offset: int = 0,
) -> list[ScheduledTaskRun]:
    """Get run history for a scheduled task."""
    async with async_session_maker() as session:
        result = await session.execute(
            select(ScheduledTaskRun)
            .where(ScheduledTaskRun.scheduled_task_id == task_id)
            .order_by(ScheduledTaskRun.created_at.desc())
            .limit(min(limit, 100))
            .offset(offset)
        )
        return list(result.scalars().all())
