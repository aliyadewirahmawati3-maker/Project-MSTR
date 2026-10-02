"""Unit fixtures only; real YOLO evidence comes from scripts/verify_yolo_local.py."""
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import datetime, timezone, timedelta
import json
import os
import time
from pathlib import Path
from threading import Barrier, Event
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


def test_four_simultaneous_cameras_drop_busy_frames_without_queue(setup):
    service, detector, _, meta, content, _, registration = setup
    barrier = Barrier(4)
    entered, release = Event(), Event()
    active = 0
    peak = 0
    def predict(frame):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        entered.set()
        assert release.wait(5)
        active -= 1
        return []
    detector.predict = predict
    frames = []
    for camera in load_inputs(CONFIG):
        session = service.start(registration.model_copy(update={"camera_id": camera.camera_code,
            "revision": 2, "source_id": uuid4()}))
        frames.append(meta.model_copy(update={"camera_id": camera.camera_code, "session_id": session["session_id"],
            "source_id": session["source_id"], "profile_id": camera.profile_id,
            "input_camera_code": camera.camera_code, "source_sha256": camera.source_sha256}))
    def send(frame):
        barrier.wait(timeout=5)
        try:
            return service.detect(frame, content)
        except HTTPException as error:
            return error.status_code
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(send, frame) for frame in frames]
        assert entered.wait(5)
        try:
            deadline = time.monotonic() + 2
            while sum(f.done() for f in futures) < 3 and time.monotonic() < deadline:
                time.sleep(.005)
            assert sum(f.done() for f in futures) == 3
        finally:
            release.set()
        results = [f.result(timeout=5) for f in futures]
    assert results.count(429) == 3
    assert sum(isinstance(row, dict) and row["status"] == "DETECTION_READY" for row in results) == 1
    assert peak == 1
    assert not service.pending_cameras


def test_processing_camera_rejects_duplicates_and_replacement_discards_old_result(setup):
    service, detector, _, meta, content, _, registration = setup
    entered, release = Event(), Event()
    def predict(frame):
        entered.set()
        assert release.wait(5)
        return []
    detector.predict = predict
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(service.detect, meta, content)
        assert entered.wait(5)
        try:
            assert meta.camera_id in service.pending_cameras
            with pytest.raises(HTTPException) as error:
                service.detect(meta.model_copy(update={"frame_sequence": 2}), content)
            assert error.value.status_code == 429
            service.start(registration.model_copy(update={"revision": 2, "source_id": uuid4()}))
        finally:
            release.set()
        with pytest.raises(HTTPException) as error:
            pending.result(timeout=5)
        assert error.value.status_code == 409
    assert not service.pending_cameras


def test_frame_that_expires_before_or_during_processing_never_feeds_queues(setup):
    service, detector, _, meta, content, elapsed, _ = setup
    elapsed[0] = service.max_age + 1
    with pytest.raises(HTTPException) as error:
        service.detect(meta, content)
    assert error.value.status_code == 422
    assert detector.calls == 0
    assert not service.pending_cameras
    elapsed[0] = 0
    service.entries[meta.camera_id]["last_attempt"] = float('-inf')
    def slow_predict(frame):
        elapsed[0] += service.max_age + 1
        return [{"class_name": "car", "confidence": .9, "bbox": [.1, .1, .2, .3]}]
    detector.predict = slow_predict
    result = service.detect(meta.model_copy(update={"frame_sequence": 2}), content)
    assert result["status"] == "STALE" and result["stale"]
    assert result["total_queue"] is None and result["detections"] == []
    assert service.latest(meta.camera_id)["total_queue"] is None


def test_default_capacity_is_two_fps_and_age_two_seconds(monkeypatch):
    monkeypatch.delenv("SIGAP_YOLO_MIN_INTERVAL_SECONDS", raising=False)
    monkeypatch.delenv("SIGAP_YOLO_MAX_AGE_SECONDS", raising=False)
    monkeypatch.delenv("SIGAP_YOLO_CONFIDENCE", raising=False)
    service = FrameInferenceService(DetectorFixture())
    assert service.min_interval == .5
    assert service.max_age == 2
    assert YoloDetector().confidence == .45


