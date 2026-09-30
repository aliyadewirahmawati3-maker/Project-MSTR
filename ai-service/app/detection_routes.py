from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from app.frame_inference import CameraCode, FrameMetadata, MAX_IMAGE_BYTES, SessionInput, inference_service

router = APIRouter(prefix="/local-video", tags=["Local YOLOv13 snapshots"])


@router.get("/model-status")
def model_status():
    """Readiness only. Never loads a model or runs inference."""
    return inference_service.detector.readiness()


@router.post("/sessions")
def start_session(body: SessionInput):
    """Replace the current local source; discard its previous camera result."""
    return inference_service.start(body)


@router.delete("/sessions/{camera_id}/{session_id}")
def stop_session(camera_id: CameraCode, session_id: UUID):
    return inference_service.stop(camera_id, session_id)


@router.post("/detect-frame", summary="Infer one bounded JPEG/PNG snapshot from a local browser video",
             openapi_extra={"requestBody": {"required": True, "content": {
                 "image/jpeg": {"schema": {"type": "string", "format": "binary"}},
                 "image/png": {"schema": {"type": "string", "format": "binary"}}}}})
async def detect_frame(request: Request, x_frame_metadata: Annotated[str, Header(description="JSON FrameMetadata: camera/session/source IDs, sequence, capture/video time, original/snapshot dimensions, profile and calibration.")]):
    if len(x_frame_metadata) > 4096:
        raise HTTPException(413, "Metadata terlalu besar.")
    try:
        meta = FrameMetadata.model_validate_json(x_frame_metadata)
    except ValidationError as error:
        raise HTTPException(422, "Metadata frame tidak valid. Periksa kontrak input lokal.") from error
    if request.headers.get("content-type", "").split(";")[0] not in {"image/jpeg", "image/png"}:
        inference_service.invalidate(meta)
        raise HTTPException(415, "Gunakan snapshot JPEG/PNG.")
    content = bytearray()
    async for chunk in request.stream():
        if len(content) + len(chunk) > MAX_IMAGE_BYTES:
            inference_service.invalidate(meta)
            raise HTTPException(413, "Snapshot maksimal 2 MiB.")
        content.extend(chunk)
    return await run_in_threadpool(inference_service.detect, meta, bytes(content))
