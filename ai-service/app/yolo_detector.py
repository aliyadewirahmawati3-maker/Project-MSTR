"""Pinned official iMoonLab YOLOv13-N. No tracking, training or implicit downloads."""

import hashlib
import logging
import math
import os
from pathlib import Path
import time

MODEL_NAME = "YOLOv13-N (iMoonLab, COCO pretrained)"
WEIGHTS_SHA256 = "6653035017b0f111f80ec11ed914874ea85699b104aeac1e46e517d16889d6b7"
VEHICLE_CLASSES = frozenset({"car", "motorcycle", "bus", "truck"})
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
        label = names.get(int(class_index), "") if isinstance(names, dict) else names[int(class_index)]
        if label not in VEHICLE_CLASSES or not 0 <= confidence <= 1:
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
            path = Path(os.getenv("SIGAP_YOLO_WEIGHTS", "/models/yolov13/yolov13n.pt"))
            if not path.is_file():
                raise ModelUnavailable("Jalankan scripts/setup-yolov13.ps1 lalu periksa mount /models.")
            with path.open("rb") as stream:
                if hashlib.file_digest(stream, "sha256").hexdigest() != WEIGHTS_SHA256:
                    raise ModelUnavailable("SHA256 weights berbeda. Unduh ulang melalui scripts/setup-yolov13.ps1.")
            import torch
            from ultralytics import YOLO, settings
            # Local inference must not enable analytics or cloud integrations.
            settings.update({"sync": False, "hub": False})
            torch.set_num_threads(2)
            model = YOLO(str(path), task="detect")
            names = model.names
            if not VEHICLE_CLASSES.issubset(set(names.values())):
                raise ModelUnavailable("Weights tidak memiliki empat kelas kendaraan COCO yang diperlukan.")
            self.model = model
            self.status = "READY"
            self.note = "YOLOv13-N siap untuk snapshot video lokal."
        except Exception as error:
            self.status = "YOLO_MODEL_UNAVAILABLE"
            self.note = str(error) if isinstance(error, ModelUnavailable) else "Model gagal dimuat. Periksa log AI service, device, dan build dependency YOLOv13."
            self.retry_at = time.monotonic() + 30
            logger.exception("YOLOv13 model load failed")
            raise ModelUnavailable(self.note) from error

    def predict(self, frame):
        self.load()
        classes = [index for index, name in self.model.names.items() if name in VEHICLE_CLASSES]
        result = self.model.predict(source=frame, device=self.device, conf=self.confidence,
                                    imgsz=self.image_size, classes=classes, max_det=150,
                                    half=False, verbose=False, save=False, stream=False)[0]
        return vehicle_detections(result.names, result.boxes.data.cpu().tolist(), frame.shape[1], frame.shape[0])

    def readiness(self):
        return {"model_name": MODEL_NAME, "status": self.status, "ready": self.status == "READY",
                "note": self.note, "device": self.device, "confidence": self.confidence,
                "image_size": self.image_size}
