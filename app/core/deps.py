"""Shared dependencies — auth accepts EITHER Supabase JWT OR internal JWT.

Architecture decision:
  - The frontend uses Supabase for auth (all user sessions).
  - The Python backend is a stateless AI/scoring service.
  - Backend routes that need user identity accept the Supabase JWT,
    validate it via the Supabase service-role key, and resolve the user
    email to a local User row (creating one on first call if needed).
  - Internal JWT (create_access_token) is kept for the legacy /auth/login
    route only. No new code should depend on it.
"""

from __future__ import annotations

import os
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.database import get_db
from app.models import User

_bearer = HTTPBearer(auto_error=False)

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")


def _verify_supabase_jwt(token: str) -> Optional[dict]:
    """Decode a Supabase-issued JWT using the project JWT secret."""
    if not SUPABASE_JWT_SECRET:
        return None
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        return payload
    except JWTError:
        return None


def _resolve_user_from_email(db: Session, email: str) -> User:
    """Return existing User row for email, or create a stub one."""
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email, is_active=True, onboarding_completed=True)
        db.add(user)
        db.flush()
    return user


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """
    Accept either:
      1. Supabase JWT  — validated against SUPABASE_JWT_SECRET
      2. Internal JWT  — validated against JWT_SECRET (legacy)
    Raises 401 if neither validates.
    """
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token = credentials.credentials

    # --- Try Supabase JWT first ---
    supabase_payload = _verify_supabase_jwt(token)
    if supabase_payload:
        email = supabase_payload.get("email") or (supabase_payload.get("user_metadata") or {}).get("email")
        if email:
            return _resolve_user_from_email(db, str(email))

    # --- Fallback: internal JWT ---
    subject = decode_access_token(token)
    if subject:
        try:
            user_id = int(subject)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            return user

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def get_optional_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User | None:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()

    supabase_payload = _verify_supabase_jwt(token)
    if supabase_payload:
        email = supabase_payload.get("email") or (supabase_payload.get("user_metadata") or {}).get("email")
        if email:
            return _resolve_user_from_email(db, str(email))

    subject = decode_access_token(token)
    if not subject:
        return None
    try:
        user_id = int(subject)
    except ValueError:
        return None
    return db.query(User).filter(User.id == user_id).first()
