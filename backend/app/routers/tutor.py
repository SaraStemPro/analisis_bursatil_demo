from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..schemas.tutor import (
    ChatRequest,
    ChatResponse,
    ConversationResponse,
    DocumentResponse,
    FAQResponse,
)
from ..services import tutor_service
from ..utils.auth import get_current_user, require_role

router = APIRouter(prefix="/api/tutor", tags=["tutor"])


@router.post("/chat", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return tutor_service.chat(db, current_user.id, body)


@router.get("/conversations", response_model=list[ConversationResponse])
def conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return tutor_service.get_conversations(db, current_user.id)


@router.post("/documents", response_model=DocumentResponse, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("professor", "admin")),
):
    if not current_user.course_id:
        from ..models.course import Course
        course = db.query(Course).filter(Course.professor_id == current_user.id).first()
        if not course:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No tienes un curso asignado",
            )
        course_id = course.id
    else:
        course_id = current_user.course_id

    return await tutor_service.upload_document(db, current_user.id, course_id, file)


@router.get("/documents", response_model=list[DocumentResponse])
def list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.course_id:
        from ..models.course import Course
        course = db.query(Course).filter(Course.professor_id == current_user.id).first()
        course_id = course.id if course else None
    else:
        course_id = current_user.course_id

    if not course_id:
        return []

    return tutor_service.get_documents(db, course_id)


@router.get("/faq", response_model=FAQResponse)
def faq(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("professor", "admin")),
):
    from ..models.course import Course
    course = db.query(Course).filter(Course.professor_id == current_user.id).first()
    if not course:
        return FAQResponse(items=[])
    return tutor_service.get_faq(db, course.id)
