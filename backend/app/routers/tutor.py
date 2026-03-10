from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..schemas.tutor import (
    ChatRequest,
    ChatResponse,
    ConversationMessagesResponse,
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


@router.get("/conversations/{conversation_id}/messages", response_model=ConversationMessagesResponse)
def conversation_messages(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return tutor_service.get_conversation_messages(db, current_user.id, conversation_id)


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tutor_service.delete_conversation(db, current_user.id, conversation_id)


@router.post("/documents", response_model=DocumentResponse, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("professor", "admin")),
):
    # Resolve course_id: from professor's course, or None (global)
    course_id = current_user.course_id
    if not course_id:
        from ..models.course import Course
        course = db.query(Course).filter(Course.professor_id == current_user.id).first()
        course_id = course.id if course else None

    return await tutor_service.upload_document(db, current_user.id, course_id, file)


@router.get("/documents", response_model=list[DocumentResponse])
def list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    course_id = current_user.course_id
    if not course_id:
        from ..models.course import Course
        course = db.query(Course).filter(Course.professor_id == current_user.id).first()
        course_id = course.id if course else None

    return tutor_service.get_documents(db, course_id)


@router.get("/documents/{document_id}/download")
def download_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = tutor_service.get_document_for_download(db, document_id)
    return FileResponse(
        path=doc["file_path"],
        filename=doc["filename"],
        media_type="application/pdf",
    )


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("professor", "admin")),
):
    tutor_service.delete_document(db, current_user.id, document_id)


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
