"""Unit fixtures only; real YOLO evidence comes from scripts/verify_yolo_local.py."""
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import datetime, timezone, timedelta
import json
import os
from pathlib import Path
from threading import Event
from uuid import uuid4

import cv2
import numpy as np
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import detection_routes, queue_summary
from app.frame_inference import FrameInferenceService, FrameMetadata, SessionInput, count_zones, valid_profile
from app.local_video import load_inputs, QueueZone
from app.main import app
from app.yolo_detector import ModelUnavailable, YoloDetector, vehicle_detections

CONFIG = Path(os.getenv("SIGAP_QUEUE_ZONES_PATH", Path(__file__).resolve().parents[2] / "config/cctv/queue_zones.json"))


class DetectorFixture:
    status = "READY"
    def __init__(self, results=None, error=None):
        self.results, self.error, self.calls = results or [], error, 0
    def readiness(self):
        return {"status": self.status, "ready": True}
    def predict(self, frame):
        self.calls += 1
        if self.error:
            raise self.error
        return [dict(d) for d in self.results]


@pytest.fixture
def setup(monkeypatch):
    monkeypatch.setenv("SIGAP_QUEUE_ZONES_PATH", str(CONFIG))
    now = datetime.now(timezone.utc)
    elapsed = [0.]
    detector = DetectorFixture()
    service = FrameInferenceService(detector, clock=lambda: elapsed[0], now=lambda: now + timedelta(seconds=elapsed[0]))
    monkeypatch.setattr(detection_routes, "inference_service", service)
    monkeypatch.setattr(queue_summary, "inference_service", service)
    client = TestClient(app)
    source, owner = uuid4(), uuid4()
    cameras = load_inputs(CONFIG)
    registration = SessionInput(camera_id="CAM-W-01", client_id=owner, source_id=source, revision=1)
    session = service.start(registration)
    meta = FrameMetadata(camera_id="CAM-W-01", session_id=session["session_id"], source_id=source,
        frame_sequence=1, profile_id="CAM-W-01", input_camera_code="CAM-W-01",
        source_sha256=cameras[0].source_sha256, captured_at=now, video_time_seconds=5,
        original_width=1920, original_height=1080, frame_width=640, frame_height=360)
    _, encoded = cv2.imencode('.jpg', np.zeros((360, 640, 3), dtype=np.uint8))
    return service, detector, client, meta, encoded.tobytes(), elapsed, registration


def test_class_filter_uses_names_not_fixed_coco_indices():
    names = {0: "truck", 1: "person", 7: "motorcycle", 12: "car", 15: "bus"}
    rows = [[10, 10, 40, 60, .8, n] for n in names]
    result = vehicle_detections(names, rows, 100, 100)
    assert {d["class_name"] for d in result} == {"truck", "motorcycle", "car", "bus"}
    assert all(d["bbox"] == [.1, .1, .4, .6] for d in result)


def test_bottom_center_count_excludes_outside_and_ambiguous_zones():
    camera = load_inputs(CONFIG)[0]
    camera = replace(camera, zones=(
        QueueZone("outer", "outer", "LEFT_OR_STRAIGHT", ((0, 0), (.6, 0), (.6, 1), (0, 1))),
        QueueZone("inner", "inner", "STRAIGHT_OR_RIGHT", ((.4, 0), (.8, 0), (.8, 1), (.4, 1))),
    ))
    detections = [{"bbox": [x-.05, .1, x+.05, .8]} for x in [.2, .7, .95, .5, .4]]
    counts, ambiguous = count_zones(detections, camera)
    assert counts == {"outer": 1, "inner": 1}
    assert ambiguous == 2
    assert [d["lane_type"] for d in detections] == ["outer", "inner", None, None, None]