def test_second_frame_at_half_second_replaces_latest_valid_result(setup):
    service, _, _, meta, content, elapsed, _ = setup
    service.min_interval = .5
    service.detect(meta, content)
    elapsed[0] = .49
    with pytest.raises(HTTPException) as error:
        service.detect(meta.model_copy(update={"frame_sequence": 2}), content)
    assert error.value.status_code == 429
    assert service.latest(meta.camera_id)["frame_sequence"] == 1
    elapsed[0] = .5
    updated = meta.model_copy(update={"frame_sequence": 2, "captured_at": service.now(), "video_time_seconds": 5.5})
    assert service.detect(updated, content)["frame_sequence"] == 2
    assert service.latest(meta.camera_id)["video_time_seconds"] == 5.5


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


def test_single_queue_summary_counts_main_polygon_only(setup, monkeypatch, tmp_path):
    service, detector, client, meta, content, *_ = setup
    data = json.loads(CONFIG.read_text())
    camera = data['cameras'][0]
    camera['lane_mode'] = 'SINGLE_QUEUE'
    camera['zones'] = [{'zone_id': camera['camera_code'] + '-queue', 'lane_type': 'queue',
        'movement_rules': 'QUEUE', 'polygon': [[0, 0], [.5, 0], [.5, 1], [0, 1]]}]
    path = tmp_path / 'single.json'
    path.write_text(json.dumps(data))
    monkeypatch.setenv('SIGAP_QUEUE_ZONES_PATH', str(path))
    detector.results = [{'bbox': [.1, .1, .3, .8]}, {'bbox': [.7, .1, .9, .8]},
                        {'bbox': [.4, .1, .8, .8]}]
    result = service.detect(meta, content)
    assert result['lane_mode'] == 'SINGLE_QUEUE'
    assert result['queue_count'] == result['total_queue'] == result['outer_lane_queue'] == 1
    assert result['inner_lane_queue'] is None
    assert len(result['detections']) == 3
    assert [d['lane_type'] for d in result['detections']] == ['queue', None, None]
    row = client.get('/local-video/queue-summary?mode=YOLO_LOCAL_REALTIME').json()['approaches'][0]
    for field in ['lane_mode', 'queue_count', 'outer_lane_queue', 'inner_lane_queue', 'total_queue', 'status', 'note']:
        assert row[field] == result[field]
    setup[5][0] = 3
    assert service.latest(meta.camera_id)['queue_count'] is None


def test_browser_single_queue_calibration_updates_server_summary(setup):
    service, detector, client, meta, content, *_ = setup
    meta = meta.model_copy(update={'lane_mode': 'SINGLE_QUEUE', 'calibration_confirmed': True,
        'queue_polygon': [[0, 0], [.5, 0], [.5, 1], [0, 1]]})
    detector.results = [{'bbox': [.1, .1, .3, .8]}, {'bbox': [.7, .1, .9, .8]}]
    result = service.detect(meta, content)
    assert result['total_queue'] == result['queue_count'] == 1
    row = client.get('/local-video/queue-summary?mode=YOLO_LOCAL_REALTIME').json()['approaches'][0]
    assert row['lane_mode'] == 'SINGLE_QUEUE'
    assert row['queue_count'] == 1


