import os
from typing import Any

import httpx


def capture_event(event: str, properties: dict[str, Any]) -> None:
    api_key = os.getenv("POSTHOG_API_KEY") or os.getenv("NEXT_PUBLIC_POSTHOG_KEY")
    if not api_key:
        return
    host = os.getenv("POSTHOG_HOST") or os.getenv("NEXT_PUBLIC_POSTHOG_HOST") or "https://app.posthog.com"
    distinct_id = str(properties.get("user_id") or "anonymous")
    payload = {
        "api_key": api_key,
        "event": event,
        "distinct_id": distinct_id,
        "properties": properties,
    }
    try:
        httpx.post(f"{host.rstrip('/')}/capture", json=payload, timeout=2.5)
    except Exception:
        # Analytics failures should never break core flows.
        return
