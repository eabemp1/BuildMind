"""Authentication service."""

from sqlalchemy.orm import Session

from backend.app.core.security import hash_password, verify_password, create_access_token
from backend.app.models import User


def register_user(db: Session, email: str, password: str) -> User:
    existing = db.query(User).filter(User.email == email.lower()).first()
    if existing:
        raise ValueError("Email already registered")
    user = User(email=email.lower(), hashed_password=hash_password(password))
    db.add(user)
    db.flush()
    return user


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    user = db.query(User).filter(User.email == email.lower()).first()
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def issue_token_for_user(user: User) -> str:
    return create_access_token(subject=str(user.id))


