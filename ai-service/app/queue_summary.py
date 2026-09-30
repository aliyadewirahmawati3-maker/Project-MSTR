"""Read-only zone configuration summary; no video access or detection."""

import os
from typing import Literal

from fastapi import APIRouter, Response
from pydantic import BaseModel

from app.local_video import CAMERAS, load_inputs

router = APIRouter(prefix="/local-video", tags=["Offline configuration"])
APPROACH_NAMES = {"WEST": "Barat", "NORTH": "Utara", "EAST": "Timur", "SOUTH": "Selatan"}


class ApproachSummary(BaseModel):
    approach_code: Literal["WEST", "NORTH", "EAST", "SOUTH"]
    approach_name: str
    camera_id: str | None
    profile_id: str | None
    source_type: Literal["OFFLINE_CONFIG"] = "OFFLINE_CONFIG"
    # Null means not measured, never an observed empty queue.
    outer_lane_queue: None = None
    inner_lane_queue: None = None
    total_queue: None = None
    status: Literal["OFFLINE_CONFIG", "WAITING_FOR_DETECTION"]
    note: str


class QueueSummary(BaseModel):
    source_type: Literal["OFFLINE_CONFIG"] = "OFFLINE_CONFIG"
    configuration_valid: bool
    inference_enabled: Literal[False] = False
    source_validation: Literal["NOT_RUN"] = "NOT_RUN"
    error_code: Literal["INVALID_ZONE_CONFIG"] | None = None
    approaches: list[ApproachSummary]


@router.get(
    "/queue-summary",
    response_model=QueueSummary,
    responses={503: {"model": QueueSummary, "description": "Zone configuration missing or invalid"}},
    summary="Ringkasan konfigurasi antrean offline (belum ada deteksi)",
)
def queue_summary(response: Response) -> QueueSummary:
    """Read manual zones only. Null queues are unmeasured; videos are not validated."""
    try:
        cameras = load_inputs(os.getenv("SIGAP_QUEUE_ZONES_PATH", "/config/cctv/queue_zones.json"))
        by_direction = {camera.direction: camera for camera in cameras}
        approaches = [ApproachSummary(
            approach_code=direction,
            approach_name=APPROACH_NAMES[direction],
            camera_id=by_direction[direction].camera_code,
            profile_id=by_direction[direction].profile_id,
            status="WAITING_FOR_DETECTION",
            note="Dua zona manual tersedia. Antrean belum diukur; menunggu deteksi. "
                 "Ringkasan konfigurasi offline saja, bukan hasil kamera atau simulator. "
                 "Ketersediaan dan kecocokan file video belum diperiksa oleh endpoint ini.",
        ) for direction in CAMERAS.values()]
        return QueueSummary(configuration_valid=True, approaches=approaches)
    except (OSError, ValueError, KeyError, TypeError, OverflowError):
        # Do not expose filesystem paths or malformed configuration contents.
        # Discard the entire invalid contract rather than mixing in stale profiles.
        response.status_code = 503
        return QueueSummary(
            configuration_valid=False,
            error_code="INVALID_ZONE_CONFIG",
            approaches=[ApproachSummary(
                approach_code=direction,
                approach_name=APPROACH_NAMES[direction],
                camera_id=None,
                profile_id=None,
                status="OFFLINE_CONFIG",
                note="Konfigurasi zona tidak tersedia, tidak lengkap, atau tidak valid. "
                     "Perbaiki queue_zones.json dan jalankan validator konfigurasi. "
                     "Antrean belum diukur; tidak ada deteksi atau profile aktif.",
            ) for direction in CAMERAS.values()],
        )
