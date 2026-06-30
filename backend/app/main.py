"""FastAPI application for FaceVault."""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from app.config import Settings, get_settings
from app.services.blockchain import (
    BlockchainError,
    check_consent,
    get_consent_rules,
    get_record,
    register_face_on_chain,
    update_consent_on_chain,
)
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

app = FastAPI(title="FaceVault API", version="2.0.0", openapi_url="/openapi.json")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory registry kept for Task 1 backward compatibility.
# The blockchain is the source of truth when POLYGON_RPC_URL is set.
_registered_faces: dict[str, dict[str, Any]] = {}


# ---------------------------------------------------------------------------
# Request/response models for blockchain endpoints
# ---------------------------------------------------------------------------

class UpdateConsentRequest(BaseModel):
    wallet_address: str
    private_key: str
    allow_artistic: bool = False
    allow_commercial: bool = False
    allow_all: bool = False


# ---------------------------------------------------------------------------
# Middleware and exception handlers
# ---------------------------------------------------------------------------

@app.middleware("http")
async def request_logging_middleware(request: Request, call_next: Callable[[Request], Any]) -> Response:
    started_at = datetime.now(timezone.utc)
    logger.info("%s %s started", request.method, request.url.path)
    response = await call_next(request)
    elapsed_ms = (datetime.now(timezone.utc) - started_at).total_seconds() * 1000
    logger.info("%s %s → %s (%.2fms)", request.method, request.url.path, response.status_code, elapsed_ms)
    return response


@app.exception_handler(FaceHashingError)
async def face_hashing_exception_handler(_: Request, exc: FaceHashingError) -> JSONResponse:
    status_code = 400 if isinstance(exc, (InvalidImageError, FaceNotDetectedError)) else 500
    return JSONResponse(status_code=status_code, content={"detail": str(exc)})


@app.exception_handler(BlockchainError)
async def blockchain_exception_handler(_: Request, exc: BlockchainError) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def global_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/api/v1/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "version": "2.0.0"}


# ---------------------------------------------------------------------------
# Face registration — Task 1 + blockchain (Task 2)
# ---------------------------------------------------------------------------

@app.post("/api/v1/register-face")
async def register_face(
    wallet_address: str = Form(...),
    image: UploadFile = File(...),
    private_key: str = Form(default=""),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Register a face hash for a wallet address.

    If POLYGON_RPC_URL is configured in .env and a private_key is supplied,
    the face hash is also written to the blockchain. Otherwise only the
    in-memory registry is updated (Task 1 behaviour).
    """
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

    response: dict[str, Any] = {
        "face_hash": face_hash,
        "embedding": result["embedding"],
        "wallet_address": wallet_address,
        "timestamp": _registered_faces[wallet_address]["registered_at"],
        "on_chain": False,
    }

    # Write to blockchain if configured
    if settings.polygon_rpc_url and private_key:
        network = "hardhat" if "localhost" in settings.polygon_rpc_url or "127.0.0.1" in settings.polygon_rpc_url else "amoy"
        tx_hash = register_face_on_chain(
            face_hash=face_hash,
            wallet_address=wallet_address,
            private_key=private_key,
            rpc_url=settings.polygon_rpc_url,
            network=network,
        )
        response["tx_hash"] = tx_hash
        response["on_chain"] = True
        logger.info("Face registered on-chain: tx=%s", tx_hash)

    return response


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


# ---------------------------------------------------------------------------
# Blockchain endpoints (Task 2)
# ---------------------------------------------------------------------------

@app.get("/api/v1/check-consent/{face_hash}")
async def check_consent_endpoint(
    face_hash: str,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Check whether a face hash has any consent enabled on-chain.

    This is the gate AI tools should query before generating images.
    Returns has_consent=false when POLYGON_RPC_URL is not set (safe default).
    """
    if not settings.polygon_rpc_url:
        return {"has_consent": False, "on_chain": False, "reason": "blockchain not configured"}

    network = "hardhat" if "localhost" in settings.polygon_rpc_url or "127.0.0.1" in settings.polygon_rpc_url else "amoy"
    has = check_consent(face_hash, rpc_url=settings.polygon_rpc_url, network=network)
    rules = get_consent_rules(face_hash, rpc_url=settings.polygon_rpc_url, network=network)

    return {
        "has_consent": has,
        "on_chain": True,
        **rules,
    }


@app.post("/api/v1/update-consent")
async def update_consent_endpoint(
    body: UpdateConsentRequest,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Update consent preferences for a registered wallet on-chain."""
    if not settings.polygon_rpc_url:
        raise HTTPException(status_code=503, detail="Blockchain not configured. Set POLYGON_RPC_URL in .env.")

    network = "hardhat" if "localhost" in settings.polygon_rpc_url or "127.0.0.1" in settings.polygon_rpc_url else "amoy"
    tx_hash = update_consent_on_chain(
        wallet_address=body.wallet_address,
        private_key=body.private_key,
        allow_artistic=body.allow_artistic,
        allow_commercial=body.allow_commercial,
        allow_all=body.allow_all,
        rpc_url=settings.polygon_rpc_url,
        network=network,
    )
    return {
        "tx_hash": tx_hash,
        "wallet_address": body.wallet_address,
        "allow_artistic": body.allow_artistic,
        "allow_commercial": body.allow_commercial,
        "allow_all": body.allow_all,
    }


@app.get("/api/v1/record/{wallet_address}")
async def get_record_endpoint(
    wallet_address: str,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Get the full on-chain record for a wallet address."""
    if not settings.polygon_rpc_url:
        raise HTTPException(status_code=503, detail="Blockchain not configured. Set POLYGON_RPC_URL in .env.")

    network = "hardhat" if "localhost" in settings.polygon_rpc_url or "127.0.0.1" in settings.polygon_rpc_url else "amoy"
    return get_record(wallet_address, rpc_url=settings.polygon_rpc_url, network=network)
