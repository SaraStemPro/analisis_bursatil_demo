import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import settings
from ..models.conversation import Conversation
from ..models.document import Document
from ..models.message import Message
from ..schemas.tutor import (
    ChatRequest,
    ChatResponse,
    ConversationResponse,
    DocumentResponse,
    FAQItem,
    FAQResponse,
    MessageResponse,
    Source,
)
from ..utils.pdf_processor import process_pdf

# Vector store en memoria (FAISS se inicializa lazy)
_vector_store: dict | None = None
_chunks_db: list[dict] = []  # [{text, page, document_id, filename}]


def _get_vector_store():
    """Inicializa o devuelve el vector store FAISS."""
    global _vector_store
    if _vector_store is None:
        try:
            from sentence_transformers import SentenceTransformer
            _vector_store = {
                "model": SentenceTransformer(settings.embedding_model),
                "index": None,
                "initialized": True,
            }
        except Exception:
            _vector_store = {"model": None, "index": None, "initialized": False}
    return _vector_store


def _rebuild_index():
    """Reconstruye el índice FAISS con todos los chunks."""
    global _vector_store, _chunks_db
    vs = _get_vector_store()
    if not vs["initialized"] or not vs["model"] or not _chunks_db:
        return

    try:
        import faiss
        import numpy as np

        texts = [c["text"] for c in _chunks_db]
        embeddings = vs["model"].encode(texts, show_progress_bar=False)
        embeddings = np.array(embeddings, dtype="float32")

        dimension = embeddings.shape[1]
        index = faiss.IndexFlatIP(dimension)
        faiss.normalize_L2(embeddings)
        index.add(embeddings)

        vs["index"] = index
    except Exception:
        vs["index"] = None


def _search_chunks(query: str, top_k: int = 5) -> list[dict]:
    """Busca los chunks más relevantes para una query."""
    vs = _get_vector_store()
    if not vs["initialized"] or not vs["model"] or vs["index"] is None:
        # Fallback: búsqueda por palabras clave
        return _keyword_search(query, top_k)

    try:
        import faiss
        import numpy as np

        query_embedding = vs["model"].encode([query])
        query_embedding = np.array(query_embedding, dtype="float32")
        faiss.normalize_L2(query_embedding)

        scores, indices = vs["index"].search(query_embedding, min(top_k, len(_chunks_db)))

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < len(_chunks_db) and score > 0.1:
                chunk = _chunks_db[idx].copy()
                chunk["score"] = float(score)
                results.append(chunk)
        return results
    except Exception:
        return _keyword_search(query, top_k)


def _keyword_search(query: str, top_k: int = 5) -> list[dict]:
    """Búsqueda simple por coincidencia de palabras."""
    query_words = set(query.lower().split())
    scored = []
    for chunk in _chunks_db:
        chunk_words = set(chunk["text"].lower().split())
        overlap = len(query_words & chunk_words)
        if overlap > 0:
            scored.append((overlap, chunk))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [c for _, c in scored[:top_k]]


def _generate_response(query: str, context_chunks: list[dict], conversation_history: list[dict]) -> str:
    """Genera respuesta usando LLM o fallback."""
    context = "\n\n---\n\n".join(
        f"[{c['filename']}, página {c['page']}]\n{c['text']}" for c in context_chunks
    )

    # Intentar con Anthropic
    if settings.anthropic_api_key:
        try:
            import anthropic

            client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

            messages = []
            for msg in conversation_history[-6:]:
                messages.append({"role": msg["role"], "content": msg["content"]})
            messages.append({"role": "user", "content": query})

            system_prompt = (
                "Eres un tutor de análisis técnico bursátil. Responde basándote en el siguiente material del curso. "
                "Si la información no está en el material, indícalo claramente. "
                "Responde en español, de forma clara y pedagógica.\n\n"
                f"Material del curso:\n{context}"
            )

            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=1024,
                system=system_prompt,
                messages=messages,
            )
            return response.content[0].text
        except Exception:
            pass

    # Intentar con OpenAI
    if settings.openai_api_key:
        try:
            from openai import OpenAI

            client = OpenAI(api_key=settings.openai_api_key)

            messages = [
                {
                    "role": "system",
                    "content": (
                        "Eres un tutor de análisis técnico bursátil. Responde basándote en el siguiente material del curso. "
                        "Si la información no está en el material, indícalo claramente. "
                        "Responde en español, de forma clara y pedagógica.\n\n"
                        f"Material del curso:\n{context}"
                    ),
                }
            ]
            for msg in conversation_history[-6:]:
                messages.append({"role": msg["role"], "content": msg["content"]})
            messages.append({"role": "user", "content": query})

            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                max_tokens=1024,
            )
            return response.choices[0].message.content
        except Exception:
            pass

    # Fallback sin LLM
    if context_chunks:
        response = "He encontrado la siguiente información relevante en los apuntes del curso:\n\n"
        for c in context_chunks[:3]:
            response += f"📄 **{c['filename']}** (página {c['page']}):\n"
            response += f"> {c['text'][:300]}...\n\n"
        response += "\n_Nota: Para respuestas más elaboradas, configura una API key de Anthropic u OpenAI._"
        return response
    else:
        return (
            "No he encontrado información relevante sobre esa pregunta en los apuntes del curso. "
            "¿Podrías reformular la pregunta o preguntar sobre un tema específico del material?"
        )


# ──────────────────────────────────────
# Endpoints públicos
# ──────────────────────────────────────

