import io

import pytest
from PIL import Image

from app.services.ingestion.image_pipeline import (
    ImageProcessingError,
    process_image_bytes,
)


def _png(width: int, height: int) -> bytes:
    image = Image.new("RGBA", (width, height), (20, 100, 180, 128))
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def test_image_processing_does_not_upscale_and_is_not_generative():
    result = process_image_bytes(_png(640, 480), mime_type="image/png")
    assert (result.width, result.height) == (640, 480)
    assert result.original_extension == ".png"
    assert len(result.content_hash) == 64
    assert len(result.perceptual_hash) == 16
    with Image.open(io.BytesIO(result.derivative)) as derivative:
        assert derivative.format == "JPEG"


def test_image_processing_rejects_tiny_or_invalid_files():
    with pytest.raises(ImageProcessingError):
        process_image_bytes(b"not-an-image")
    with pytest.raises(ImageProcessingError):
        process_image_bytes(_png(10, 10), mime_type="image/png")

