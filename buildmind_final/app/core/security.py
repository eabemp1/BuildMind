"""JWT and password security helpers."""

import os
import base64
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import jwt, JWTError

from app.core.config import get_settings

settings = get_settings()
JWT_SECRET_KEY = settings.JWT_SECRET or settings.SECRET_KEY
JWT_ALGORITHM = settings.JWT_ALGORITHM
JWT_EXPIRE_MINUTES = settings.JWT_EXPIRE_MINUTES
PWD_ITERATIONS = settings.PWD_ITERATIONS


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PWD_ITERATIONS)
    return f"pbkdf2_sha256${PWD_ITERATIONS}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        algo, iter_s, salt_b64, digest_b64 = hashed_password.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        iters = int(iter_s)
        salt = base64.b64decode(salt_b64.encode())
        expected = base64.b64decode(digest_b64.encode())
        got = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt, iters)
        return hmac.compare_digest(got, expected)
    except Exception:
        return False


def create_access_token(subject: str, expires_minutes: Optional[int] = None) -> str:
    now = datetime.now(timezone.utc)
    exp_minutes = expires_minutes if expires_minutes is not None else JWT_EXPIRE_MINUTES
    payload = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=exp_minutes)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None
    sub = payload.get("sub")
    return str(sub) if sub else None


