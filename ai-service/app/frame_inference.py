"""Bounded in-memory snapshot sessions and latest-frame zone occupancy."""

from datetime import datetime, timezone, timedelta
from io import BytesIO
import logging
import os
import threading
import time
from typing import Literal
from uuid import UUID, uuid4

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, AwareDatetime

from app.local_video import CAMERAS, InputError, load_inputs, on_segment
from app.yolo_detector import MODEL_NAME, ModelUnavailable, YoloDetector, setting

CameraCode = Literal["CAM-W-01", "CAM-N-01", "CAM-E-01", "CAM-S-01"]
SOURCE_TYPE = "YOLO_LOCAL_REALTIME"
MAX_IMAGE_BYTES = 2 * 1024 * 1024
logger = logging.getLogger(__name__)


class SessionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    camera_id: CameraCode
    client_id: UUID
    source_id: UUID
    revision: int = Field(gt=0, strict=True)


class FrameMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    camera_id: CameraCode
    session_id: UUID
    source_id: UUID
    frame_sequence: int = Field(gt=0, strict=True)
    profile_id: str | None = Field(default=None, max_length=80)
    input_camera_code: CameraCode | None = None
    source_sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    calibration_confirmed: bool = False
    captured_at: AwareDatetime
    video_time_seconds: float = Field(ge=0, le=864000)
    original_width: int = Field(ge=16, le=8192, strict=True)
    original_height: int = Field(ge=16, le=8192, strict=True)
    frame_width: int = Field(ge=16, le=2048, strict=True)
    frame_height: int = Field(ge=16, le=2048, strict=True)


