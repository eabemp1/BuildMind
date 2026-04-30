"""Tests for app/execution/scoring.py — execution score calculation.

Runs entirely in-memory with SQLite. No external services or API keys needed.
Covers score maths, edge cases, and the weekly snapshot upsert logic.
"""

import pytest
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.database import Base
from app.models import User, Project, Milestone, Task, Feedback, ExecutionScoreHistory
from app.execution.scoring import (
    calculate_score_components,
    calculate_execution_score,
    store_weekly_score,
)

# ── Engine / session fixtures ─────────────────────────────────────────────────

TEST_DB_URL = "sqlite:///:memory:"


@pytest.fixture(scope="module")
def engine():
    e = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=e)
    yield e
    Base.metadata.drop_all(bind=e)


@pytest.fixture
def db(engine):
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = SessionLocal()
    yield session
    session.rollback()
    session.close()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _user(db: Session, name: str = "u") -> User:
    u = User(username=name, email=f"{name}@test.com", password_hash="x", is_active=True)
    db.add(u); db.flush(); return u

def _project(db: Session, user_id: int) -> Project:
    p = Project(user_id=user_id, title="P", progress=0)
    db.add(p); db.flush(); return p

def _milestone(db: Session, project_id: int, completed: bool = False) -> Milestone:
    ms = Milestone(project_id=project_id, title="M", is_completed=completed, week_number=1)
    if completed:
        ms.completed_at = datetime.now(timezone.utc)
    db.add(ms); db.flush(); return ms

def _task(db: Session, milestone_id: int, completed: bool = False,
          completed_at: datetime | None = None) -> Task:
    t = Task(milestone_id=milestone_id, description="do", is_completed=completed,
             completed_at=completed_at if completed else None)
    db.add(t); db.flush(); return t


# ── Score component tests ─────────────────────────────────────────────────────

def test_all_zeros_for_new_user(db):
    u = _user(db, "new")
    c = calculate_score_components(db, u.id)
    assert c["task_completion_rate"] == 0.0
    assert c["weekly_consistency"] == 0.0
    assert c["execution_velocity"] == 0.0
    assert c["focus_score"] == 0.0
    assert c["milestone_completion_rate"] == 0.0
    assert c["feedback_positivity_ratio"] == 0.0


def test_100_percent_task_completion(db):
    u = _user(db, "full")
    p = _project(db, u.id)
    ms = _milestone(db, p.id, completed=True)
    now = datetime.now(timezone.utc)
    for _ in range(5):
        _task(db, ms.id, completed=True, completed_at=now)
    c = calculate_score_components(db, u.id)
    assert c["task_completion_rate"] == 1.0
    assert c["milestone_completion_rate"] == 1.0


def test_partial_task_completion(db):
    u = _user(db, "partial")
    p = _project(db, u.id)
    ms = _milestone(db, p.id)
    now = datetime.now(timezone.utc)
    _task(db, ms.id, completed=True, completed_at=now)
    _task(db, ms.id, completed=True, completed_at=now)
    _task(db, ms.id, completed=False)
    c = calculate_score_components(db, u.id)
    assert c["task_completion_rate"] == pytest.approx(2 / 3, abs=0.01)


def test_weekly_consistency_counts_distinct_iso_weeks(db):
    u = _user(db, "consist")
    p = _project(db, u.id)
    ms = _milestone(db, p.id)
    now = datetime.now(timezone.utc)
    # Complete tasks in 3 distinct weeks within the last 4 weeks
    for weeks_ago in [0, 1, 2]:
        _task(db, ms.id, completed=True, completed_at=now - timedelta(weeks=weeks_ago))
    c = calculate_score_components(db, u.id)
    # 3 / 4 = 0.75
    assert c["weekly_consistency"] == pytest.approx(0.75, abs=0.01)


def test_old_completions_excluded_from_consistency(db):
    """Tasks completed more than 28 days ago should not count toward consistency."""
    u = _user(db, "stale")
    p = _project(db, u.id)
    ms = _milestone(db, p.id)
    old = datetime.now(timezone.utc) - timedelta(days=35)
    _task(db, ms.id, completed=True, completed_at=old)
    c = calculate_score_components(db, u.id)
    assert c["weekly_consistency"] == 0.0


def test_focus_score_one_when_all_work_in_single_milestone(db):
    u = _user(db, "focus")
    p = _project(db, u.id)
    ms1 = _milestone(db, p.id)
    _milestone(db, p.id)          # ms2 — no completed tasks
    now = datetime.now(timezone.utc)
    for _ in range(4):
        _task(db, ms1.id, completed=True, completed_at=now)
    c = calculate_score_components(db, u.id)
    assert c["focus_score"] == 1.0


def test_focus_score_splits_across_milestones(db):
    u = _user(db, "split")
    p = _project(db, u.id)
    ms1 = _milestone(db, p.id)
    ms2 = _milestone(db, p.id)
    now = datetime.now(timezone.utc)
    for _ in range(3):
        _task(db, ms1.id, completed=True, completed_at=now)
    for _ in range(1):
        _task(db, ms2.id, completed=True, completed_at=now)
    c = calculate_score_components(db, u.id)
    # top bucket = 3 out of 4 total → 0.75
    assert c["focus_score"] == pytest.approx(0.75, abs=0.01)


def test_feedback_positivity_ratio(db):
    u = _user(db, "fbk")
    p = _project(db, u.id)
    for _ in range(3):
        db.add(Feedback(project_id=p.id, user_id=u.id, feedback_type="positive"))
    for _ in range(1):
        db.add(Feedback(project_id=p.id, user_id=u.id, feedback_type="negative"))
    db.flush()
    c = calculate_score_components(db, u.id)
    assert c["feedback_positivity_ratio"] == pytest.approx(0.75, abs=0.01)


# ── calculate_execution_score ─────────────────────────────────────────────────

def test_perfect_score_is_100():
    perfect = {k: 1.0 for k in [
        "task_completion_rate", "weekly_consistency", "execution_velocity",
        "focus_score", "milestone_completion_rate", "feedback_positivity_ratio",
    ]}
    assert calculate_execution_score(perfect) == 100.0


def test_zero_score_is_0():
    zeroes = {k: 0.0 for k in [
        "task_completion_rate", "weekly_consistency", "execution_velocity",
        "focus_score", "milestone_completion_rate", "feedback_positivity_ratio",
    ]}
    assert calculate_execution_score(zeroes) == 0.0


def test_task_completion_weight_is_30_percent():
    # Only task_completion_rate = 1.0, everything else 0 → score = 30
    c = {
        "task_completion_rate": 1.0,
        "weekly_consistency": 0.0,
        "execution_velocity": 0.0,
        "focus_score": 0.0,
        "milestone_completion_rate": 0.0,
        "feedback_positivity_ratio": 0.0,
    }
    assert calculate_execution_score(c) == pytest.approx(30.0, abs=0.1)


# ── store_weekly_score ────────────────────────────────────────────────────────

def test_store_creates_record(db):
    u = _user(db, "store")
    row = store_weekly_score(db, u.id, 72.5)
    db.commit()
    assert row.user_id == u.id
    assert row.score == pytest.approx(72.5)


def test_store_upserts_within_same_week(db):
    u = _user(db, "upsert")
    store_weekly_score(db, u.id, 50.0)
    db.commit()
    store_weekly_score(db, u.id, 65.0)
    db.commit()
    rows = db.query(ExecutionScoreHistory).filter_by(user_id=u.id).all()
    assert len(rows) == 1, "Should upsert, not insert a duplicate row in the same week"
    assert rows[0].score == pytest.approx(65.0)
