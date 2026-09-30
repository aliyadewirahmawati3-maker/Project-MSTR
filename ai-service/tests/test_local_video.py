import contextlib
from dataclasses import replace
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest

from app.local_video import InputError, load_inputs, main, validate_polygon, validate_sources

DEFAULT_CONFIG = Path(os.getenv("SIGAP_QUEUE_ZONES_PATH", Path(__file__).resolve().parents[2] / "config/cctv/queue_zones.json"))


class LocalVideoInputTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads(DEFAULT_CONFIG.read_text(encoding="utf-8"))
        self.cameras = load_inputs(DEFAULT_CONFIG)

    def load_modified(self, data):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.json"
            path.write_text(json.dumps(data), encoding="utf-8")
            return load_inputs(path)

    def test_four_unique_directions_eight_zones_and_original_pixels(self):
        self.assertEqual(len(self.cameras), 4)
        self.assertEqual({c.direction for c in self.cameras}, {"WEST", "NORTH", "EAST", "SOUTH"})
        self.assertEqual(sum(len(c.zones) for c in self.cameras), 8)
        for camera in self.cameras:
            self.assertEqual((camera.width, camera.height), (1920, 1080))
            for normalized, pixel in zip(camera.zones, camera.pixel_zones()):
                for (u, v), (x, y) in zip(normalized.polygon, pixel["polygon_pixels"]):
                    self.assertEqual((x, y), (round(u * 1919), round(v * 1079)))
                    self.assertTrue(0 <= x < 1920 and 0 <= y < 1080)

    def test_duplicate_or_wrong_direction_rejected(self):
        for direction in ("WEST", "UNKNOWN"):
            with self.subTest(direction=direction):
                self.data["cameras"][1]["direction"] = direction
                with self.assertRaises(InputError):
                    self.load_modified(self.data)

    def test_duplicate_camera_or_missing_zone_rejected(self):
        self.data["cameras"][1]["camera_code"] = "CAM-W-01"
        with self.assertRaises(InputError):
            self.load_modified(self.data)
        self.data = json.loads(DEFAULT_CONFIG.read_text())
        self.data["cameras"][0]["zones"].pop()
        with self.assertRaises(InputError):
            self.load_modified(self.data)

    def test_browser_reference_rejected(self):
        self.data["coordinate_system"]["reference"] = "browser_display"
        with self.assertRaises(InputError):
            self.load_modified(self.data)

    def test_invalid_structure_rejected(self):
        for data in ([], None, {**self.data, "cameras": None}, {**self.data, "coordinate_system": []}):
            with self.subTest(data=data), self.assertRaises(InputError):
                self.load_modified(data)

    def test_source_cannot_resolve_outside_offline_root(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "root"
            root.mkdir()
            outside = Path(directory) / "outside.mp4"
            outside.touch()
            # Direct model construction isolates the containment defense; the
            # JSON loader already rejects this filename before filesystem I/O.
            camera = replace(self.cameras[0], filename="../outside.mp4")
            with self.assertRaises(InputError) as error:
                camera.resolve_file(root)
            self.assertEqual(error.exception.code, "INVALID_PATH")

    def test_blob_network_and_absolute_paths_rejected(self):
        for value in ("blob:http://localhost/id", "https://host/video.mp4", "../video.mp4", "/video.mp4", "C:\\video.mp4"):
            with self.subTest(value=value):
                self.data["cameras"][0]["source_filename"] = value
                with self.assertRaises(InputError):
                    self.load_modified(self.data)

    def test_polygon_range_and_nonfinite_rejected(self):
        for value in (-0.1, 1.1, True, float("nan"), float("inf"), "0.5"):
            with self.subTest(value=value):
                self.data["cameras"][0]["zones"][0]["polygon"][0][0] = value
                with self.assertRaises(InputError):
                    self.load_modified(self.data)

    def test_degenerate_crossed_repeated_and_overlapping_edges_rejected(self):
        for points in (
            [[0, 0], [1, 1]], [[0, 0], [.5, .5], [1, 1]],
            [[0, 0], [1, 0], [1, 1], [0, 0]],
            [[0, 0], [1, .8], [0, 1], [.8, 0]],
            [[0, 0], [1, 0], [.5, 0], [1, 1], [0, 1]],
        ):
            with self.subTest(points=points), self.assertRaises(InputError):
                validate_polygon(points)

    def test_wrong_lane_rules_rejected(self):
        self.data["cameras"][0]["zones"][0]["movement_rules"] = "STRAIGHT_OR_RIGHT"
        with self.assertRaises(InputError):
            self.load_modified(self.data)

    def test_all_missing_files_reported_without_decoding(self):
        with tempfile.TemporaryDirectory() as directory:
            reports = validate_sources(self.cameras, directory, probe=lambda *_: self.fail("No file should be decoded"))
        self.assertEqual([r["status"] for r in reports], ["MISSING_FILE"] * 4)

    def source_case(self, *, metadata_patch=None, probe_error=None, match_hash=True):
        # Deliberately non-video bytes. A stub isolates the metadata boundary;
        # integration validation separately decodes the real local recordings.
        camera = self.cameras[0]
        payload = b"unit-test fixture; not video or detection data"
        if match_hash:
            camera = replace(camera, source_sha256=hashlib.sha256(payload).hexdigest())
        metadata = {"width": camera.width, "height": camera.height, "fps": camera.fps,
                    "frame_count": camera.frame_count, "duration_seconds": camera.frame_count / camera.fps}
        metadata.update(metadata_patch or {})

        def probe(*_):
            if probe_error:
                raise probe_error
            return metadata

        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / camera.filename).write_bytes(payload)
            return validate_sources([camera], directory, probe=probe)[0]

    def test_reference_resolution_mismatch_fails(self):
        self.assertEqual(self.source_case(metadata_patch={"width": 640, "height": 360})["status"], "RESOLUTION_MISMATCH")

    def test_changed_video_timing_fails(self):
        self.assertEqual(self.source_case(metadata_patch={"fps": 24})["status"], "METADATA_MISMATCH")

    def test_same_resolution_different_content_fails_hash(self):
        self.assertEqual(self.source_case(match_hash=False)["status"], "SOURCE_HASH_MISMATCH")

    def test_unreadable_video_is_not_ready(self):
        report = self.source_case(probe_error=InputError("UNREADABLE_VIDEO", "Decode failed"))
        self.assertEqual(report["status"], "UNREADABLE_VIDEO")
        self.assertNotIn("zones", report)

    def test_valid_source_exposes_only_input_metadata_and_manual_zones(self):
        report = self.source_case()
        self.assertEqual(report["status"], "VALID")
        self.assertEqual(set(report), {"camera_code", "direction", "filename", "status", "metadata", "source_sha256", "zones"})

    def test_schema_only_never_claims_files_ready(self):
        with contextlib.redirect_stdout(io.StringIO()) as output:
            code = main(["--config", str(DEFAULT_CONFIG), "--schema-only"])
        result = json.loads(output.getvalue())
        self.assertEqual(code, 0)
        self.assertFalse(result["ready_for_stage4_input"])
        self.assertFalse(result["inference_enabled"])
        self.assertEqual(result["source_validation"], "NOT_RUN")

    def test_missing_sources_cli_fails(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()) as output:
            code = main(["--config", str(DEFAULT_CONFIG), "--root", directory])
        self.assertEqual(code, 1)
        self.assertFalse(json.loads(output.getvalue())["ready_for_stage4_input"])


if __name__ == "__main__":
    unittest.main()