def decode_frame(content, meta):
    import cv2
    import numpy as np
    from PIL import Image
    try:
        # Inspect format and dimensions before allocating the decoded image.
        with Image.open(BytesIO(content)) as image:
            if image.format not in {"JPEG", "PNG"} or image.size != (meta.frame_width, meta.frame_height):
                raise ValueError("Format/dimensi gambar tidak cocok")
            image.verify()
        if abs((meta.frame_width / meta.frame_height) / (meta.original_width / meta.original_height) - 1) > .005:
            raise ValueError("Snapshot harus memuat seluruh frame tanpa crop")
        frame = cv2.imdecode(np.frombuffer(content, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None or frame.shape[:2] != (meta.frame_height, meta.frame_width):
            raise ValueError("Frame tidak dapat dibaca")
        return frame
    except Exception as error:
        raise HTTPException(422, "Gambar harus JPEG/PNG valid dengan dimensi dan rasio frame yang sesuai.") from error


def point_in_polygon(point, polygon):
    # Boundaries are included; membership in BOTH zones is then excluded as ambiguous.
    inside = False
    x, y = point
    for i, a in enumerate(polygon):
        b = polygon[(i + 1) % len(polygon)]
        if on_segment(a, b, point):
            return True
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
    return inside


def count_zones(detections, camera):
    counts = {"outer": 0, "inner": 0}
    ambiguous = 0
    for detection in detections:
        x1, _, x2, y2 = detection["bbox"]
        lanes = [zone.lane_type for zone in camera.zones if point_in_polygon(((x1 + x2) / 2, y2), zone.polygon)]
        detection["lane_type"] = lanes[0] if len(lanes) == 1 else None
        if len(lanes) == 1:
            counts[lanes[0]] += 1
        elif len(lanes) > 1:
            ambiguous += 1
    return counts, ambiguous


def valid_profile(cameras, meta):
    camera = next((c for c in cameras if c.camera_code == meta.camera_id and c.profile_id == meta.profile_id), None)
    if camera is None or meta.input_camera_code != camera.camera_code:
        return None
    identity = next((s for s in camera.registered_sources if s.source_sha256 == meta.source_sha256), None)
    if identity:
        if identity.camera_code != meta.camera_id or identity.profile_id != meta.profile_id:
            return None
    elif not meta.calibration_confirmed:
        return None
    try:
        camera.pixel_zones(meta.original_width, meta.original_height, meta.input_camera_code)
    except InputError:
        return None
    return camera


def utc_now():
    return datetime.now(timezone.utc)


def empty_result(camera_id, status="WAITING_FOR_DETECTION", note="Belum ada frame video lokal yang valid."):
    return {"camera_id": camera_id, "profile_id": None, "session_id": None, "source_id": None,
            "source_type": SOURCE_TYPE, "inference_enabled": True, "model_name": MODEL_NAME,
            "outer_lane_queue": None, "inner_lane_queue": None, "total_queue": None,
            "status": status, "note": note, "captured_at": None, "processed_at": None,
            "expires_at": None, "video_time_seconds": None, "frame_sequence": None,
            "inference_duration_ms": None, "stale": False, "detections": []}


class FrameInferenceService:
    def __init__(self, detector=None, clock=time.monotonic, now=utc_now):
        self.detector = detector or YoloDetector()
        self.clock, self.now = clock, now
        self.max_age = setting("SIGAP_YOLO_MAX_AGE_SECONDS", 10., 2., 30.)
        self.min_interval = setting("SIGAP_YOLO_MIN_INTERVAL_SECONDS", 1.5, .25, 30.)
        self.entries = {}  # At most four active/tombstoned camera entries.
        self.lock = threading.Lock()
        self.inference_slot = threading.Lock()  # Fail fast; never queue inference jobs.

    def start(self, request):
        with self.lock:
            previous = self.entries.get(request.camera_id)
            if previous and previous["client_id"] == request.client_id and previous["revision"] >= request.revision:
                raise HTTPException(409, "Revisi sesi sudah diganti; buat sesi sumber terbaru.")
            session_id = str(uuid4())
            self.entries[request.camera_id] = {**request.model_dump(), "session_id": session_id,
                "active": True, "sequence": 0, "last_attempt": float('-inf'), "result": None}
            return {"session_id": session_id, "source_id": str(request.source_id),
                    "camera_id": request.camera_id, "min_interval_seconds": self.min_interval,
                    "max_age_seconds": self.max_age, "model": self.detector.readiness()}

    def stop(self, camera_id, session_id):
        with self.lock:
            entry = self.entries.get(camera_id)
            if entry and entry["session_id"] == str(session_id):
                entry.update(active=False, result=None)
        return {"stopped": True}

    def current(self, meta):
        entry = self.entries.get(meta.camera_id)
        return entry if entry and entry["active"] and entry["session_id"] == str(meta.session_id) and str(entry["source_id"]) == str(meta.source_id) else None

    def invalidate(self, meta):
        with self.lock:
            entry = self.current(meta)
            if entry:
                entry["result"] = None

    def detect(self, meta, content):
        with self.lock:
            entry = self.current(meta)
            if entry is None or meta.frame_sequence <= entry["sequence"]:
                raise HTTPException(409, "Sesi/frame sudah diganti.")
            if self.clock() - entry["last_attempt"] < self.min_interval:
                raise HTTPException(429, "Frekuensi frame terlalu tinggi; kirim frame terbaru nanti.")
        if not self.inference_slot.acquire(blocking=False):
            raise HTTPException(429, "Model sedang memproses kamera lain; buang frame ini.")
        try:
            with self.lock:
                entry = self.current(meta)
                if entry is None or meta.frame_sequence <= entry["sequence"]:
                    raise HTTPException(409, "Sesi/frame sudah diganti.")
                entry.update(sequence=meta.frame_sequence, last_attempt=self.clock())
            started = self.clock()
            result = empty_result(meta.camera_id)
            result.update(profile_id=meta.profile_id, session_id=str(meta.session_id), source_id=str(meta.source_id),
                          captured_at=meta.captured_at.isoformat(), video_time_seconds=meta.video_time_seconds,
                          frame_sequence=meta.frame_sequence, original_width=meta.original_width,
                          original_height=meta.original_height, frame_width=meta.frame_width, frame_height=meta.frame_height)
            age = (self.now() - meta.captured_at).total_seconds()
            if age < -5 or age > self.max_age:
                self.invalidate(meta)
                raise HTTPException(422, "Waktu capture tidak valid atau frame telah kedaluwarsa.")
            try:
                frame = decode_frame(content, meta)
                detections = self.detector.predict(frame)
                result["detections"] = detections
                try:
                    cameras = load_inputs(os.getenv("SIGAP_QUEUE_ZONES_PATH", "/config/cctv/queue_zones.json"))
                    camera = valid_profile(cameras, meta)
                except (OSError, ValueError, KeyError, TypeError, OverflowError):
                    camera = None
                if camera:
                    counts, ambiguous = count_zones(detections, camera)
                    result.update(outer_lane_queue=counts["outer"], inner_lane_queue=counts["inner"],
                                  total_queue=sum(counts.values()), status="DETECTION_READY",
                                  note="Jumlah kendaraan dalam zona pada frame terbaru; bukan kumulatif atau bukti kendaraan berhenti.",
                                  ambiguous_detections=ambiguous)
                else:
                    result.update(status="ZONE_CALIBRATION_REQUIRED", note="Deteksi umum tersedia. Cocokkan kamera/profile dan konfirmasi sudut rekaman untuk menghitung zona.")
            except HTTPException:
                self.invalidate(meta)
                raise
            except ModelUnavailable as error:
                result.update(status="YOLO_MODEL_UNAVAILABLE", note=str(error))
            except Exception:
                logger.exception("Local frame inference failed")
                result.update(status="INFERENCE_ERROR", note="Inference gagal. Periksa log AI service; coba frame berikutnya.", detections=[])
            result["inference_duration_ms"] = round((self.clock() - started) * 1000, 2)
            result["processed_at"] = self.now().isoformat()
            result["expires_at"] = (meta.captured_at + timedelta(seconds=self.max_age)).isoformat()
            with self.lock:
                entry = self.current(meta)
                if entry is None or entry["sequence"] != meta.frame_sequence:
                    raise HTTPException(409, "Hasil dibuang karena sesi sumber telah berubah.")
                entry["result"] = result
                entry["expires_mono"] = started + max(0, self.max_age - age)
            return self.latest(meta.camera_id, include_detections=True)
        finally:
            self.inference_slot.release()

    def latest(self, camera_id, include_detections=False):
        with self.lock:
            entry = self.entries.get(camera_id)
            result = dict(entry["result"]) if entry and entry["active"] and entry["result"] else empty_result(camera_id)
            if result["captured_at"] and self.clock() >= entry["expires_mono"]:
                result.update(outer_lane_queue=None, inner_lane_queue=None, total_queue=None,
                              status="STALE", stale=True, detections=[], note="Data kedaluwarsa; menunggu frame video terbaru.")
            if not include_detections:
                result.pop("detections", None)
            return result


inference_service = FrameInferenceService()
