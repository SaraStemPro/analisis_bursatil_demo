"""Seed script: creates an initial professor, course, and student for development."""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal, engine, Base
from app.models.user import User
from app.models.course import Course
from app.utils.auth import hash_password

Base.metadata.create_all(bind=engine)

db = SessionLocal()

# Check if already seeded
if db.query(User).filter(User.email == "profesor@demo.com").first():
    print("Ya existe datos de seed. Usuarios disponibles:")
    print("  Profesor: profesor@demo.com / Demo1234")
    print("  Alumna:   sara@demo.com / Demo1234")
    print("  Código de invitación: DEMO2025")
    db.close()
    sys.exit(0)

# Create professor
prof = User(
    email="profesor@demo.com",
    password_hash=hash_password("Demo1234"),
    name="Profesor Demo",
    role="professor",
)
db.add(prof)
db.flush()

# Create course with invite code
course = Course(
    name="Análisis Bursátil - Máster Demo",
    professor_id=prof.id,
    invite_code="DEMO2025",
)
db.add(course)
db.flush()

# Create student
student = User(
    email="sara@demo.com",
    password_hash=hash_password("Demo1234"),
    name="Sara",
    role="student",
    course_id=course.id,
)
db.add(student)

db.commit()
db.close()

print("Seed completado. Usuarios creados:")
print("  Profesor: profesor@demo.com / Demo1234")
print("  Alumna:   sara@demo.com / Demo1234")
print("  Código de invitación: DEMO2025 (para registrar más alumnos)")
