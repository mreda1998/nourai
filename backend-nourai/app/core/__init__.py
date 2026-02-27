"""Core module containing configuration and exceptions."""

# Only export config here — security imports db/session and must be imported
# directly by API route modules to avoid a circular dependency chain:
#   db/session → core/__init__ → security → db/session
from app.core.config import settings, get_settings

__all__ = [
    "settings",
    "get_settings",
]
