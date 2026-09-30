"""Configuration contract tests: no videos, OpenCV, or backend needed."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

from tools.cctv.stage3 import DEFAULT_CONFIG, load_zones, read_environment, resolve_video, validate_polygon


class Stage3ConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads(DEFAULT_CONFIG.read_text(encoding="utf-8"))

    def load_modified(self, data):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "zones.json"
            path.write_text(json.dumps(data), encoding="utf-8")
            return load_zones(path)

    def test_four_mapped_cameras_eight_normalized_zones(self):
        data = load_zones()
        self.assertEqual({c["camera_code"]: c["direction"] for c in data["cameras"]}, {
            "CAM-W-01": "WEST", "CAM-N-01": "NORTH", "CAM-E-01": "EAST", "CAM-S-01": "SOUTH"
        })
        zones = [z for c in data["cameras"] for z in c["zones"]]
        self.assertEqual(len(zones), 8)
        for zone in zones:
            for x, y in zone["polygon"]:
                self.assertTrue(0 <= x <= 1 and 0 <= y <= 1)

    def test_reject_missing_duplicate_camera_or_extra_zone(self):
        for mutation in ("missing", "duplicate", "extra_zone"):
            with self.subTest(mutation=mutation):
                data = copy.deepcopy(self.data)
                if mutation == "missing":
                    data["cameras"].pop()
                elif mutation == "duplicate":
                    data["cameras"][3] = copy.deepcopy(data["cameras"][0])
                else:
                    data["cameras"][0]["zones"].append(copy.deepcopy(data["cameras"][0]["zones"][0]))
                with self.assertRaises(ValueError):
                    self.load_modified(data)

    def test_reject_wrong_direction_environment_or_movement(self):
        for key, value in (("direction", "EAST"), ("video_env", "SIGAP_VIDEO_EAST")):
            with self.subTest(key=key):
                data = copy.deepcopy(self.data)
                data["cameras"][0][key] = value
                with self.assertRaises(ValueError):
                    self.load_modified(data)
        self.data["cameras"][0]["zones"][0]["movement_rules"] = "STRAIGHT_OR_RIGHT"
        with self.assertRaises(ValueError):
            self.load_modified(self.data)

    def test_reject_invalid_coordinates(self):
        for value in (-0.01, 1.01, float("nan"), float("inf"), True, "0.5"):
            with self.subTest(value=value):
                data = copy.deepcopy(self.data)
                data["cameras"][0]["zones"][0]["polygon"][0][0] = value
                with self.assertRaises(ValueError):
                    self.load_modified(data)

    def test_reject_degenerate_or_crossed_polygons(self):
        for polygon in (
            [[0, 0], [1, 1]],
            [[0, 0], [0.5, 0.5], [1, 1]],
            [[0, 0], [1, 0], [1, 1], [0, 0]],
            [[0, 0], [1, 0.8], [0, 1], [0.8, 0]],
        ):
            with self.subTest(polygon=polygon), self.assertRaises(ValueError):
                validate_polygon(polygon, "test")

    def test_read_literal_windows_path_with_spaces_and_bom(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / ".env"
            path.write_text('SIGAP_VIDEO_WEST="D:\\local footage\\west.mp4"\n', encoding="utf-8-sig")
            self.assertEqual(read_environment(path)["SIGAP_VIDEO_WEST"], r"D:\local footage\west.mp4")

    def test_reject_missing_relative_or_stream_sources(self):
        camera = self.data["cameras"][0]
        for value in ("", "relative/video.mp4", "https://example.invalid/video.mp4", "rtsp://example.invalid/live"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                resolve_video(camera, {camera["video_env"]: value})


if __name__ == "__main__":
    unittest.main()
