"""Setup wizard router.

Public endpoints — no authentication required.
POST /initialize self-locks after the first owner user is created.
"""

import logging

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import IntegrityError

from src.infra.config import get_settings
from src.infra.database import DbSession

from .schemas import SetupInitialize, SetupResponse, SetupStatus
from .service import initialize_runtime, is_initialized

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/setup", tags=["Setup"])


@router.get("/status", response_model=SetupStatus)
async def get_setup_status(db: DbSession) -> SetupStatus:
    """Check if the runtime has been initialized.

    Public endpoint — no auth required. Used by the dashboard
    to decide whether to show /setup or /login.
    """
    initialized = await is_initialized(db)
    return SetupStatus(
        initialized=initialized,
        runtime_mode=settings.RUNTIME_MODE,
        version=settings.APP_VERSION,
    )


@router.post("/initialize", response_model=SetupResponse)
async def initialize(data: SetupInitialize, db: DbSession) -> SetupResponse:
    """Create the first owner user and initialize the runtime.

    This endpoint is only callable once. After an owner user exists,
    it returns 409 Conflict.
    """
    if await is_initialized(db):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Runtime is already initialized",
        )

    try:
        user = await initialize_runtime(
            db=db,
            email=data.email,
            password=data.password,
            runtime_name=data.runtime_name,
            default_provider=data.default_provider,
            config_dir=settings.CONFIG_DIR,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except IntegrityError:
        # Race condition: another request initialized while we were processing
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Runtime is already initialized",
        )

    logger.info("Setup complete: admin=%s, runtime=%s", data.email, data.runtime_name)

    return SetupResponse(
        message="Runtime initialized successfully",
        email=user.email,
        runtime_name=data.runtime_name,
    )