@pytest.mark.parametrize('mode,zones,expected_lanes', [
    ('SINGLE_QUEUE', [{'lane_type': 'queue', 'polygon': [[0, 0], [.5, 0], [.5, 1], [0, 1]]}], ['queue', None, None]),
    ('DUAL_LANE', [{'lane_type': 'outer', 'polygon': [[0, 0], [.3, 0], [.3, 1], [0, 1]]},
                   {'lane_type': 'inner', 'polygon': [[.6, 0], [1, 0], [1, 1], [.6, 1]]}], ['outer', 'inner', 'inner']),
])
def test_detect_route_uses_frontend_polygons_and_marks_membership(setup, mode, zones, expected_lanes):
    service, detector, client, meta, content, elapsed, *_ = setup
    detector.results = [{'class_name': 'car', 'confidence': .9, 'bbox': [.1, .1, .3, .8]},
                        {'class_name': 'truck', 'confidence': .9, 'bbox': [.7, .1, .9, .8]},
                        {'class_name': 'bus', 'confidence': .9, 'bbox': [.4, .1, .8, .8]}]
    data = {**meta.model_dump(mode='json'), 'lane_mode': mode, 'active_zones': zones,
            'calibration_confirmed': True}
    response = client.post('/local-video/detect-frame', content=content,
        headers={'Content-Type': 'image/jpeg', 'X-Frame-Metadata': json.dumps(data)})
    assert response.status_code == 200
    result = response.json()
    assert len(result['detections']) == 3
    assert [d['lane_zone'] for d in result['detections']] == expected_lanes
    assert [d['in_queue_zone'] for d in result['detections']] == [lane is not None for lane in expected_lanes]
    assert result['queue_count'] == result['total_queue'] == (1 if mode == 'SINGLE_QUEUE' else 3)
    assert result['lane_mode'] == mode
    if mode == 'SINGLE_QUEUE':
        # Third bbox overlaps polygon but bottom-center x=.6 remains outside.
        assert result['detections'][2]['in_queue_zone'] is False
        assert result['inner_lane_queue'] is None
    else:
        assert result['outer_lane_queue'] == 1 and result['inner_lane_queue'] == 2
    row = client.get('/local-video/queue-summary?mode=YOLO_LOCAL_REALTIME').json()['approaches'][0]
    assert row['total_queue'] == result['total_queue']
    # Changing only the confirmed polygon changes counting on the next frame.
    elapsed[0] += .6
    data['frame_sequence'] += 1
    data['active_zones'][0]['polygon'] = [[0, 0], [.05, 0], [.05, 1], [0, 1]]
    second = client.post('/local-video/detect-frame', content=content,
        headers={'Content-Type': 'image/jpeg', 'X-Frame-Metadata': json.dumps(data)}).json()
    assert second['total_queue'] == (0 if mode == 'SINGLE_QUEUE' else 2)
    assert second['detections'][0]['in_queue_zone'] is False
    elapsed[0] += service.max_age + 1
    stale = client.get('/local-video/queue-summary?mode=YOLO_LOCAL_REALTIME').json()['approaches'][0]
    assert stale['total_queue'] is None and stale['queue_count'] is None
    assert client.get('/health').json()['status'] == 'healthy'


@pytest.mark.parametrize('changes', [
    {'calibration_confirmed': False},
    {'active_zones': [{'lane_type': 'inner', 'polygon': [[0, 0], [1, 0], [1, 1], [0, 1]]}]},
    {'active_zones': [{'lane_type': 'queue', 'polygon': [[0, 0], [1, 1], [0, 1], [1, 0]]}]},
])
def test_invalid_frontend_zones_never_fall_back_to_default_counts(setup, changes):
    service, detector, client, meta, content, *_ = setup
    detector.results = [{'bbox': [.1, .1, .3, .8]}]
    data = {**meta.model_dump(mode='json'), 'lane_mode': 'SINGLE_QUEUE', 'calibration_confirmed': True,
            'active_zones': [{'lane_type': 'queue', 'polygon': [[0, 0], [1, 0], [1, 1], [0, 1]]}], **changes}
    response = client.post('/local-video/detect-frame', content=content,
        headers={'Content-Type': 'image/jpeg', 'X-Frame-Metadata': json.dumps(data)})
    assert response.status_code == 200
    result = response.json()
    assert result['status'] == 'ZONE_CALIBRATION_REQUIRED'
    assert result['queue_count'] is None and result['total_queue'] is None
    assert result['detections'][0]['in_queue_zone'] is False
    assert result['detections'][0]['lane_zone'] is None
