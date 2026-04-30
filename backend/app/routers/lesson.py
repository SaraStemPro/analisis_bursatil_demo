from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.lesson_response import LessonResponse
from ..models.user import User
from ..schemas.lesson import (
    LessonResponseRead,
    LessonResponseUpsert,
    StudentLessonResponse,
)
from ..utils.auth import get_current_user, require_role

router = APIRouter(prefix="/api/lesson", tags=["lesson"])


@router.get("/{lesson_id}/responses", response_model=LessonResponseRead | None)
def get_my_responses(
    lesson_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(LessonResponse)
        .filter(
            LessonResponse.user_id == current_user.id,
            LessonResponse.lesson_id == lesson_id,
        )
        .first()
    )
    if row is None:
        return None
    return LessonResponseRead(
        lesson_id=row.lesson_id,
        data=row.data or {},
        updated_at=row.updated_at,
    )


@router.put("/{lesson_id}/responses", response_model=LessonResponseRead)
def upsert_my_responses(
    lesson_id: str,
    body: LessonResponseUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(LessonResponse)
        .filter(
            LessonResponse.user_id == current_user.id,
            LessonResponse.lesson_id == lesson_id,
        )
        .first()
    )
    if row is None:
        row = LessonResponse(
            user_id=current_user.id,
            lesson_id=lesson_id,
            data=body.data,
        )
        db.add(row)
    else:
        row.data = body.data
    db.commit()
    db.refresh(row)
    return LessonResponseRead(
        lesson_id=row.lesson_id,
        data=row.data or {},
        updated_at=row.updated_at,
    )


@router.get("/{lesson_id}/responses/all", response_model=list[StudentLessonResponse])
def list_all_responses(
    lesson_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_role("professor", "admin")),
):
    """Devuelve todos los alumnos del curso con sus respuestas (o vacío si aún no han contestado)."""
    students = (
        db.query(User)
        .filter(User.role == "student")
        .order_by(User.name)
        .all()
    )
    rows = (
        db.query(LessonResponse)
        .filter(LessonResponse.lesson_id == lesson_id)
        .all()
    )
    by_user = {r.user_id: r for r in rows}
    result: list[StudentLessonResponse] = []
    for s in students:
        r = by_user.get(s.id)
        result.append(
            StudentLessonResponse(
                user_id=s.id,
                user_name=s.name,
                user_email=s.email,
                lesson_id=lesson_id,
                data=r.data if r else {},
                updated_at=r.updated_at if r else None,
            )
        )
    return result
