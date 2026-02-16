"""Compatibility shim.

Legacy imports should continue to use `app.legacy`, while the implementation
now lives in `app.runtime` to keep this file small and maintainable.
"""

from app.runtime import *  # noqa: F401,F403

if __name__ == "__main__":
    from app.runtime import log_event, uvicorn

    log_event(20, "server_starting")
    log_event(20, "server_open", url="http://127.0.0.1:8000")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
