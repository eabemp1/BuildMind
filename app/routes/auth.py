from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import User
from app.schemas.auth import RegisterRequest, LoginRequest
from app.schemas.auth import PasswordChangeRequest, ProfileUpdateRequest
from app.services.auth_service import (
    authenticate_user,
    change_user_password,
    delete_user_self,
    issue_token_for_user,
    register_user,
    update_user_profile,
)


router = APIRouter(tags=["auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
@router.post("/auth/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    try:
        user = register_user(db, email=payload.email, password=payload.password, username=payload.username)
        db.commit()
        db.refresh(user)
        return {
            "success": True,
            "data": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "bio": user.bio,
                "avatar_url": user.avatar_url,
                "onboarding_completed": user.onboarding_completed,
                "role": "admin" if user.is_admin else "user",
                "created_at": user.created_at,
            },
        }
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/login")
@router.post("/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, email=payload.email, password=payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account suspended")
    return {
        "success": True,
        "data": {
            "access_token": issue_token_for_user(user),
            "token_type": "bearer",
        },
    }


@router.post("/auth/logout")
def logout():
    return {"success": True, "data": {"message": "Logged out"}}


@router.post("/auth/password-reset")
def password_reset_request():
    return {"success": True, "data": {"message": "Password reset flow initialized"}}


@router.get("/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "success": True,
        "data": {
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email,
            "bio": current_user.bio,
            "avatar_url": current_user.avatar_url,
            "onboarding_completed": current_user.onboarding_completed,
            "role": "admin" if current_user.is_admin else "user",
            "created_at": current_user.created_at,
        },
    }


@router.patch("/auth/me")
def patch_me(
    payload: ProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        user = update_user_profile(
            db,
            user_id=current_user.id,
            username=payload.username,
            bio=payload.bio,
            avatar_url=payload.avatar_url,
            onboarding_completed=payload.onboarding_completed,
        )
        db.commit()
        return {
            "success": True,
            "data": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "bio": user.bio,
                "avatar_url": user.avatar_url,
                "onboarding_completed": user.onboarding_completed,
                "role": "admin" if user.is_admin else "user",
                "created_at": user.created_at,
            },
        }
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/auth/change-password")
def change_password(
    payload: PasswordChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        change_user_password(
            db,
            user_id=current_user.id,
            current_password=payload.current_password,
            new_password=payload.new_password,
        )
        db.commit()
        return {"success": True, "data": {"message": "Password updated"}}
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.delete("/auth/me")
def delete_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        delete_user_self(db, user_id=current_user.id)
        db.commit()
        return {"success": True, "data": {"message": "Account deleted"}}
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))



