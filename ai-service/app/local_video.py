"""Stage 3.8 offline input contract and read-only validation. No inference."""

import argparse
from dataclasses import dataclass
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys

CAMERAS = {"CAM-W-01": "WEST", "CAM-N-01": "NORTH", "CAM-E-01": "EAST", "CAM-S-01": "SOUTH"}
RULES = {"outer": "LEFT_OR_STRAIGHT", "inner": "STRAIGHT_OR_RIGHT"}


class InputError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def require(condition, message, code="INVALID_CONFIG"):
    if not condition:
        raise InputError(code, message)


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def cross(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def on_segment(a, b, p):
    return (abs(cross(a, b, p)) < 1e-12
            and min(a[0], b[0]) <= p[0] <= max(a[0], b[0])
            and min(a[1], b[1]) <= p[1] <= max(a[1], b[1]))


def intersects(a, b, c, d):
    return ((cross(a, b, c) * cross(a, b, d) < 0 and cross(c, d, a) * cross(c, d, b) < 0)
            or any((on_segment(a, b, c), on_segment(a, b, d), on_segment(c, d, a), on_segment(c, d, b))))


def validate_polygon(points):
    require(isinstance(points, list) and len(points) >= 3, "Polygon needs at least three vertices")
    for point in points:
        require(isinstance(point, list) and len(point) == 2
                and all(finite(v) and 0 <= v <= 1 for v in point), "Polygon coordinates must be in 0..1")
    require(len(set(map(tuple, points))) == len(points), "Repeated polygon vertex")
    area = 0
    n = len(points)
    for i in range(n):
        a, b, c = points[i], points[(i + 1) % n], points[(i + 2) % n]
        area += a[0] * b[1] - b[0] * a[1]
        require(abs(cross(a, b, c)) >= 1e-12 or
                (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) >= 0,
                "Overlapping adjacent polygon edges")
        for j in range(i + 1, n):
            if j == i + 1 or (i == 0 and j == n - 1):
                continue
            require(not intersects(a, b, points[j], points[(j + 1) % n]), "Self-intersecting polygon")
    require(abs(area) > 2e-6, "Degenerate polygon")


@dataclass(frozen=True)
class QueueZone:
    zone_id: str
    lane_type: str
    movement_rules: str
    polygon: tuple


@dataclass(frozen=True)
class SourceIdentity:
    source_sha256: str
    camera_code: str
    profile_id: str


@dataclass(frozen=True)
class CameraInput:
    camera_code: str
    direction: str
    filename: str
    source_sha256: str
    width: int
    height: int
    fps: float
    frame_count: int
    reference_seconds: float
    zones: tuple
    profile_id: str
    registered_sources: tuple
    aspect_ratio_tolerance: float

    def resolve_file(self, root):
        root = Path(root).resolve(strict=True)
        candidate = (root / self.filename).resolve(strict=True)
        require(candidate.is_relative_to(root), "File escapes offline root", "INVALID_PATH")
        require(candidate.is_file(), "Source is not a regular file", "INVALID_PATH")
        return candidate

    def pixel_zones(self, width=None, height=None, input_camera_code=None):
        """Scale normalized profile to the current original decoded frame."""
        width = self.width if width is None else width
        height = self.height if height is None else height
        require(input_camera_code is None or input_camera_code == self.camera_code,
                "Input camera does not match active zone profile", "CAMERA_PROFILE_MISMATCH")
        require(all(type(v) is int and v > 0 for v in (width, height)), "Invalid frame size")
        require(abs((width / height) / (self.width / self.height) - 1) <= self.aspect_ratio_tolerance,
                "Frame aspect ratio changed; recalibrate before use", "ASPECT_RATIO_MISMATCH")
        return [{"zone_id": zone.zone_id, "lane_type": zone.lane_type,
                 "movement_rules": zone.movement_rules,
                 "polygon_pixels": [[round(x * (width - 1)), round(y * (height - 1))]
                                    for x, y in zone.polygon]} for zone in self.zones]


def load_inputs(config_path):
    data = json.loads(Path(config_path).read_text(encoding="utf-8-sig"))
    require(isinstance(data, dict), "Configuration must be an object")
    require(data.get("schema_version") == 1 and data.get("input_contract_version") == 2, "Unsupported contract version")
    require(data.get("source_kind") == "LOCAL_OFFLINE_RECORDING", "Only offline files accepted")
    require(data.get("annotation_method") == "MANUAL_FROM_DECODED_FRAMES", "Manual calibration required")
    coords = data["coordinate_system"]
    require(isinstance(coords, dict), "coordinate_system must be an object")
    require(all(coords.get(k) == v for k, v in {
        "space": "normalized", "reference": "original_decoded_frame", "origin": "top_left",
        "x_axis": "right", "y_axis": "down", "resolution_policy": "same_aspect_ratio"
    }.items()), "Coordinates must reference the original decoded video, not the display")
    cameras = data["cameras"]
    require(isinstance(cameras, list) and len(cameras) == 4 and all(isinstance(c, dict) for c in cameras), "Exactly four camera objects required")
    require({c["camera_code"] for c in cameras} == set(CAMERAS), "Camera IDs missing or duplicated")
    require({c["direction"] for c in cameras} == set(CAMERAS.values()), "Directions must be unique")
    profiles = {c["profile_id"]: c["camera_code"] for c in cameras}
    require(len(profiles) == 4, "Profile IDs must be unique")
    tolerance = data["aspect_ratio_tolerance"]
    require(finite(tolerance) and 0 <= tolerance <= .005, "Invalid aspect ratio tolerance")
    identities, hashes = [], set()
    require(isinstance(data["video_sources"], list), "video_sources must be a list")
    for item in data["video_sources"]:
        digest = item["source_sha256"]
        require(isinstance(digest, str) and re.fullmatch(r"[0-9a-f]{64}", digest) and digest not in hashes,
                "Invalid or duplicate registered source SHA256")
        require(item["camera_code"] in CAMERAS and profiles.get(item["profile_id"]) == item["camera_code"],
                "Registered source camera/profile mismatch")
        require(item["viewpoint_confirmed"] is True, "Registered source viewpoint must be manually confirmed")
        hashes.add(digest)
        identities.append(SourceIdentity(digest, item["camera_code"], item["profile_id"]))
    result, filenames = [], set()
    for camera in cameras:
        code, direction = camera["camera_code"], camera["direction"]
        require(CAMERAS[code] == direction, f"{code}: direction mismatch")
        filename = camera["source_filename"]
        require(isinstance(filename, str) and filename.lower().endswith(".mp4")
                and not any(char in filename for char in ("/", "\\", ":", "\0"))
                and filename not in (".", ".."), f"{code}: local MP4 basename required; URLs/paths forbidden")
        require(filename.casefold() not in filenames, "Each camera requires a distinct source file")
        filenames.add(filename.casefold())
        digest = camera["source_sha256"]
        require(isinstance(digest, str) and re.fullmatch(r"[0-9a-f]{64}", digest), f"{code}: invalid SHA256")
        expected = camera["expected_metadata"]
        require(isinstance(expected, dict), "expected_metadata must be an object")
        require(all(type(expected[k]) is int and expected[k] > 0 for k in ("width", "height", "frame_count")), "Invalid original dimensions/frame count")
        require(finite(expected["fps"]) and expected["fps"] > 0, "Invalid FPS")
        ref = camera["reference_frame"]
        require(all(type(ref[k]) is int and ref[k] > 0 for k in ("width", "height"))
                and finite(ref["aspect_ratio"]) and math.isclose(ref["aspect_ratio"], ref["width"] / ref["height"], abs_tol=1e-9),
                "Invalid profile reference frame")
        calibration = camera["calibration"]
        require(calibration["status"] == "VALID" and calibration["method"] == "MANUAL_FROM_DECODED_FRAMES"
                and type(calibration["revision"]) is int and calibration["revision"] > 0,
                "Zone profile has no valid manual calibration")
        reference = camera["reference_frame_seconds"]
        require(finite(reference) and 0 <= reference < expected["frame_count"] / expected["fps"], "Reference frame out of bounds")
        zones = camera["zones"]
        require(isinstance(zones, list) and len(zones) == 2 and all(isinstance(z, dict) for z in zones)
                and {z["lane_type"] for z in zones} == set(RULES), f"{code}: exactly outer and inner required")
        parsed = []
        for zone in zones:
            lane = zone["lane_type"]
            require(zone["zone_id"] == f"{code}-{lane}" and zone["movement_rules"] == RULES[lane], f"{code}: lane contract mismatch")
            validate_polygon(zone["polygon"])
            parsed.append(QueueZone(zone["zone_id"], lane, zone["movement_rules"], tuple(map(tuple, zone["polygon"]))))
        result.append(CameraInput(code, direction, filename, digest, ref["width"], ref["height"],
                                  expected["fps"], expected["frame_count"], reference, tuple(parsed),
                                  camera["profile_id"], tuple(identities), tolerance))
    return tuple(result)


def probe_video(path, reference_seconds):
    import cv2
    cap = cv2.VideoCapture(str(path))
    try:
        require(cap.isOpened(), "Video cannot be opened", "UNREADABLE_VIDEO")
        width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps, count = cap.get(cv2.CAP_PROP_FPS), int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        require(width > 0 and height > 0 and finite(fps) and fps > 0 and count > 0, "Invalid video metadata", "UNREADABLE_VIDEO")
        reference = min(round(reference_seconds * fps), count - 1)
        require(0 <= reference < count, "Reference frame unavailable", "UNREADABLE_VIDEO")
        for index in sorted({0, reference, count - 1}):
            require(cap.set(cv2.CAP_PROP_POS_FRAMES, index), f"Cannot seek frame {index}", "UNREADABLE_VIDEO")
            ok, frame = cap.read()
            require(ok and frame is not None and frame.shape[:2] == (height, width), f"Cannot decode frame {index}", "UNREADABLE_VIDEO")
        return {"width": width, "height": height, "fps": fps, "frame_count": count, "duration_seconds": count / fps}
    except cv2.error as error:
        raise InputError("UNREADABLE_VIDEO", "Video decoder failed") from error
    finally:
        cap.release()


def validate_sources(cameras, root, probe=probe_video):
    reports = []
    for camera in cameras:
        report = {"camera_code": camera.camera_code, "direction": camera.direction, "filename": camera.filename,
                  "zone_analysis_eligible": False}
        try:
            path = camera.resolve_file(root)
            with path.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            identity = next((item for item in camera.registered_sources if item.source_sha256 == digest), None)
            require(identity is not None, "Zona antrean belum dikalibrasi untuk sumber ini", "UNCALIBRATED_SOURCE")
            require(identity.camera_code == camera.camera_code and identity.profile_id == camera.profile_id,
                    "Input camera does not match active zone profile", "CAMERA_PROFILE_MISMATCH")
            metadata = probe(path, camera.reference_seconds)
            zones = camera.pixel_zones(metadata["width"], metadata["height"], identity.camera_code)
            report.update(status="VALID", metadata=metadata, source_sha256=digest, zones=zones,
                          profile_id=camera.profile_id, zone_analysis_eligible=True)
        except FileNotFoundError:
            report.update(status="MISSING_FILE", error="Expected MP4 or offline source directory is missing")
        except InputError as error:
            report.update(status=error.code, error=str(error))
        except OSError:
            report.update(status="READ_ERROR", error="Cannot read local source")
        reports.append(report)
    return reports


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=os.getenv("SIGAP_QUEUE_ZONES_PATH", "/config/cctv/queue_zones.json"))
    parser.add_argument("--root", type=Path, default=os.getenv("SIGAP_OFFLINE_ROOT", "/data/cctv-offline"))
    parser.add_argument("--schema-only", action="store_true", help="Validate configuration only; does NOT assert video readiness")
    args = parser.parse_args(argv)
    report = {"input_contract_version": 2, "mode": "configuration_only", "inference_enabled": False,
              "ready_for_stage4_input": False}
    try:
        cameras = load_inputs(args.config)
        report.update(configuration_valid=True, camera_count=len(cameras), zone_count=sum(len(c.zones) for c in cameras))
        if args.schema_only:
            report.update(source_validation="NOT_RUN")
        else:
            report["sources"] = validate_sources(cameras, args.root)
            report["ready_for_stage4_input"] = all(source["status"] == "VALID" for source in report["sources"])
        exit_code = 0 if args.schema_only or report["ready_for_stage4_input"] else 1
    except (ValueError, OSError, KeyError, TypeError, ImportError) as error:
        report.update(error=str(error), ready_for_stage4_input=False)
        exit_code = 1
    print(json.dumps(report, indent=2))
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
