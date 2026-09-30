"""Real inference verification; reads configured local videos, never creates mock detections."""
import hashlib
import json
import os
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import cv2
import httpx
from app.local_video import load_inputs


def main():
    cameras = load_inputs(os.getenv("SIGAP_QUEUE_ZONES_PATH", "/config/cctv/queue_zones.json"))
    reports = []
    with httpx.Client(base_url="http://127.0.0.1:8001", timeout=90) as client:
        for camera in cameras:
            path = camera.resolve_file(os.getenv("SIGAP_OFFLINE_ROOT", "/data/cctv-offline"))
            with path.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            source_id = str(uuid4())
            registration = client.post("/local-video/sessions", json={"camera_id": camera.camera_code,
                "client_id": str(uuid4()), "source_id": source_id, "revision": 1})
            registration.raise_for_status()
            session = registration.json()
            cap = cv2.VideoCapture(str(path))
            try:
                for sequence, seconds in enumerate([camera.reference_seconds, camera.reference_seconds + 3], 1):
                    cap.set(cv2.CAP_PROP_POS_MSEC, seconds * 1000)
                    ok, frame = cap.read()
                    if not ok:
                        raise RuntimeError(f"Cannot decode {camera.camera_code} at {seconds}s")
                    height, width = frame.shape[:2]
                    resized = cv2.resize(frame, (1280, round(1280 * height / width))) if width > 1280 else frame
                    _, encoded = cv2.imencode('.jpg', resized, [cv2.IMWRITE_JPEG_QUALITY, 85])
                    meta = {"camera_id": camera.camera_code, "session_id": session["session_id"],
                        "source_id": source_id, "frame_sequence": sequence, "profile_id": camera.profile_id,
                        "input_camera_code": camera.camera_code, "source_sha256": digest,
                        "captured_at": datetime.now(timezone.utc).isoformat(), "video_time_seconds": seconds,
                        "original_width": width, "original_height": height,
                        "frame_width": resized.shape[1], "frame_height": resized.shape[0]}
                    started = time.perf_counter()
                    response = client.post("/local-video/detect-frame", content=encoded.tobytes(),
                        headers={"Content-Type": "image/jpeg", "X-Frame-Metadata": json.dumps(meta)})
                    response.raise_for_status()
                    result = response.json()
                    report = {key: result.get(key) for key in ("camera_id", "profile_id", "status", "video_time_seconds", "outer_lane_queue", "inner_lane_queue", "total_queue", "inference_duration_ms", "stale")}
                    report.update(detections=len(result["detections"]), classes=dict(Counter(d["class_name"] for d in result["detections"])),
                                  round_trip_ms=round((time.perf_counter() - started) * 1000, 2), note=result["note"])
                    reports.append(report)
                    print(json.dumps(report), flush=True)
                    if result["status"] != "DETECTION_READY":
                        raise RuntimeError(f"Real inference not verified: {result['status']}: {result['note']}")
                    time.sleep(session["min_interval_seconds"])
            finally:
                cap.release()
                client.delete(f"/local-video/sessions/{camera.camera_code}/{session['session_id']}")
        durations = [r["inference_duration_ms"] for r in reports]
        print(json.dumps({"real_frames": len(reports), "mean_inference_ms": round(sum(durations)/len(durations), 2),
                          "warm_mean_ms": round(sum(durations[1:])/len(durations[1:]), 2)}))


if __name__ == "__main__":
    main()
