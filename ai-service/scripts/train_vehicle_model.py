"""Train/evaluate the prepared local dataset using the pinned YOLOv13 implementation.

Smoke tests exercise the pipeline only; their weights must never become the active detector.
"""
import argparse
import hashlib
import json
import os
import shutil
from pathlib import Path
import sys
import time

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.yolo_detector import WEIGHTS_SHA256
from app.vehicle_classes import DATASET_CLASSES


def file_hash(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def training_data(dataset, run, smoke):
    config = yaml.safe_load((dataset / "data.yaml").read_text())
    if config.get("names") != list(DATASET_CLASSES):
        raise ValueError("Use the dataset produced by prepare_vehicle_dataset.py (car, bus, truck).")
    # Resolve every path explicitly; Ultralytics otherwise consults its global datasets directory.
    config["path"] = str(dataset)
    selection = {"excluded_empty_labels": [], "selected_images": {}}
    for key in ("train", "val", "test"):
        path = (dataset / config[key]).resolve()
        if not path.is_relative_to(dataset) or not path.is_dir():
            raise ValueError(f"Invalid {key} image directory.")
        files = []
        for image in sorted(p for p in path.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}):
            label = path.parent / "labels" / f"{image.stem}.txt"
            if not label.is_file():
                raise ValueError(f"Missing label for {image.name}.")
            # Visual inspection found vehicles in nominally empty labels in this export.
            # Quarantine these examples until re-annotated; never train them as background.
            if not label.read_text().strip():
                selection["excluded_empty_labels"].append(str(image.relative_to(dataset)))
                continue
            files.append(image)
        if smoke and key in {"train", "val"}:
            files = files[:8]
        if not files or (smoke and key in {"train", "val"} and len(files) < 2):
            raise ValueError(f"Insufficient annotated images for {key} after excluding empty labels.")
        listing = run / f"{key}.txt"
        listing.write_text("\n".join(str(p) for p in files) + "\n")
        config[key] = str(listing)
        selection["selected_images"][key] = len(files)
    (run / "data-selection.json").write_text(json.dumps(selection, indent=2) + "\n")
    path = run / "data.yaml"
    path.write_text(yaml.safe_dump(config, sort_keys=False))
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True, help="Prepared dataset directory")
    parser.add_argument("--weights", type=Path, default=Path("/models/yolov13/yolov13n.pt"))
    parser.add_argument("--output", type=Path, required=True, help="New output directory; will not overwrite a run")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch", type=int, default=2)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--smoke-test", action="store_true")
    args = parser.parse_args()
    dataset, run = args.data.resolve(), args.output.resolve()
    if run.exists():
        parser.error("Output already exists; choose a new path to preserve previous runs.")
    if not (dataset / "data.yaml").is_file() or not (dataset / "audit.json").is_file():
        parser.error("Prepared dataset is incomplete. Wait for prepare_vehicle_dataset.py to finish successfully.")
    audit = json.loads((dataset / "audit.json").read_text())
    if not args.smoke_test and audit.get("split_strategy") != "SOURCE_VIDEO":
        parser.error("Full training requires regroup_vehicle_dataset.py to keep source recordings in separate splits.")
    if min(args.epochs, args.batch, args.threads) < 1 or args.imgsz < 320 or args.imgsz % 32:
        parser.error("Use positive epochs/batch/threads and an image size >= 320 divisible by 32.")
    if not args.weights.is_file() or file_hash(args.weights) != WEIGHTS_SHA256:
        parser.error("Training starts from the verified official YOLOv13-N weights installed by setup-yolov13.ps1.")
    os.environ.update(YOLO_AUTOINSTALL="false", YOLO_OFFLINE="true", WANDB_DISABLED="true")
    import torch
    import matplotlib
    from ultralytics import YOLO, settings
    from ultralytics.utils import USER_CONFIG_DIR
    # Dataset validation checks for Arial even with plots=False. Reuse a bundled font offline.
    font = Path(matplotlib.get_data_path()) / "fonts/ttf/DejaVuSans.ttf"
    for name in ("Arial.ttf", "Arial.Unicode.ttf"):
        target = USER_CONFIG_DIR / name
        if not target.is_file():
            shutil.copyfile(font, target)
    settings.update({"sync": False, "hub": False, "wandb": False, "mlflow": False, "clearml": False,
                     "comet": False, "dvc": False, "neptune": False, "raytune": False, "tensorboard": False})
    torch.set_num_threads(args.threads)
    run.mkdir(parents=True)
    data = training_data(dataset, run, args.smoke_test)
    model = YOLO(str(args.weights), task="detect")
    started = time.monotonic()
    result = model.train(data=str(data), epochs=1 if args.smoke_test else args.epochs,
        imgsz=320 if args.smoke_test else args.imgsz, batch=args.batch, device=args.device,
        workers=0, cache=False, amp=False, plots=False, seed=42, deterministic=True,
        optimizer="AdamW", lr0=.001, patience=10, project=str(run), name="training",
        exist_ok=False, save=True, close_mosaic=0, mosaic=0.0 if args.smoke_test else 1.0,
        verbose=False)
    best = Path(model.trainer.best)
    report = {"purpose": "SMOKE_TEST_ONLY" if args.smoke_test else "TRAINED_CANDIDATE",
              "architecture": "YOLOv13-N", "classes": list(DATASET_CLASSES),
              "missing_sigap_classes": ["motorcycle"], "weights": str(best), "sha256": file_hash(best),
              "training_seconds": round(time.monotonic() - started, 2),
              "epochs_requested": 1 if args.smoke_test else args.epochs,
              "device": args.device, "validation_metrics": result.results_dict if result else {},
              "dataset_archive_sha256": audit["source_archive_sha256"],
              "split_strategy": audit.get("split_strategy", "ORIGINAL_EXPORT"),
              "data_selection": json.loads((run / "data-selection.json").read_text()),
              "deployment_approved": False}
    if not args.smoke_test:
        # Keep the held-out test split out of epoch selection, then evaluate the final candidate once.
        tested = YOLO(str(best)).val(data=str(data), split="test", imgsz=args.imgsz,
            batch=args.batch, device=args.device, workers=0, plots=False, project=str(run), name="test")
        report["test_metrics"] = tested.results_dict
    (run / "model-manifest.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
