import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.course import Course
from ..models.user import User
from ..schemas.auth import (
    InviteCreateRequest,
    InviteResponse,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from ..utils.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    require_role,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un usuario con este email",
        )

    course = db.query(Course).filter(Course.invite_code == body.invite_code).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Código de invitación no válido",
        )

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        name=body.name,
        role="student",
        course_id=course.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email o contraseña incorrectos",
        )

    token = create_access_token(user.id, user.role)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/invite", response_model=InviteResponse, status_code=status.HTTP_201_CREATED)
def create_invite(
    body: InviteCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("professor", "admin")),
):
    course = db.query(Course).filter(Course.id == str(body.course_id)).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Curso no encontrado",
        )

    if course.professor_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos sobre este curso",
        )

    new_code = uuid.uuid4().hex[:8].upper()
    course.invite_code = new_code
    db.commit()
    db.refresh(course)

    return InviteResponse(
        invite_code=course.invite_code,
        course_id=uuid.UUID(course.id),
        created_at=course.created_at,
    )