def chat(db: Session, user_id: str, body: ChatRequest) -> ChatResponse:
    # Obtener o crear conversación
    if body.conversation_id:
        conversation = (
            db.query(Conversation)
            .filter(Conversation.id == str(body.conversation_id), Conversation.user_id == user_id)
            .first()
        )
        if not conversation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversación no encontrada")
    else:
        conversation = Conversation(user_id=user_id)
        db.add(conversation)
        db.commit()
        db.refresh(conversation)

    # Guardar mensaje del usuario
    user_msg = Message(
        conversation_id=conversation.id,
        role="user",
        content=body.message,
    )
    db.add(user_msg)
    db.commit()

    # Obtener historial de la conversación
    history = (
        db.query(Message)
        .filter(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.asc())
        .all()
    )
    conversation_history = [{"role": m.role, "content": m.content} for m in history[:-1]]

    # Buscar chunks relevantes
    relevant_chunks = _search_chunks(body.message)

    # Generar respuesta
    response_text = _generate_response(body.message, relevant_chunks, conversation_history)

    # Preparar fuentes
    sources = None
    if relevant_chunks:
        sources = [
            {
                "document_id": c["document_id"],
                "filename": c["filename"],
                "page": c["page"],
                "chunk_text": c["text"][:200],
            }
            for c in relevant_chunks[:3]
        ]

    # Guardar respuesta
    assistant_msg = Message(
        conversation_id=conversation.id,
        role="assistant",
        content=response_text,
        sources=sources,
    )
    db.add(assistant_msg)
    db.commit()
    db.refresh(assistant_msg)

    # Construir respuesta
    source_models = None
    if sources:
        source_models = [
            Source(
                document_id=s["document_id"],
                filename=s["filename"],
                page=s["page"],
                chunk_text=s["chunk_text"],
            )
            for s in sources
        ]

    return ChatResponse(
        conversation_id=conversation.id,
        message=MessageResponse(
            id=assistant_msg.id,
            role="assistant",
            content=response_text,
            sources=source_models,
            created_at=assistant_msg.created_at,
        ),
    )


def get_conversations(db: Session, user_id: str) -> list[ConversationResponse]:
    conversations = (
        db.query(Conversation)
        .filter(Conversation.user_id == user_id)
        .order_by(Conversation.created_at.desc())
        .all()
    )

    results = []
    for conv in conversations:
        last_msg = (
            db.query(Message)
            .filter(Message.conversation_id == conv.id)
            .order_by(Message.created_at.desc())
            .first()
        )
        msg_count = db.query(Message).filter(Message.conversation_id == conv.id).count()

        results.append(ConversationResponse(
            id=conv.id,
            created_at=conv.created_at,
            last_message=last_msg.content[:100] if last_msg else None,
            message_count=msg_count,
        ))

    return results


async def upload_document(
    db: Session,
    user_id: str,
    course_id: str,
    file: UploadFile,
) -> DocumentResponse:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se permiten archivos PDF",
        )

    # Guardar archivo
    upload_dir = Path("uploads")
    upload_dir.mkdir(exist_ok=True)

    file_id = str(uuid.uuid4())
    file_path = upload_dir / f"{file_id}.pdf"

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # Crear registro en BD
    doc = Document(
        course_id=course_id,
        filename=file.filename,
        file_path=str(file_path),
        uploaded_by=user_id,
        processed=False,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Procesar PDF en background (síncrono por ahora)
    try:
        chunks = process_pdf(str(file_path))
        for chunk in chunks:
            _chunks_db.append({
                "text": chunk["text"],
                "page": chunk["page"],
                "document_id": doc.id,
                "filename": file.filename,
            })

        _rebuild_index()

        doc.processed = True
        db.commit()
        db.refresh(doc)
    except Exception:
        pass  # El documento queda como no procesado

    return DocumentResponse(
        id=doc.id,
        filename=doc.filename,
        course_id=doc.course_id,
        uploaded_by=doc.uploaded_by,
        processed=doc.processed,
        uploaded_at=doc.uploaded_at,
    )


def get_documents(db: Session, course_id: str) -> list[DocumentResponse]:
    docs = (
        db.query(Document)
        .filter(Document.course_id == course_id)
        .order_by(Document.uploaded_at.desc())
        .all()
    )
    return [
        DocumentResponse(
            id=d.id,
            filename=d.filename,
            course_id=d.course_id,
            uploaded_by=d.uploaded_by,
            processed=d.processed,
            uploaded_at=d.uploaded_at,
        )
        for d in docs
    ]


def get_faq(db: Session, course_id: str) -> FAQResponse:
    """Obtiene las preguntas más frecuentes de los alumnos de un curso."""
    # Buscar usuarios del curso
    from ..models.user import User

    user_ids = [
        uid for (uid,) in db.query(User.id).filter(User.course_id == course_id).all()
    ]

    if not user_ids:
        return FAQResponse(items=[])

    # Buscar mensajes de tipo "user" de esos alumnos
    conversation_ids = [
        cid
        for (cid,) in db.query(Conversation.id)
        .filter(Conversation.user_id.in_(user_ids))
        .all()
    ]

    if not conversation_ids:
        return FAQResponse(items=[])

    messages = (
        db.query(Message.content)
        .filter(
            Message.conversation_id.in_(conversation_ids),
            Message.role == "user",
        )
        .order_by(Message.created_at.desc())
        .limit(100)
        .all()
    )

    # Contar preguntas similares (simplificado: agrupamos por contenido exacto)
    counts: dict[str, int] = {}
    for (content,) in messages:
        key = content.strip().lower()[:100]
        counts[key] = counts.get(key, 0) + 1

    items = sorted(
        [FAQItem(question=q, count=c) for q, c in counts.items()],
        key=lambda x: x.count,
        reverse=True,
    )

    return FAQResponse(items=items[:20])
