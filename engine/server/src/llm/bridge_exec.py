"""Docker exec utilities for the Claude Bridge sidecar container."""

import asyncio
import logging

logger = logging.getLogger(__name__)

CONTAINER_NAME = "mm-claude-bridge"


def _get_docker_client():
    import docker

    client = docker.from_env()
    client.ping()
    return client


async def is_bridge_available() -> bool:
    try:
        client = await asyncio.to_thread(_get_docker_client)
        container = await asyncio.to_thread(
            client.containers.get, CONTAINER_NAME
        )
        return container.status == "running"
    except Exception:
        return False


async def exec_in_bridge(command: list[str]) -> str:
    client = _get_docker_client()
    container = client.containers.get(CONTAINER_NAME)

    exec_id = await asyncio.to_thread(
        client.api.exec_create,
        container.id,
        command,
        stdin=False,
        tty=False,
    )
    output = await asyncio.to_thread(
        client.api.exec_start,
        exec_id,
        stream=False,
    )
    return output.decode("utf-8", errors="replace")
