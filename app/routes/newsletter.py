from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.buildmind import NewsletterSubscriptionOut, NewsletterSubscriptionRequest
from app.services.buildmind_service import subscribe_newsletter, unsubscribe_newsletter


router = APIRouter(tags=["newsletter"])


@router.post("/newsletter/subscribe")
def subscribe(payload: NewsletterSubscriptionRequest, db: Session = Depends(get_db)):
    row = subscribe_newsletter(db, email=payload.email)
    db.commit()
    return {
        "success": True,
        "data": NewsletterSubscriptionOut(
            id=row.id,
            email=row.email,
            subscribed=row.subscribed,
            created_at=row.created_at,
        ).dict(),
    }


@router.post("/newsletter/unsubscribe")
def unsubscribe(payload: NewsletterSubscriptionRequest, db: Session = Depends(get_db)):
    row = unsubscribe_newsletter(db, email=payload.email)
    db.commit()
    return {
        "success": True,
        "data": NewsletterSubscriptionOut(
            id=row.id,
            email=row.email,
            subscribed=row.subscribed,
            created_at=row.created_at,
        ).dict(),
    }
