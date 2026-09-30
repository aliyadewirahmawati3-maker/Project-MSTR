"""Small, explicit offline queue-estimation boundary.

This module verifies one decoded frame before exposing configured estimator
values. It deliberately does not detect, count, track, or identify vehicles.
The default mode is disabled; numeric values only appear after an explicit
simulator/offline-estimation opt-in.
"""

from dataclasses import dataclass
import json
import math
import os
from app.local_video import CameraInput, InputError

MODE_DISABLED = "DISABLED"
MODE_SIMULATOR = "SIMULATOR"
MODE_OFFLINE_ESTIMATION = "OFFLINE_ESTIMATION"
SUPPORTED_MODES = {MODE_DISABLED, MODE_SIMULATOR, MODE_OFFLINE_ESTIMATION}

# These are visible simulator fixtures, never observations from CCTV.
DEFAULT_SIMULATOR_VALUES = {
    "CAM-W-01": {"outer": 2, "inner": 1},
    "CAM-N-01": {"outer": 1, "inner": 2},
    "CAM-E-01": {"outer": 3, "inner": 2},
    "CAM-S-01": {"outer": 1, "inner": 1},
}


@dataclass(frozen=True)
class QueueEstimate:
    outer: int | None
    inner: int | None
    source_type: str
    status: str
    note: str

    @property
    def total(self):
        if self.outer is None or self.inner is None:
            return None
        return self.outer + self.inner


def configured_mode(value=None):
    """Return a safe, normalized mode; unknown values disable estimation."""
    raw = os.getenv("SIGAP_QUEUE_ESTIMATION_MODE", MODE_DISABLED) if value is None else value
    mode = str(raw or MODE_DISABLED).strip().upper()
    return mode if mode in SUPPORTED_MODES else MODE_DISABLED


def _valid_count(value):
    return type(value) is int and value >= 0


def _parse_values(raw):
    if raw is None:
        return {}
    try:
        payload = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}
    if not isinstance(payload, dict):
        return {}
    values = {}
    for camera_code, pair in payload.items():
        if not isinstance(camera_code, str) or not isinstance(pair, dict):
            continue
        outer, inner = pair.get("outer"), pair.get("inner")
        if _valid_count(outer) and _valid_count(inner):
            values[camera_code] = {"outer": outer, "inner": inner}
    return values


def configured_values(mode, raw=None):
    """Read explicit local values without accepting floats, strings, or negatives."""
    if mode == MODE_SIMULATOR:
        source = raw if raw is not None else os.getenv("SIGAP_QUEUE_ESTIMATES_JSON")
        if source is None or (isinstance(source, str) and not source.strip()):
            return DEFAULT_SIMULATOR_VALUES
        return _parse_values(source)
    if mode == MODE_OFFLINE_ESTIMATION:
        return _parse_values(raw if raw is not None else os.getenv("SIGAP_QUEUE_ESTIMATES_JSON"))
    return {}


def inspect_first_frame(camera: CameraInput, root):
    """Open one local frame and validate it against the normalized profile."""
    try:
        import cv2
    except ImportError as error:
        raise InputError("FRAME_CHECK_UNAVAILABLE", "Video frame inspection is unavailable") from error

    path = camera.resolve_file(root)
    capture = cv2.VideoCapture(str(path))
    try:
        if not capture.isOpened():
            raise InputError("UNREADABLE_VIDEO", "Video cannot be opened")
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = capture.get(cv2.CAP_PROP_FPS)
        if width <= 0 or height <= 0 or not math.isfinite(fps) or fps <= 0:
            raise InputError("UNREADABLE_VIDEO", "Video metadata is invalid")
        ok, frame = capture.read()
        if not ok or frame is None or frame.shape[:2] != (height, width):
            raise InputError("UNREADABLE_VIDEO", "First video frame cannot be decoded")
        # This checks camera identity, aspect ratio, and polygon geometry only.
        camera.pixel_zones(width, height, camera.camera_code)
        return {"width": width, "height": height, "fps": fps}
    except cv2.error as error:
        raise InputError("UNREADABLE_VIDEO", "Video frame decoder failed") from error
    finally:
        capture.release()


def estimate_queues(cameras, root, mode=None, values=None, inspector=inspect_first_frame):
    """Return per-camera estimates after a cheap frame-read gate.

    The inspector is injectable for tests and for a future offline analyzer.
    It must only establish that a valid, profile-compatible frame exists.
    """
    mode = configured_mode(mode)
    if mode == MODE_DISABLED:
        return {camera.camera_code: QueueEstimate(
            None, None, "OFFLINE_CONFIG", "WAITING_FOR_DETECTION",
            "Estimator offline belum diaktifkan; antrean belum diukur.",
        ) for camera in cameras}

    configured = configured_values(mode, values)
    results = {}
    for camera in cameras:
        pair = configured.get(camera.camera_code)
        try:
            inspector(camera, root)
        except (InputError, OSError, ValueError, TypeError, ImportError) as error:
            results[camera.camera_code] = QueueEstimate(
                None, None, mode, "WAITING_FOR_DETECTION",
                f"Mode {mode} aktif, tetapi video/frame lokal belum valid; antrean tetap belum diukur ({getattr(error, 'code', 'FRAME_UNAVAILABLE')}).",
            )
            continue
        if pair is None:
            results[camera.camera_code] = QueueEstimate(
                None, None, mode, "WAITING_FOR_DETECTION",
                f"Mode {mode} aktif, tetapi nilai estimator lokal belum dikonfigurasi untuk kamera ini.",
            )
            continue
        label = "simulator" if mode == MODE_SIMULATOR else "estimasi offline"
        results[camera.camera_code] = QueueEstimate(
            pair["outer"], pair["inner"], mode, "SIMULATOR",
            f"Nilai berasal dari {label} terkontrol setelah frame lokal diverifikasi; bukan YOLO real-time atau CCTV live.",
        )
    return results
