import os
from pathlib import Path

import pdfplumber


def extract_text_from_pdf(file_path: str) -> list[dict]:
    """Extrae texto de un PDF página por página."""
    pages = []
    with pdfplumber.open(file_path) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text()
            if text and text.strip():
                pages.append({"page": i + 1, "text": text.strip()})
    return pages


def chunk_text(pages: list[dict], chunk_size: int = 500, overlap: int = 50) -> list[dict]:
    """Divide el texto en chunks con solapamiento, manteniendo referencia a la página."""
    chunks = []
    for page_data in pages:
        text = page_data["text"]
        page = page_data["page"]
        words = text.split()

        for i in range(0, len(words), chunk_size - overlap):
            chunk_words = words[i : i + chunk_size]
            if len(chunk_words) < 20:
                continue
            chunks.append({
                "text": " ".join(chunk_words),
                "page": page,
            })

    return chunks


def process_pdf(file_path: str) -> list[dict]:
    """Pipeline completo: extrae texto y lo divide en chunks."""
    pages = extract_text_from_pdf(file_path)
    if not pages:
        return []
    return chunk_text(pages)
