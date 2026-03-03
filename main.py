"""Entrypoint compatibility shim.

The full backend implementation lives in `app.main`.
This module keeps existing imports and startup commands working.
"""

try:
    from app.main import *  # noqa: F401,F403
except ModuleNotFoundError as e:
    missing = str(getattr(e, "name", "") or "").strip()
    if missing:
        raise SystemExit(
            f"Missing dependency: {missing}. "
            "Activate the project venv and run again, or install requirements:\n"
            "  venv\\Scripts\\activate\n"
            "  pip install -r requirements.txt\n"
            "  python main.py"
        ) from e
    raise


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
