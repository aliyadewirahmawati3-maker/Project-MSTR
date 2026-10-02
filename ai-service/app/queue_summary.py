"""Read-only queue summary with an explicit, lightweight offline-estimation mode."""

import os
from typing import Literal

from fastapi import APIRouter, Response
from pydantic import BaseModel

from app.local_video import CAMERAS, load_inputs
from app.queue_estimator import MODE_DISABLED, estimate_queues, configured_mode
from app.frame_inference import inference_service

router = APIRouter(prefix="/local-video", tags=["Offline configuration"])
APPROACH_NAMES = {"WEST": "Barat", "NORTH": "Utara", "EAST": "Timur", "SOUTH": "Selatan"}


class ApproachSummary(BaseModel):
    approach_code: Literal["WEST", "NORTH", "EAST", "SOUTH"]
    approach_name: str
    camera_id: str | None
    profile_id: str | None
    source_type: Literal["OFFLINE_CONFIG", "OFFLINE_ESTIMATION", "SIMULATOR", "YOLO_LOCAL_REALTIME"] = "OFFLINE_CONFIG"
    # Null means not measured, never an observed empty queue.
    lane_mode: Literal["SINGLE_QUEUE", "DUAL_LANE"] = "DUAL_LANE"
    queue_count: int | None = None
    outer_lane_queue: int | None = None
    inner_lane_queue: int | None = None
    total_queue: int | None = None
    status: Literal["OFFLINE_CONFIG", "SIMULATOR", "WAITING_FOR_DETECTION", "DETECTION_READY", "ZONE_CALIBRATION_REQUIRED", "YOLO_MODEL_UNAVAILABLE", "INFERENCE_ERROR", "STALE"]
    note: str
    session_id: str | None = None
    source_id: str | None = None
    inference_enabled: bool = False
    model_name: str | None = None
    captured_at: str | None = None
    processed_at: str | None = None
    expires_at: str | None = None
    video_time_seconds: float | None = None
    frame_sequence: int | None = None
    inference_duration_ms: float | None = None
    stale: bool = False


class QueueSummary(BaseModel):
    source_type: Literal["OFFLINE_CONFIG", "OFFLINE_ESTIMATION", "SIMULATOR", "YOLO_LOCAL_REALTIME"] = "OFFLINE_CONFIG"
    configuration_valid: bool
    inference_enabled: bool = False
    estimation_enabled: bool = False
    estimation_mode: Literal["DISABLED", "SIMULATOR", "OFFLINE_ESTIMATION"] = "DISABLED"
    source_validation: Literal["NOT_RUN", "FRAME_CHECKED", "BROWSER_SNAPSHOT"] = "NOT_RUN"
    error_code: Literal["INVALID_ZONE_CONFIG"] | None = None
    approaches: list[ApproachSummary]


@router.get(
    "/queue-summary",
    response_model=QueueSummary,
    responses={503: {"model": QueueSummary, "description": "Zone configuration missing or invalid"}},
    summary="Ringkasan offline atau cache snapshot YOLO lokal (tanpa inference saat polling)",
)
def queue_summary(response: Response, mode: Literal["YOLO_LOCAL_REALTIME"] | None = None) -> QueueSummary:
    """Read zones and optionally run the explicit one-frame estimator gate."""
    try:
        cameras = load_inputs(os.getenv("SIGAP_QUEUE_ZONES_PATH", "/config/cctv/queue_zones.json"))
        if mode == "YOLO_LOCAL_REALTIME":
            latest = {}
            for camera in cameras:
                row = inference_service.latest(camera.camera_code)
                if row["profile_id"] is None:
                    row["lane_mode"] = camera.lane_mode
                latest[camera.camera_code] = row
            return QueueSummary(configuration_valid=True, source_type=mode, inference_enabled=True,
                source_validation="BROWSER_SNAPSHOT", approaches=[ApproachSummary(
                    approach_code=direction, approach_name=APPROACH_NAMES[direction],
                    **latest[code]) for code, direction in CAMERAS.items()])
        mode = configured_mode()
        estimates = estimate_queues(cameras, os.getenv("SIGAP_OFFLINE_ROOT", "/data/cctv-offline"), mode)
        source_type = "OFFLINE_CONFIG" if mode == MODE_DISABLED else mode
        by_direction = {camera.direction: camera for camera in cameras}
        approaches = [ApproachSummary(
            approach_code=direction,
            approach_name=APPROACH_NAMES[direction],
            camera_id=by_direction[direction].camera_code,
            profile_id=by_direction[direction].profile_id,
            source_type=estimates[by_direction[direction].camera_code].source_type,
            lane_mode=by_direction[direction].lane_mode,
            queue_count=estimates[by_direction[direction].camera_code].total,
            outer_lane_queue=estimates[by_direction[direction].camera_code].outer,
            inner_lane_queue=estimates[by_direction[direction].camera_code].inner,
            total_queue=estimates[by_direction[direction].camera_code].total,
            status=estimates[by_direction[direction].camera_code].status,
            note=estimates[by_direction[direction].camera_code].note,
        ) for direction in CAMERAS.values()]
        return QueueSummary(configuration_valid=True, source_type=source_type,
                            estimation_enabled=mode != MODE_DISABLED, estimation_mode=mode,
                            source_validation="FRAME_CHECKED" if mode != MODE_DISABLED else "NOT_RUN",
                            approaches=approaches)
    except (OSError, ValueError, KeyError, TypeError, OverflowError):
        # Do not expose filesystem paths or malformed configuration contents.
        # Discard the entire invalid contract rather than mixing in stale profiles.
        response.status_code = 503
        return QueueSummary(
            configuration_valid=False,
            source_type=mode or "OFFLINE_CONFIG", inference_enabled=mode is not None,
            error_code="INVALID_ZONE_CONFIG",
            approaches=[ApproachSummary(
                approach_code=direction,
                approach_name=APPROACH_NAMES[direction],
                camera_id=None,
                profile_id=None,
                source_type=mode or "OFFLINE_CONFIG",
                status="ZONE_CALIBRATION_REQUIRED" if mode else "OFFLINE_CONFIG",
                note="Konfigurasi zona tidak tersedia, tidak lengkap, atau tidak valid. "
                     "Perbaiki queue_zones.json dan jalankan validator konfigurasi. "
                     "Antrean belum diukur; tidak ada deteksi atau profile aktif.",
            ) for direction in CAMERAS.values()],
        )
