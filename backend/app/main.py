"""FastAPI application for FaceVault Task 1."""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from fastapi.responses import JSONResponse, Response

from app.config import Settings, get_settings
from app.services.face_hasher import (
    FaceHashingError,
    FaceNotDetectedError,
    InvalidImageError,
    compute_similarity,
    generate_face_hash,
    parse_embedding,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="FaceVault API", version="1.0.0", openapi_url="/openapi.json")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_registered_faces: dict[str, dict[str, Any]] = {}


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next: Callable[[Request], Any]) -> Response:
    """Log every request and its status code."""

    started_at = datetime.now(timezone.utc)
    logger.info("%s %s started", request.method, request.url.path)
    response = await call_next(request)
    elapsed_ms = (datetime.now(timezone.utc) - started_at).total_seconds() * 1000
    logger.info("%s %s completed with %s in %.2fms", request.method, request.url.path, response.status_code, elapsed_ms)
    return response


@app.exception_handler(FaceHashingError)
async def face_hashing_exception_handler(_: Request, exc: FaceHashingError) -> JSONResponse:
    """Convert face hashing errors into structured HTTP responses."""

    status_code = 400 if isinstance(exc, (InvalidImageError, FaceNotDetectedError)) else 500
    return JSONResponse(status_code=status_code, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def global_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    """Fallback handler for unexpected errors."""

    logger.exception("Unhandled error: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/api/v1/health")
async def health() -> dict[str, str]:
    """Return the service health status."""

    return {"status": "ok", "version": "1.0.0"}


@app.post("/api/v1/register-face")
async def register_face(
    wallet_address: str = Form(...),
    image: UploadFile = File(...),
) -> dict[str, Any]:
    """Register a face hash for a wallet address."""

    image_bytes = await image.read()
    if not image_bytes:
        raise InvalidImageError("Uploaded file is empty.")

    result = generate_face_hash(image_bytes)
    face_hash = result["face_hash"]

    if wallet_address in _registered_faces:
        raise HTTPException(status_code=409, detail="Wallet address already registered.")
    if face_hash in (entry["face_hash"] for entry in _registered_faces.values()):
        raise HTTPException(status_code=409, detail="Face already registered.")

    _registered_faces[wallet_address] = {
        "face_hash": face_hash,
        "embedding": result["embedding"],
        "registered_at": datetime.now(timezone.utc).isoformat(),
    }

    return {
        "face_hash": face_hash,
        "embedding": result["embedding"],
        "wallet_address": wallet_address,
        "timestamp": _registered_faces[wallet_address]["registered_at"],
    }


@app.post("/api/v1/verify-face")
async def verify_face(
    image: UploadFile = File(...),
    reference_embedding: str | None = Form(None),
    reference_face_hash: str | None = Form(None),
    wallet_address: str | None = Form(None),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Verify an uploaded face against a reference embedding or registry entry."""

    image_bytes = await image.read()
    if not image_bytes:
        raise InvalidImageError("Uploaded file is empty.")

    result = generate_face_hash(image_bytes)
    current_embedding = result["embedding"]
    current_hash = result["face_hash"]

    if reference_embedding is not None:
        target_embedding = parse_embedding(reference_embedding)
    elif reference_face_hash is not None:
        target_embedding = None
        if wallet_address and wallet_address in _registered_faces:
            target_embedding = _registered_faces[wallet_address]["embedding"]
        if target_embedding is None:
            for entry in _registered_faces.values():
                if entry["face_hash"] == reference_face_hash:
                    target_embedding = entry["embedding"]
                    break
        if target_embedding is None:
            raise HTTPException(status_code=404, detail="Reference face hash not found.")
    elif wallet_address and wallet_address in _registered_faces:
        target_embedding = _registered_faces[wallet_address]["embedding"]
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide reference_embedding, reference_face_hash, or wallet_address.",
        )

    similarity_score = compute_similarity(current_embedding, target_embedding)
    return {
        "match": similarity_score >= settings.similarity_threshold,
        "similarity_score": similarity_score,
        "face_hash": current_hash,
    }