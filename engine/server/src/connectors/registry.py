"""Adapter registry — maps connector types to platform adapters."""

from __future__ import annotations

from src.connectors.adapters.base import ConnectorTypeMeta, PlatformAdapter

_ADAPTER_MAP: dict[str, PlatformAdapter] = {}


def register_adapter(type_id: str, adapter: PlatformAdapter) -> None:
    """Register a platform adapter for a connector type."""
    _ADAPTER_MAP[type_id] = adapter


def get_adapter(type_id: str) -> PlatformAdapter | None:
    """Look up the adapter for a connector type."""
    return _ADAPTER_MAP.get(type_id)


def all_connector_types() -> list[ConnectorTypeMeta]:
    """Return metadata for all registered connector types."""
    return [adapter.metadata() for adapter in _ADAPTER_MAP.values()]


def registered_type_ids() -> frozenset[str]:
    """Return all registered connector type IDs."""
    return frozenset(_ADAPTER_MAP.keys())
