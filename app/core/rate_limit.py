"""Shared rate-limiter instance for the platform API.

Usage in a route file:
    from app.core.rate_limit import limiter
    from slowapi.util import get_remote_address

    @router.post("/ai/coach")
    @limiter.limit("20/minute")
    def ai_coach_endpoint(request: Request, ...):
        ...

Register the limiter and its error handler in app/main.py (already done).
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
