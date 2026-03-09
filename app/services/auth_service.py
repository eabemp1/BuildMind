"""Authentication service."""

from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password, create_access_token
from app.models import User
from app.services.buildmind_service import subscribe_newsletter


def register_user(db: Session, email: str, password: str, username: str | None = None) -> User:
    existing = db.query(User).filter(User.email == email.lower()).first()
    if existing:
        raise ValueError("Email already registered")
    if username:
        name_taken = db.query(User).filter(User.username == username.strip().lower()).first()
        if name_taken:
            raise ValueError("Username already taken")
    hashed = hash_password(password)
    user = User(
        email=email.lower(),
        username=(username.strip().lower() if username else None),
        hashed_password=hashed,
        password_hash=hashed,
    )
    db.add(user)
    db.flush()
    subscribe_newsletter(db, email=user.email)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    user = db.query(User).filter(User.email == email.lower()).first()
    if not user:
        return None
    stored = user.password_hash or user.hashed_password
    if not stored:
        return None
    if not verify_password(password, stored):
        return None
    return user


def issue_token_for_user(user: User) -> str:
    return create_access_token(subject=str(user.id))


def update_user_profile(
    db: Session,
    user_id: int,
    username: str | None = None,
    bio: str | None = None,
    avatar_url: str | None = None,
    onboarding_completed: bool | None = None,
) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError("User not found")

    if username is not None:
        normalized = username.strip().lower()
        if normalized:
            exists = db.query(User).filter(User.username == normalized, User.id != user_id).first()
            if exists:
                raise ValueError("Username already taken")
            user.username = normalized
        else:
            user.username = None

    if bio is not None:
        user.bio = bio
    if avatar_url is not None:
        user.avatar_url = avatar_url
    if onboarding_completed is not None:
        user.onboarding_completed = onboarding_completed

    db.add(user)
    db.flush()
    return user


def change_user_password(db: Session, user_id: int, current_password: str, new_password: str) -> None:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError("User not found")
    stored = user.password_hash or user.hashed_password
    if not stored or not verify_password(current_password, stored):
        raise ValueError("Invalid current password")
    hashed = hash_password(new_password)
    user.password_hash = hashed
    user.hashed_password = hashed
    db.add(user)
    db.flush()


def delete_user_self(db: Session, user_id: int) -> None:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError("User not found")
    db.delete(user)
    db.flush()



