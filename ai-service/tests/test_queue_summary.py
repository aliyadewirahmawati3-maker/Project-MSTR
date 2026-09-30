import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.local_video import CameraInput
from app.main import app

CONFIG = Path(os.getenv("SIGAP_QUEUE_ZONES_PATH", Path(__file__).resolve().parents[2] / "config/cctv/queue_zones.json"))
URL = "/local-video/queue-summary"
EXPECTED = [("WEST", "Barat", "CAM-W-01"), ("NORTH", "Utara", "CAM-N-01"),
            ("EAST", "Timur", "CAM-E-01"), ("SOUTH", "Selatan", "CAM-S-01")]


@pytest.fixture
def config(tmp_path, monkeypatch):
    data = json.loads(CONFIG.read_text(encoding="utf-8"))
    path = tmp_path / "queue_zones.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    monkeypatch.setenv("SIGAP_QUEUE_ZONES_PATH", str(path))
    return path, data


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client


def assert_unmeasured(body):
    assert body["source_type"] == "OFFLINE_CONFIG"
    assert body["inference_enabled"] is False
    assert body["source_validation"] == "NOT_RUN"
    assert [(row["approach_code"], row["approach_name"]) for row in body["approaches"]] == [item[:2] for item in EXPECTED]
    for row in body["approaches"]:
        assert row["source_type"] == "OFFLINE_CONFIG"
        assert all(row[key] is None for key in ("outer_lane_queue", "inner_lane_queue", "total_queue"))
        assert row["note"]


def test_summary_uses_config_without_reading_video_or_writing(config, client, monkeypatch):
    path, data = config
    data["cameras"][0]["profile_id"] = "west-reviewed-profile"
    data["video_sources"][0]["profile_id"] = "west-reviewed-profile"
    data["cameras"].reverse()  # Input order must not change the public direction order.
    path.write_text(json.dumps(data), encoding="utf-8")
    before = path.read_bytes()

    def no_video(*args):
        pytest.fail("Summary must not open/hash/decode videos")

    monkeypatch.setattr(CameraInput, "resolve_file", no_video)
    monkeypatch.setenv("SIGAP_OFFLINE_ROOT", str(path.parent / "no-video-directory"))
    response = client.get(URL)
    assert response.status_code == 200
    body = response.json()
    assert_unmeasured(body)
    assert body["configuration_valid"] is True
    assert body["error_code"] is None
    assert [row["camera_id"] for row in body["approaches"]] == [item[2] for item in EXPECTED]
    assert [row["profile_id"] for row in body["approaches"]] == ["west-reviewed-profile", "CAM-N-01", "CAM-E-01", "CAM-S-01"]
    assert all(row["status"] == "WAITING_FOR_DETECTION" for row in body["approaches"])
    assert path.read_bytes() == before
    assert sorted(p.name for p in path.parent.iterdir()) == [path.name]


@pytest.mark.parametrize("problem", ["missing", "json", "encoding", "camera", "lane", "polygon", "profile", "nested", "null"])
def test_invalid_config_returns_safe_four_directions(config, client, problem):
    path, data = config
    if problem == "missing":
        path.unlink()
    elif problem == "json":
        path.write_text('{"private":', encoding="utf-8")
    elif problem == "encoding":
        path.write_bytes(b"\xff\xfe\x00")
    else:
        if problem == "camera":
            data["cameras"].pop()
        elif problem == "lane":
            data["cameras"][0]["zones"].pop()
        elif problem == "polygon":
            data["cameras"][0]["zones"][0]["polygon"][0] = [-1, 2]
        elif problem == "profile":
            data["video_sources"][0]["profile_id"] = "CAM-N-01"
        elif problem == "nested":
            data["cameras"][0]["calibration"] = None
        elif problem == "null":
            data = None
        path.write_text(json.dumps(data), encoding="utf-8")
    response = client.get(URL)
    assert response.status_code == 503
    body = response.json()
    assert_unmeasured(body)
    assert body["configuration_valid"] is False
    assert body["error_code"] == "INVALID_ZONE_CONFIG"
    for row in body["approaches"]:
        assert row["status"] == "OFFLINE_CONFIG"
        assert row["camera_id"] is None and row["profile_id"] is None
    assert str(path) not in response.text
    assert client.get("/health").json()["status"] == "healthy"


def test_config_reload_does_not_reuse_previous_valid_summary(config, client):
    path, data = config
    assert client.get(URL).status_code == 200
    path.write_text("{}", encoding="utf-8")
    assert client.get(URL).status_code == 503
    path.write_text(json.dumps(data), encoding="utf-8")
    assert client.get(URL).status_code == 200


def test_endpoint_is_documented_and_read_only(config, client):
    operations = client.get("/openapi.json").json()["paths"][URL]
    assert set(operations) == {"get"}
    assert "503" in operations["get"]["responses"]
    assert client.post(URL).status_code == 405
