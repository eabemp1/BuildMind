"""Structured logging configuration for API runtime."""

import logging
import time

from app.core.config import get_settings


def configure_logging() -> None:
    settings = get_settings()
    level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
    logging.basicConfig(
        level=level,
        format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
    )


def request_log_line(method: str, path: str, status_code: int, duration_s: float) -> str:
    return (
        f'event=request method={method} path="{path}" status={status_code} '
        f'duration_ms={round(duration_s * 1000, 2)}'
    )


def duration_from(start_ts: float) -> float:
    return max(0.0, time.perf_counter() - start_ts)
