"""Fine-tuning provider registry."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .base import FineTuningProvider

_PROVIDERS: dict[str, type[FineTuningProvider]] = {}


def register_ft_provider(name: str, cls: type[FineTuningProvider]) -> None:
    """Register a fine-tuning provider class."""
    _PROVIDERS[name] = cls


def get_ft_provider(name: str, **kwargs) -> FineTuningProvider:
    """Get an instance of a registered fine-tuning provider."""
    if name not in _PROVIDERS:
        raise ValueError(
            f"Unknown fine-tuning provider: {name}. "
            f"Available: {list(_PROVIDERS.keys())}"
        )
    return _PROVIDERS[name](**kwargs)


# Auto-register built-in providers on import
def _register_builtins() -> None:
    from .local_export import LocalExportProvider
    from .openai_ft import OpenAIFineTuningProvider

    register_ft_provider("openai", OpenAIFineTuningProvider)
    register_ft_provider("local_export", LocalExportProvider)


_register_builtins()
