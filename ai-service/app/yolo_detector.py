"""Pinned official iMoonLab YOLOv13-N. No tracking, training or implicit downloads."""

import hashlib
import logging
import math
import os
from pathlib import Path
import time
from app.vehicle_classes import DATASET_CLASSES, VEHICLE_CLASSES, canonical_class

MODEL_NAME = "YOLOv13-N (iMoonLab, COCO pretrained)"
WEIGHTS_SHA256 = "6653035017b0f111f80ec11ed914874ea85699b104aeac1e46e517d16889d6b7"
logger = logging.getLogger(__name__)


def setting(name, default, minimum, maximum):
    try:
        value = float(os.getenv(name, default))
        return value if math.isfinite(value) and minimum <= value <= maximum else default
    except ValueError:
        return default


class ModelUnavailable(RuntimeError):
    pass


def vehicle_detections(names, boxes, width, height):
    """Convert model xyxy/conf/class rows to normalized, anonymous vehicle boxes."""
    result = []
    for x1, y1, x2, y2, confidence, class_index in boxes:
        if not all(math.isfinite(v) for v in (x1, y1, x2, y2, confidence, class_index)):
            continue
        index = int(class_index)
        if index != class_index or index < 0 or (not isinstance(names, dict) and index >= len(names)):
            continue
        label = canonical_class(names.get(index, "") if isinstance(names, dict) else names[index])
        if label is None or not 0 <= confidence <= 1:
            continue
        box = [max(0., min(1., x1 / width)), max(0., min(1., y1 / height)),
               max(0., min(1., x2 / width)), max(0., min(1., y2 / height))]
        if box[2] <= box[0] or box[3] <= box[1]:
            continue
        result.append({"class_name": label, "confidence": round(confidence, 4), "bbox": box})
    return result


class YoloDetector:
    # Accessed by the single inference slot in FrameInferenceService.
    def __init__(self):
        self.model = None
        self.status = "NOT_LOADED"
        self.note = "Model dimuat saat frame pertama diterima."
        self.retry_at = 0
        self.profile = os.getenv("SIGAP_YOLO_MODEL_PROFILE", "coco")
        self.model_name = "YOLOv13-N (vehicles v2, car/bus/truck)" if self.profile == "vehicles-v2" else MODEL_NAME
        self.covered_classes = []
        self.device = os.getenv("SIGAP_YOLO_DEVICE", "cpu")
        self.confidence = setting("SIGAP_YOLO_CONFIDENCE", .25, .01, .99)
        self.image_size = int(setting("SIGAP_YOLO_IMAGE_SIZE", 640, 320, 960)) // 32 * 32

    def load(self):
        if self.model is not None:
            return
        if time.monotonic() < self.retry_at:
            raise ModelUnavailable(self.note)
        self.status = "MODEL_LOADING"
        try:
            if self.profile not in {"coco", "vehicles-v2"}:
                raise ModelUnavailable("SIGAP_YOLO_MODEL_PROFILE harus coco atau vehicles-v2.")
            expected_hash = WEIGHTS_SHA256 if self.profile == "coco" else os.getenv("SIGAP_YOLO_WEIGHTS_SHA256", "").lower()
            if len(expected_hash) != 64 or any(c not in "0123456789abcdef" for c in expected_hash):
                raise ModelUnavailable("Isi SIGAP_YOLO_WEIGHTS_SHA256 dari manifest model lokal yang telah dievaluasi.")
            path = Path(os.getenv("SIGAP_YOLO_WEIGHTS", "/models/yolov13/yolov13n.pt"))
            if not path.is_file():
                raise ModelUnavailable("Jalankan scripts/setup-yolov13.ps1 lalu periksa mount /models.")
            with path.open("rb") as stream:
                if hashlib.file_digest(stream, "sha256").hexdigest() != expected_hash:
                    raise ModelUnavailable("SHA256 weights berbeda. Periksa file model dan manifest; untuk COCO gunakan scripts/setup-yolov13.ps1.")
            import torch
            from ultralytics import YOLO, settings
            # Local inference must not enable analytics or cloud integrations.
            settings.update({"sync": False, "hub": False})
            torch.set_num_threads(2)
            model = YOLO(str(path), task="detect")
            names = model.names
            labels = list(names.values()) if isinstance(names, dict) else list(names)
            covered = {canonical_class(name) for name in labels} - {None}
            required = VEHICLE_CLASSES if self.profile == "coco" else set(DATASET_CLASSES)
            if not required.issubset(covered):
                raise ModelUnavailable("Kelas weights tidak sesuai profile kendaraan yang dipilih.")
            if self.profile == "vehicles-v2" and any(canonical_class(name) is None for name in labels):
                raise ModelUnavailable("Model vehicles-v2 memiliki kelas di luar pemetaan kendaraan SIGAP.")
            self.model = model
            self.covered_classes = sorted(covered)
            self.status = "READY"
            self.note = "YOLOv13-N siap untuk snapshot video lokal." if self.profile == "coco" else "Model vehicles-v2 lokal siap. Dataset ini tidak melatih kelas sepeda motor."
        except Exception as error:
            self.status = "YOLO_MODEL_UNAVAILABLE"
            self.note = str(error) if isinstance(error, ModelUnavailable) else "Model gagal dimuat. Periksa log AI service, device, dan build dependency YOLOv13."
            self.retry_at = time.monotonic() + 30
            logger.exception("Local YOLOv13 model load failed")
            raise ModelUnavailable(self.note) from error

    def predict(self, frame):
        self.load()
        names = self.model.names.items() if isinstance(self.model.names, dict) else enumerate(self.model.names)
        classes = [index for index, name in names if canonical_class(name) in VEHICLE_CLASSES]
        result = self.model.predict(source=frame, device=self.device, conf=self.confidence,
                                    imgsz=self.image_size, classes=classes, max_det=150,
                                    half=False, verbose=False, save=False, stream=False)[0]
        return vehicle_detections(result.names, result.boxes.data.cpu().tolist(), frame.shape[1], frame.shape[0])

    def readiness(self):
        return {"model_name": self.model_name, "status": self.status, "ready": self.status == "READY",
                "note": self.note, "device": self.device, "confidence": self.confidence,
                "image_size": self.image_size, "model_profile": self.profile,
                "covered_classes": self.covered_classes,
                "missing_vehicle_classes": sorted(VEHICLE_CLASSES - set(self.covered_classes)) if self.model is not None else None}