def test_no_frames_summary_has_four_null_directions_and_never_calls_model(setup):
    service, detector, client, *_ = setup
    body = client.get('/local-video/queue-summary?mode=YOLO_LOCAL_REALTIME').json()
    assert [r["approach_code"] for r in body["approaches"]] == ["WEST", "NORTH", "EAST", "SOUTH"]
    assert all(r["total_queue"] is None and r["status"] == "WAITING_FOR_DETECTION" for r in body["approaches"])
    assert detector.calls == 0


@pytest.mark.parametrize('error,status', [(ModelUnavailable("Unduh weights resmi"), "YOLO_MODEL_UNAVAILABLE"), (RuntimeError("unit fixture failure"), "INFERENCE_ERROR")])
def test_failures_clear_counts_without_crashing_service(setup, error, status):
    service, detector, client, meta, content, *_ = setup
    detector.error = error
    result = service.detect(meta, content)
    assert result["status"] == status
    assert result["total_queue"] is None and not result["detections"]
    assert client.get('/health').json()["status"] == "healthy"


def test_missing_or_unverified_weights_never_loads_model(tmp_path, monkeypatch):
    path = tmp_path / "yolov13n.pt"
    monkeypatch.setenv("SIGAP_YOLO_WEIGHTS", str(path))
    detector = YoloDetector()
    with pytest.raises(ModelUnavailable, match="setup-yolov13"):
        detector.load()
    assert detector.status == "YOLO_MODEL_UNAVAILABLE"
    path.write_bytes(b'untrusted weights unit fixture')
    with pytest.raises(ModelUnavailable, match="SHA256"):
        YoloDetector().load()


def test_successful_empty_frame_is_the_only_path_to_zero_and_expires(setup):
    service, _, client, meta, content, elapsed, _ = setup
    result = service.detect(meta, content)
    assert result["status"] == "DETECTION_READY"
    assert result["total_queue"] == result["outer_lane_queue"] + result["inner_lane_queue"] == 0
    assert service.latest(meta.camera_id)["total_queue"] == 0
    elapsed[0] += service.max_age + 1
    stale = client.get('/local-video/queue-summary?mode=YOLO_LOCAL_REALTIME').json()["approaches"][0]
    assert stale["stale"] and stale["status"] == "STALE" and stale["total_queue"] is None


@pytest.mark.parametrize('updates', [{"profile_id": "CAM-N-01"}, {"input_camera_code": "CAM-N-01"},
    {"source_sha256": "0"*64}, {"original_height": 1440, "frame_height": 480}])
def test_mismatch_requires_calibration(setup, updates):
    service, _, _, meta, content, *_ = setup
    changed = meta.model_copy(update=updates)
    assert valid_profile(load_inputs(CONFIG), changed) is None
    if "frame_height" not in updates:
        result = service.detect(changed, content)
        assert result["status"] == "ZONE_CALIBRATION_REQUIRED" and result["total_queue"] is None


def test_new_video_allowed_with_explicit_same_view_confirmation(setup):
    service, _, _, meta, content, *_ = setup
    meta = meta.model_copy(update={"source_sha256": "0" * 64, "calibration_confirmed": True})
    assert service.detect(meta, content)["total_queue"] == 0


def test_invalid_config_retains_general_detection_but_no_lane_counts(setup, tmp_path, monkeypatch):
    service, detector, client, meta, content, *_ = setup
    path = tmp_path / "invalid.json"
    path.write_text('{}')
    monkeypatch.setenv('SIGAP_QUEUE_ZONES_PATH', str(path))
    detector.results = [{"class_name": "car", "confidence": .8, "bbox": [.1, .1, .2, .3]}]
    result = service.detect(meta, content)
    assert result["status"] == "ZONE_CALIBRATION_REQUIRED" and len(result["detections"]) == 1
    response = client.get('/local-video/queue-summary?mode=YOLO_LOCAL_REALTIME')
    assert response.status_code == 503
    assert len(response.json()["approaches"]) == 4
    assert all(row["total_queue"] is None for row in response.json()["approaches"])


