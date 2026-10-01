import hashlib
import sys
from types import SimpleNamespace

import pytest

from app.yolo_detector import MODEL_NAME, ModelUnavailable, YoloDetector, vehicle_detections


def test_dataset_aliases_are_canonical_without_confusing_unrelated_classes():
    names = {0: "car", 1: "big bus", 2: "bus-s-", 3: "truck-xl-", 4: "motorcycle", 5: "person"}
    boxes = [[10, 10, 30, 40, .9, index] for index in names]
    rows = vehicle_detections(names, boxes, 100, 100)
    assert [row["class_name"] for row in rows] == ["car", "bus", "bus", "truck", "motorcycle"]
    assert not vehicle_detections(["car"], [[1, 1, 5, 5, .9, -1], [1, 1, 5, 5, .9, 2]], 100, 100)


def test_custom_weights_require_explicit_hash_before_loading(tmp_path, monkeypatch):
    weights = tmp_path / "best.pt"
    weights.write_bytes(b"unit fixture, not real torch weights")
    monkeypatch.setenv("SIGAP_YOLO_MODEL_PROFILE", "vehicles-v2")
    monkeypatch.setenv("SIGAP_YOLO_WEIGHTS", str(weights))
    monkeypatch.delenv("SIGAP_YOLO_WEIGHTS_SHA256", raising=False)
    with pytest.raises(ModelUnavailable, match="SHA256"):
        YoloDetector().load()
    monkeypatch.setenv("SIGAP_YOLO_WEIGHTS_SHA256", "0" * 64)
    with pytest.raises(ModelUnavailable, match="SHA256 weights berbeda"):
        YoloDetector().load()


def test_local_custom_model_reports_its_classes_and_preserves_coco_default(tmp_path, monkeypatch):
    assert YoloDetector().readiness()["model_name"] == MODEL_NAME
    weights = tmp_path / "best.pt"
    weights.write_bytes(b"unit fixture")
    monkeypatch.setenv("SIGAP_YOLO_MODEL_PROFILE", "vehicles-v2")
    monkeypatch.setenv("SIGAP_YOLO_WEIGHTS", str(weights))
    monkeypatch.setenv("SIGAP_YOLO_WEIGHTS_SHA256", hashlib.sha256(weights.read_bytes()).hexdigest())
    model = SimpleNamespace(names={0: "car", 1: "bus", 2: "truck"})
    monkeypatch.setitem(sys.modules, "torch", SimpleNamespace(set_num_threads=lambda _: None))
    monkeypatch.setitem(sys.modules, "ultralytics", SimpleNamespace(YOLO=lambda *a, **k: model, settings={}))
    detector = YoloDetector()
    detector.load()
    ready = detector.readiness()
    assert ready["ready"]
    assert ready["model_profile"] == "vehicles-v2"
    assert ready["covered_classes"] == ["bus", "car", "truck"]
    assert ready["missing_vehicle_classes"] == ["motorcycle"]
    assert "vehicles v2" in ready["model_name"]


def test_unknown_profile_is_not_silently_loaded(monkeypatch):
    monkeypatch.setenv("SIGAP_YOLO_MODEL_PROFILE", "unknown")
    with pytest.raises(ModelUnavailable, match="MODEL_PROFILE"):
        YoloDetector().load()
