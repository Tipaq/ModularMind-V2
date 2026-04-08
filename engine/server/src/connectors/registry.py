"""Adapter registry — maps connector types to platform adapters.

Two-tier lookup:
1. Builtin adapters registered at startup (Slack, Teams, etc.)
2. Spec-based adapter for custom/AI-generated connector types
"""

from __future__ import annotations  # noqa: I001

from src.connectors.adapters.base import ConnectorTypeMeta, PlatformAdapter


_ADAPTER_MAP: dict[str, PlatformAdapter] = {}


def register_adapter(type_id: str, adapter: PlatformAdapter) -> None:
    """Register a builtin platform adapter for a connector type."""
    _ADAPTER_MAP[type_id] = adapter


def get_adapter(type_id: str) -> PlatformAdapter | None:
    """Look up the adapter for a connector type.

    Returns the builtin adapter if registered, otherwise None.
    For custom types, use get_or_create_adapter() with the connector.
    """
    return _ADAPTER_MAP.get(type_id)


def get_or_create_adapter(
    type_id: str, spec: dict | None = None
) -> PlatformAdapter | None:
    """Look up adapter with spec-based fallback.

    1. Check builtin adapter map
    2. If not found and spec has inbound config, create SpecBasedAdapter
    """
    builtin = _ADAPTER_MAP.get(type_id)
    if builtin:
        return builtin

    if spec and spec.get("inbound", {}).get("webhook"):
        from src.connectors.adapters.spec_adapter import SpecBasedAdapter

        return SpecBasedAdapter(spec)

    return None


def all_connector_types() -> list[ConnectorTypeMeta]:
    """Return metadata for all registered builtin connector types."""
    return [adapter.metadata() for adapter in _ADAPTER_MAP.values()]


def registered_type_ids() -> frozenset[str]:
    """Return all registered builtin connector type IDs."""
    return frozenset(_ADAPTER_MAP.keys())
