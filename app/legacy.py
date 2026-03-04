"""Compatibility shim for legacy imports."""

from app.agent import runtime as _runtime


def __getattr__(name):
    return getattr(_runtime, name)
