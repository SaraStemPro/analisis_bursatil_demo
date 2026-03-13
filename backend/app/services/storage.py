"""Supabase Storage helper — falls back to local filesystem if not configured."""

import httpx
from pathlib import Path
from ..config import settings

_UPLOADS_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"


def _is_configured() -> bool:
    return bool(settings.supabase_url and settings.supabase_service_key)


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.supabase_service_key}",
        "apikey": settings.supabase_service_key,
    }


def _base_url() -> str:
    return f"{settings.supabase_url}/storage/v1/object/{settings.supabase_bucket}"


def upload(filename: str, content: bytes) -> str:
    """Upload file. Returns the storage key (filename).
    If Supabase is configured, uploads there. Always saves local copy too (for PDF processing)."""
    # Always save local copy (needed for PDF text extraction)
    _UPLOADS_DIR.mkdir(exist_ok=True)
    local_path = _UPLOADS_DIR / filename
    local_path.write_bytes(content)

    if _is_configured():
        resp = httpx.post(
            f"{_base_url()}/{filename}",
            headers={**_headers(), "Content-Type": "application/pdf"},
            content=content,
            timeout=30,
        )
        if resp.status_code not in (200, 201):
            # If upload fails, local copy still exists
            pass

    return filename


def download(stored_path: str) -> Path | None:
    """Get file for download. Returns local Path if available, otherwise downloads from Supabase."""
    # Resolve stored path (could be relative or legacy absolute)
    p = Path(stored_path)
    if p.is_absolute():
        if p.exists():
            return p
        local = _UPLOADS_DIR / p.name
    else:
        local = _UPLOADS_DIR / p

    if local.exists():
        return local

    # Try Supabase Storage
    if _is_configured():
        filename = p.name if p.is_absolute() else str(p)
        resp = httpx.get(
            f"{_base_url()}/{filename}",
            headers=_headers(),
            timeout=30,
        )
        if resp.status_code == 200:
            _UPLOADS_DIR.mkdir(exist_ok=True)
            local.write_bytes(resp.content)
            return local

    return None


def delete(stored_path: str):
    """Delete file from both local and Supabase."""
    p = Path(stored_path)
    filename = p.name if p.is_absolute() else str(p)

    # Local
    local = _UPLOADS_DIR / filename if not p.is_absolute() else p
    if not p.is_absolute():
        local = _UPLOADS_DIR / p
    else:
        local = p if p.exists() else _UPLOADS_DIR / p.name

    if local.exists():
        local.unlink()

    # Supabase
    if _is_configured():
        httpx.delete(
            f"{_base_url()}/{filename}",
            headers=_headers(),
            timeout=10,
        )
