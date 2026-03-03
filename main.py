"""Entrypoint compatibility shim.

Expose the unified EvolvAI OS app while preserving legacy module behavior.
"""

import sys

import backend.app.main as unified_main
import backend.app.agent.runtime as runtime


# Single app object for both execution + agent routes.
app = unified_main.app
runtime.app = app

# Keep legacy monkeypatch/test behavior by aliasing `main` to runtime module.
sys.modules[__name__] = runtime


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=True)