def test_replacement_and_late_response_cannot_restore_previous_session(setup):
    service, detector, _, meta, content, _, registration = setup
    entered, release = Event(), Event()
    def slow_predict(frame):
        entered.set()
        assert release.wait(5)
        return []
    detector.predict = slow_predict
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(service.detect, meta, content)
        assert entered.wait(5)
        new = service.start(registration.model_copy(update={"revision": 2, "source_id": uuid4()}))
        assert service.latest(meta.camera_id)["total_queue"] is None
        release.set()
        with pytest.raises(HTTPException) as error:
            pending.result()
        assert error.value.status_code == 409
    service.stop(meta.camera_id, meta.session_id)  # Old cleanup cannot stop new source.
    assert service.entries[meta.camera_id]["session_id"] == new["session_id"]
    assert service.entries[meta.camera_id]["active"]
    with pytest.raises(HTTPException):
        service.start(registration)


def test_single_inference_slot_frequency_sequence_and_stop(setup):
    service, _, _, meta, content, elapsed, _ = setup
    service.inference_slot.acquire()
    try:
        with pytest.raises(HTTPException) as error:
            service.detect(meta, content)
        assert error.value.status_code == 429
    finally:
        service.inference_slot.release()
    service.detect(meta, content)
    with pytest.raises(HTTPException):
        service.detect(meta, content)
    with pytest.raises(HTTPException) as error:
        service.detect(meta.model_copy(update={"frame_sequence": 2}), content)
    assert error.value.status_code == 429
    service.stop(meta.camera_id, meta.session_id)
    elapsed[0] += 2
    with pytest.raises(HTTPException) as error:
        service.detect(meta.model_copy(update={"frame_sequence": 3}), content)
    assert error.value.status_code == 409
    assert service.latest(meta.camera_id)["total_queue"] is None


def test_http_validation_and_openapi(setup):
    service, _, client, meta, content, *_ = setup
    headers = {"Content-Type": "image/jpeg", "X-Frame-Metadata": meta.model_dump_json()}
    assert client.post('/local-video/detect-frame', content=b'bad-image', headers=headers).status_code == 422
    service.entries[meta.camera_id]["last_attempt"] = float('-inf')
    service.entries[meta.camera_id]["sequence"] = 0
    assert client.post('/local-video/detect-frame', content=b'x' * (2*1024*1024+1), headers=headers).status_code == 413
    assert client.post('/local-video/detect-frame', content=content, headers={**headers, "Content-Type": "text/plain"}).status_code == 415
    response = client.post('/local-video/detect-frame', content=content, headers=headers)
    assert response.status_code == 200
    for forbidden in ('tracking_id', 'ocr', 'license_plate', 'face'):
        assert forbidden not in response.text.lower()
    assert '/local-video/detect-frame' in client.get('/openapi.json').json()['paths']


def test_simulator_and_yolo_caches_are_separate(setup, monkeypatch):
    service, _, client, meta, content, *_ = setup
    from app.queue_estimator import QueueEstimate
    monkeypatch.setenv('SIGAP_QUEUE_ESTIMATION_MODE', 'SIMULATOR')
    monkeypatch.setattr(queue_summary, 'estimate_queues', lambda *a: {c: QueueEstimate(9, 7, 'SIMULATOR', 'SIMULATOR', 'unit fixture') for c in ['CAM-W-01','CAM-N-01','CAM-E-01','CAM-S-01']})
    assert client.get('/local-video/queue-summary').json()['approaches'][0]['total_queue'] == 16
    assert client.get('/local-video/queue-summary?mode=YOLO_LOCAL_REALTIME').json()['approaches'][0]['total_queue'] is None
    service.detect(meta, content)
    assert client.get('/local-video/queue-summary?mode=YOLO_LOCAL_REALTIME').json()['approaches'][0]['total_queue'] == 0
    assert client.get('/local-video/queue-summary').json()['approaches'][0]['total_queue'] == 16
