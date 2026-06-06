from __future__ import annotations

from pathlib import Path

import pytest

from app.services import face_hasher


def test_compute_similarity_returns_expected_bounds() -> None:
    assert face_hasher.compute_similarity([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)
    assert face_hasher.compute_similarity([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)


def test_generate_face_hash_uses_detect_crop_embed_pipeline(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(face_hasher, "_load_image_bytes", lambda _: object())
    monkeypatch.setattr(face_hasher, "_detect_faces", lambda _: ({"box": [0, 0, 10, 10], "confidence": 0.99},))
    monkeypatch.setattr(face_hasher, "_crop_face", lambda *_: object())
    monkeypatch.setattr(face_hasher, "_generate_embedding", lambda _: [0.1] * 128)

    result = face_hasher.generate_face_hash(b"fake-image-bytes")

    assert result["face_detected"] is True
    assert len(result["embedding"]) == 128
    assert len(result["face_hash"]) == 64


def test_generate_face_hash_from_path_reads_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    image_path = tmp_path / "face.png"
    image_path.write_bytes(b"image-bytes")

    monkeypatch.setattr(
        face_hasher,
        "generate_face_hash",
        lambda image_bytes: {"face_hash": "abc", "embedding": [1.0], "face_detected": True},
    )

    result = face_hasher.generate_face_hash_from_path(image_path)

    assert result["face_hash"] == "abc"


def test_parse_embedding_handles_strings_and_lists() -> None:
    assert face_hasher.parse_embedding("[1, 2, 3]") == [1.0, 2.0, 3.0]
    assert face_hasher.parse_embedding([4, 5, 6]) == [4.0, 5.0, 6.0]
