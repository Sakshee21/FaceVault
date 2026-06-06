"""Face hashing and similarity utilities for FaceVault.

This module implements the Task 1 core flow:
1. Accept image bytes or a file path.
2. Detect and crop the most relevant face with MTCNN.
3. Generate a 128-dimensional Facenet embedding via DeepFace.
4. SHA256 hash the string representation of the embedding vector.
"""

from __future__ import annotations

import ast
import io
import logging
from hashlib import sha256
from pathlib import Path
from typing import Any, Sequence

import numpy as np
from PIL import Image
from sklearn.metrics.pairwise import cosine_similarity as sklearn_cosine_similarity

logger = logging.getLogger(__name__)


class FaceHashingError(ValueError):
    """Base exception for face hashing errors."""


class InvalidImageError(FaceHashingError):
    """Raised when input bytes or files are not a valid image."""


class FaceNotDetectedError(FaceHashingError):
    """Raised when no face can be detected in the input image."""


class FaceEmbeddingError(FaceHashingError):
    """Raised when embedding generation fails."""


def _load_image_bytes(image_bytes: bytes) -> Image.Image:
    """Decode raw bytes into a Pillow image."""

    try:
        image = Image.open(io.BytesIO(image_bytes))
        return image.convert("RGB")
    except Exception as exc:  # pragma: no cover - depends on corrupt input
        raise InvalidImageError("Input is not a valid image.") from exc


def _load_image_path(image_path: str | Path) -> Image.Image:
    """Load a Pillow image from disk."""

    path = Path(image_path)
    if not path.exists():
        raise InvalidImageError(f"Image file does not exist: {path}")

    try:
        return Image.open(path).convert("RGB")
    except Exception as exc:  # pragma: no cover - depends on corrupt input
        raise InvalidImageError(f"Unable to open image file: {path}") from exc


def _detect_faces(image: Image.Image) -> tuple[Any, ...]:
    """Detect faces using MTCNN and return raw face detections."""

    try:
        from mtcnn import MTCNN
    except ImportError as exc:  # pragma: no cover - environment dependency
        raise FaceEmbeddingError(
            "MTCNN is not installed. Install backend dependencies before using face detection."
        ) from exc

    detector = MTCNN()
    image_array = np.asarray(image)
    detections = detector.detect_faces(image_array)
    if not detections:
        raise FaceNotDetectedError("No face detected in the provided image.")
    return tuple(detections)


def _select_largest_face(detections: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Select the largest, highest-confidence detected face."""

    def sort_key(face: dict[str, Any]) -> tuple[float, float]:
        box = face.get("box") or [0, 0, 0, 0]
        width = float(max(box[2], 0))
        height = float(max(box[3], 0))
        area = width * height
        confidence = float(face.get("confidence") or 0.0)
        return area, confidence

    return max(detections, key=sort_key)


def _crop_face(image: Image.Image, detection: dict[str, Any]) -> Image.Image:
    """Crop the detected face region from an image."""

    width, height = image.size
    x, y, box_width, box_height = detection.get("box") or [0, 0, 0, 0]
    x = max(int(x), 0)
    y = max(int(y), 0)
    box_width = max(int(box_width), 1)
    box_height = max(int(box_height), 1)
    right = min(x + box_width, width)
    bottom = min(y + box_height, height)

    if right <= x or bottom <= y:
        raise FaceNotDetectedError("Detected face bounds were invalid.")

    return image.crop((x, y, right, bottom))


def _generate_embedding(face_image: Image.Image) -> list[float]:
    """Generate a 128-dimensional Facenet embedding for a cropped face."""

    try:
        from deepface import DeepFace
    except ImportError as exc:  # pragma: no cover - environment dependency
        raise FaceEmbeddingError(
            "DeepFace is not installed. Install backend dependencies before embedding generation."
        ) from exc

    try:
        result = DeepFace.represent(
            img_path=np.asarray(face_image),
            model_name="Facenet",
            detector_backend="skip",
            enforce_detection=False,
        )
    except Exception as exc:  # pragma: no cover - external dependency behavior
        raise FaceEmbeddingError("Failed to generate face embedding.") from exc

    embedding: Any
    if isinstance(result, list):
        if not result:
            raise FaceEmbeddingError("DeepFace returned an empty embedding result.")
        embedding = result[0].get("embedding") if isinstance(result[0], dict) else None
    elif isinstance(result, dict):
        embedding = result.get("embedding")
    else:
        embedding = None

    if embedding is None:
        raise FaceEmbeddingError("DeepFace did not return an embedding vector.")

    embedding_list = [float(value) for value in embedding]
    if len(embedding_list) != 128:
        logger.warning("Facenet embedding length was %s instead of 128.", len(embedding_list))
    return embedding_list


def _hash_embedding(embedding: Sequence[float]) -> str:
    """Hash the string form of an embedding using SHA256."""

    embedding_string = str([float(value) for value in embedding])
    return sha256(embedding_string.encode("utf-8")).hexdigest()


def generate_face_hash(image_bytes: bytes) -> dict[str, Any]:
    """Generate a face hash and embedding from raw image bytes.

    Args:
        image_bytes: The image payload to process.

    Returns:
        A dictionary containing the face hash, embedding, and face-detected flag.
    """

    logger.info("Starting face hash generation.")
    image = _load_image_bytes(image_bytes)
    detections = _detect_faces(image)
    selected_face = _select_largest_face(detections)
    logger.info("Selected face with confidence %.3f.", float(selected_face.get("confidence") or 0.0))
    face_image = _crop_face(image, selected_face)
    embedding = _generate_embedding(face_image)
    face_hash = _hash_embedding(embedding)
    logger.info("Generated face hash successfully.")
    return {
        "face_hash": face_hash,
        "embedding": embedding,
        "face_detected": True,
    }


def generate_face_hash_from_path(image_path: str | Path) -> dict[str, Any]:
    """Convenience wrapper that reads image bytes from a file path."""

    path = Path(image_path)
    return generate_face_hash(path.read_bytes())


def compute_similarity(embedding1: list[float], embedding2: list[float]) -> float:
    """Compute cosine similarity between two embeddings.

    Args:
        embedding1: First embedding vector.
        embedding2: Second embedding vector.

    Returns:
        A float in the range [0, 1].
    """

    vector1 = np.asarray(embedding1, dtype=np.float32).reshape(1, -1)
    vector2 = np.asarray(embedding2, dtype=np.float32).reshape(1, -1)
    similarity = float(sklearn_cosine_similarity(vector1, vector2)[0][0])
    return max(0.0, min(1.0, similarity))


def parse_embedding(raw_embedding: str | Sequence[float]) -> list[float]:
    """Parse an embedding value from JSON or a string representation."""

    if isinstance(raw_embedding, str):
        parsed = ast.literal_eval(raw_embedding)
        if not isinstance(parsed, list):
            raise FaceHashingError("Embedding must deserialize to a list of floats.")
        return [float(value) for value in parsed]
    return [float(value) for value in raw_embedding]


# Aliases for main.py compatibility
FaceHashError = FaceHashingError

class FaceHashResult:
    """Simple result wrapper for face hash operations."""
    def __init__(self, face_hash: str, embedding: list, face_detected: bool = True):
        self.face_hash = face_hash
        self.embedding = embedding
        self.face_detected = face_detected

class FaceHasher:
    """Stateless wrapper class for face hashing operations."""

    @staticmethod
    def hash(image_bytes: bytes) -> dict:
        return generate_face_hash(image_bytes)

    @staticmethod
    def similarity(embedding1: list, embedding2: list) -> float:
        return compute_similarity(embedding1, embedding2)
