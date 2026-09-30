"""Local video configuration and polygon preview only; no object analysis."""

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = ROOT / "config/cctv/queue_zones.json"
DEFAULT_ENV = ROOT / ".env.cctv.local"
DEFAULT_OUTPUT = ROOT / "artifacts/stage3"
CAMERAS = {
    "CAM-W-01": ("WEST", "BARAT"),
    "CAM-N-01": ("NORTH", "UTARA"),
    "CAM-E-01": ("EAST", "TIMUR"),
    "CAM-S-01": ("SOUTH", "SELATAN"),
}
MOVEMENTS = {"outer": "LEFT_OR_STRAIGHT", "inner": "STRAIGHT_OR_RIGHT"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def cross(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def intersects(a, b, c, d):
    """Include collinear touches; non-neighbor polygon edges must not touch."""
    def on_segment(p, q, r):
        return (abs(cross(p, q, r)) < 1e-12
                and min(p[0], q[0]) <= r[0] <= max(p[0], q[0])
                and min(p[1], q[1]) <= r[1] <= max(p[1], q[1]))

    return ((cross(a, b, c) * cross(a, b, d) < 0
             and cross(c, d, a) * cross(c, d, b) < 0)
            or on_segment(a, b, c) or on_segment(a, b, d)
            or on_segment(c, d, a) or on_segment(c, d, b))


def validate_polygon(polygon, label):
    require(isinstance(polygon, list) and len(polygon) >= 3,
            f"{label}: polygon requires at least three vertices")
    for point in polygon:
        require(isinstance(point, list) and len(point) == 2,
                f"{label}: each vertex must be [x, y]")
        require(all(number(v) and 0 <= v <= 1 for v in point),
                f"{label}: coordinates must be finite numbers in 0..1")
    require(len(set(map(tuple, polygon))) == len(polygon),
            f"{label}: repeated vertex (do not repeat the closing vertex)")
    n = len(polygon)
    area = abs(sum(polygon[i][0] * polygon[(i + 1) % n][1]
                   - polygon[(i + 1) % n][0] * polygon[i][1]
                   for i in range(n))) / 2
    require(area > 1e-6, f"{label}: degenerate polygon")
    for i in range(n):
        for j in range(i + 1, n):
            if j == i + 1 or (i == 0 and j == n - 1):
                continue
            require(not intersects(polygon[i], polygon[(i + 1) % n],
                                   polygon[j], polygon[(j + 1) % n]),
                    f"{label}: self-intersecting polygon")


def load_zones(path=DEFAULT_CONFIG):
    """Stdlib-only loader reusable from a future FastAPI startup, without I/O to video."""
    data = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    require(data.get("schema_version") == 1, "Unsupported zone schema")
    require(data.get("source_kind") == "LOCAL_OFFLINE_RECORDING", "Offline sources required")
    coords = data.get("coordinate_system", {})
    require(all(coords.get(k) == v for k, v in {
        "space": "normalized", "origin": "top_left", "x_axis": "right", "y_axis": "down"
    }.items()), "Unsupported coordinate system")
    cameras = data.get("cameras", [])
    require(isinstance(cameras, list) and len(cameras) == 4, "Exactly four cameras required")
    require({c["camera_code"] for c in cameras} == set(CAMERAS), "Camera mapping mismatch")
    ids = set()
    for camera in cameras:
        code = camera["camera_code"]
        direction, label = CAMERAS[code]
        require(camera["direction"] == direction and camera["direction_label"] == label,
                f"{code}: direction mismatch")
        require(camera["video_env"] == f"SIGAP_VIDEO_{direction}", f"{code}: video_env mismatch")
        prefix = "CCTV SIANG JL PADAT AMBULANS" if direction == "EAST" else "CCTV SIANG JL NORMAL"
        require(camera["source_filename"] == f"{prefix}_{label}.mp4", f"{code}: filename mismatch")
        require(re.fullmatch(r"[0-9a-f]{64}", camera["source_sha256"]) is not None,
                f"{code}: invalid SHA256")
        expected = camera["expected_metadata"]
        require(all(type(expected[k]) is int and expected[k] > 0
                    for k in ("width", "height", "frame_count")), f"{code}: invalid video dimensions/count")
        require(number(expected["fps"]) and expected["fps"] > 0, f"{code}: invalid FPS")
        stamp = camera["reference_frame_seconds"]
        require(number(stamp) and 0 <= stamp < expected["frame_count"] / expected["fps"],
                f"{code}: reference frame outside duration")
        zones = camera["zones"]
        require(len(zones) == 2 and {z["lane_type"] for z in zones} == set(MOVEMENTS),
                f"{code}: exactly outer and inner required")
        for zone in zones:
            lane = zone["lane_type"]
            require(zone["zone_id"] == f"{code}-{lane}" and zone["zone_id"] not in ids,
                    f"{code}: zone ID mismatch/duplicate")
            ids.add(zone["zone_id"])
            require(zone["movement_rules"] == MOVEMENTS[lane], f"{code}: movement rules mismatch")
            validate_polygon(zone["polygon"], zone["zone_id"])
    require(len(ids) == 8, "Exactly eight zones required")
    return data


def read_environment(path):
    """Literal KEY=value format; supports quoted Windows paths and UTF-8 BOM."""
    values = {}
    for index, line in enumerate(Path(path).read_text(encoding="utf-8-sig").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        key, value = key.strip(), value.strip()
        require(sep and re.fullmatch(r"SIGAP_VIDEO_(WEST|NORTH|EAST|SOUTH)", key),
                f"Environment line {index}: invalid key/assignment")
        require(key not in values, f"Duplicate environment key: {key}")
        if value.startswith(('"', "'")):
            require(len(value) >= 2 and value[-1] == value[0], f"{key}: unmatched quote")
            value = value[1:-1]
        values[key] = value
    return values


def resolve_video(camera, values):
    key = camera["video_env"]
    value = values.get(key, "")
    require(value and "://" not in value and not value.startswith(("\\\\", "//")),
            f"{key}: absolute local video path required (no streams/network paths)")
    path = Path(value)
    require(path.is_absolute(), f"{key}: absolute local path required")
    path = path.resolve(strict=True)
    require(path.is_file(), f"{key}: not a file")
    require(not path.is_relative_to(ROOT), f"{key}: MP4 must remain outside the repository")
    require(path.name == camera["source_filename"], f"{key}: unexpected filename {path.name}")
    return path


def inspect_video(camera, path, full_decode=False):
    import cv2

    code = camera["camera_code"]
    with path.open("rb") as stream:
        header = stream.read(32)
        stream.seek(0)
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    require(header[4:8] == b"ftyp" and b"mp41" in header, f"{code}: expected inspected MP4 container")
    require(digest == camera["source_sha256"],
            f"{code}: video changed; inspect real frames and recalibrate zones before reuse")
    cap = cv2.VideoCapture(str(path))
    try:
        require(cap.isOpened(), f"{code}: cannot open video")
        width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps, frame_count = cap.get(cv2.CAP_PROP_FPS), int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        require(width > 0 and height > 0 and number(fps) and fps > 0 and frame_count > 0,
                f"{code}: invalid video metadata")
        expected = camera["expected_metadata"]
        require((width, height, frame_count) == (expected["width"], expected["height"], expected["frame_count"])
                and math.isclose(fps, expected["fps"], abs_tol=0.01), f"{code}: metadata changed")
        fourcc = int(cap.get(cv2.CAP_PROP_FOURCC))
        codec = "".join(chr((fourcc >> (8 * i)) & 255) for i in range(4))
        reference_index = round(camera["reference_frame_seconds"] * fps)
        sample_indices = sorted({0, reference_index, frame_count // 2, frame_count - 1})
        frame = None
        decoded = 0
        if full_decode:
            while True:
                ok, current = cap.read()
                if not ok:
                    break
                require(current.shape[:2] == (height, width), f"{code}: decoded size changed")
                if decoded == reference_index:
                    frame = current.copy()
                decoded += 1
            require(decoded == frame_count, f"{code}: only {decoded}/{frame_count} video frames readable")
        else:
            for index in sample_indices:
                require(cap.set(cv2.CAP_PROP_POS_FRAMES, index), f"{code}: cannot seek frame {index}")
                ok, current = cap.read()
                require(ok and current is not None and current.shape[:2] == (height, width),
                        f"{code}: cannot decode sample frame {index}")
                if index == reference_index:
                    frame = current.copy()
                decoded += 1
        require(frame is not None, f"{code}: reference frame unavailable")
        return {
            "camera_code": code, "direction": camera["direction_label"],
            "source_filename": path.name, "source_sha256": digest,
            "size_bytes": path.stat().st_size, "format": "MP4 (ISO BMFF)",
            "major_brand": header[8:12].decode("ascii"), "codec": codec,
            "width": width, "height": height, "fps": fps, "frame_count": frame_count,
            "duration_seconds": frame_count / fps, "duration_basis": "frame_count / nominal_fps",
            "decode_mode": "all_frames" if full_decode else "sample_frames",
            "decoded_frames": decoded, "sample_frame_indices": sample_indices,
            "reference_frame_index": reference_index, "reference_frame_seconds": reference_index / fps,
            "status": "VALID",
        }, frame
    finally:
        cap.release()


def render_preview(frame, camera):
    import cv2
    import numpy as np

    height, width = frame.shape[:2]
    overlay, result = frame.copy(), frame.copy()
    colors = {"outer": (65, 210, 70), "inner": (255, 175, 40)}
    polygons = []
    for zone in camera["zones"]:
        points = np.array([[round(x * (width - 1)), round(y * (height - 1))]
                           for x, y in zone["polygon"]], dtype=np.int32)
        color = colors[zone["lane_type"]]
        cv2.fillPoly(overlay, [points], color)
        polygons.append((zone, points, color))
    cv2.addWeighted(overlay, 0.22, frame, 0.78, 0, result)
    for zone, points, color in polygons:
        cv2.polylines(result, [points], True, color, 4, cv2.LINE_AA)
        anchor = tuple(np.mean(points, axis=0).astype(int))
        cv2.putText(result, zone["lane_type"], anchor, cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 0), 5, cv2.LINE_AA)
        cv2.putText(result, zone["lane_type"], anchor, cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2, cv2.LINE_AA)
    # Dedicated caption band preserves all original pixels and source text.
    canvas = np.full((height + 180, width, 3), 24, dtype=np.uint8)
    canvas[:height] = result
    lines = [
        (f'{camera["camera_code"]} | {camera["direction_label"]} | LOCAL / OFFLINE | t={camera["reference_frame_seconds"]}s', (240, 240, 240)),
        ("outer: LEFT_OR_STRAIGHT", colors["outer"]),
        ("inner: STRAIGHT_OR_RIGHT", colors["inner"]),
        ("Manual scenario ROI | configuration preview only", (210, 210, 210)),
    ]
    for i, (text, color) in enumerate(lines):
        cv2.putText(canvas, text, (24, height + 35 + i * 40), cv2.FONT_HERSHEY_SIMPLEX, 0.85, color, 2, cv2.LINE_AA)
    return canvas


def save_jpeg(path, frame):
    import cv2
    ok, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 94])
    require(ok, f"Cannot encode preview {path.name}")
    path.write_bytes(encoded.tobytes())


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["validate", "preview"])
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--full-decode", action="store_true", help="Decode all video frames; no object analysis")
    args = parser.parse_args(argv)
    try:
        config = load_zones(args.config)
        values = read_environment(args.env_file)
        # Read/validate every source before producing any new preview/report.
        results = []
        for camera in config["cameras"]:
            try:
                path = resolve_video(camera, values)
                metadata, frame = inspect_video(camera, path, args.full_decode)
            except (ValueError, OSError) as exc:
                raise ValueError(f'{camera["camera_code"]} ({camera["source_filename"]}): {exc}') from exc
            results.append((camera, metadata, frame))
            print(f'{camera["camera_code"]}: {path.name} | {metadata["width"]}x{metadata["height"]}'
                  f' | {metadata["fps"]:.6f} FPS | {metadata["duration_seconds"]:.6f}s | VALID')
        args.output.mkdir(parents=True, exist_ok=True)
        if args.command == "preview":
            for camera, metadata, frame in results:
                prefix = camera["camera_code"]
                save_jpeg(args.output / f"{prefix}_frame.jpg", frame)
                save_jpeg(args.output / f"{prefix}_overlay.jpg", render_preview(frame, camera))
        report = {
            "source_kind": config["source_kind"], "camera_count": 4, "zone_count": 8,
            "config_sha256": hashlib.sha256(args.config.read_bytes()).hexdigest(),
            "videos": [metadata for _, metadata, _ in results],
        }
        report_path = args.output / f"{args.command}_report.json"
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"PASS: 4 cameras, 8 valid zones. Report: {report_path}")
        if args.command == "preview":
            print(f"PASS: 4 original frames and 4 polygon overlays: {args.output}")
        return 0
    except (ValueError, OSError, KeyError, TypeError, ImportError) as exc:
        print(f"FAIL: {exc}\nNo new report/previews for a failed source validation."
              " Existing artifacts may belong to an earlier run.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
