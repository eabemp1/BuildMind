"""Entrypoint compatibility shim.

The full backend implementation lives in `app.runtime`.
This module keeps existing imports and startup commands working.
"""

from app.runtime import *  # noqa: F401,F403


if __name__ == "__main__":
    from app.runtime import log_event, uvicorn

    log_event(20, "server_starting")
    log_event(20, "server_open", url="http://127.0.0.1:8000")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
