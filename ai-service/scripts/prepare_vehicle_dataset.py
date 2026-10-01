"""Validate a YOLO bounding-box ZIP and create an attributed, three-class local dataset.

Archive documents are copied as provenance, never executed. Existing outputs are never overwritten.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import sys
from zipfile import ZipFile

import cv2
import numpy as np
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.vehicle_classes import DATASET_CLASSES, canonical_class

SPLITS = ("train", "valid", "test")
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}


def validate_members(archive):
    files = archive.infolist()
    if len(files) > 25000 or sum(item.file_size for item in files) > 2 * 1024**3:
        raise ValueError("Archive exceeds the supported 25,000 entries / 2 GiB size.")
    seen = set()
    for item in files:
        path = PurePosixPath(item.filename)
        if path.is_absolute() or ".." in path.parts or ":" in item.filename or "\\" in item.filename:
            raise ValueError("Unsafe archive path.")
        if item.filename in seen or item.file_size > 20 * 1024**2:
            raise ValueError("Duplicate archive path or individual file larger than 20 MiB.")
        if (item.external_attr >> 16) & 0o170000 == 0o120000:
            raise ValueError("Archive symbolic links are not supported.")
        seen.add(item.filename)
    return seen


def parse_labels(content, names, filename):
    rows, counts = [], Counter()
    for line_number, line in enumerate(content.decode("utf-8-sig").splitlines(), 1):
        if not line.strip():
            continue
        fields = line.split()
        if len(fields) != 5:
            raise ValueError(f"{filename}:{line_number}: expected class x_center y_center width height.")
        index = int(fields[0])
        if not 0 <= index < len(names):
            raise ValueError(f"{filename}:{line_number}: class ID out of range.")
        x, y, width, height = map(float, fields[1:])
        if not all(math.isfinite(v) and 0 <= v <= 1 for v in (x, y, width, height)) or min(width, height) <= 0:
            raise ValueError(f"{filename}:{line_number}: invalid normalized coordinates.")
        if min(x - width/2, y - height/2) < -1e-6 or max(x + width/2, y + height/2) > 1 + 1e-6:
            raise ValueError(f"{filename}:{line_number}: bounding box crosses the image boundary.")
        mapped = DATASET_CLASSES.index(canonical_class(names[index]))
        rows.append((mapped, x, y, width, height))
        counts[names[index]] += 1
    return rows, counts


def prepare(archive_path, output):
    output = Path(output).resolve()
    if output.exists():
        raise ValueError("Output already exists. Choose a new directory to preserve previous artifacts.")
    records, hashes, source_names = [], defaultdict(list), defaultdict(list)
    report = {"source_archive_sha256": "", "format": "YOLO normalized bounding boxes", "splits": {},
              "target_classes": list(DATASET_CLASSES), "missing_sigap_classes": ["motorcycle"],
              "warnings": [], "duplicate_images": [], "same_source_across_splits": []}
    with Path(archive_path).open("rb") as stream:
        report["source_archive_sha256"] = hashlib.file_digest(stream, "sha256").hexdigest()
    with ZipFile(archive_path) as archive:
        members = validate_members(archive)
        metadata = yaml.safe_load(archive.read("data.yaml"))
        names = metadata["names"]
        if isinstance(names, dict):
            names = [names[i] for i in range(len(names))]
        if not isinstance(names, list) or not names or metadata.get("nc", len(names)) != len(names):
            raise ValueError("Invalid class names/nc in data.yaml.")
        if any(canonical_class(name) not in DATASET_CLASSES for name in names):
            raise ValueError("Dataset contains unsupported classes; review its mapping before preparing it.")
        report.update(source_classes=names, attribution=metadata.get("roboflow", {}),
                      class_mapping={name: canonical_class(name) for name in names})
        for split in SPLITS:
            images = sorted(name for name in members if name.startswith(f"{split}/images/") and PurePosixPath(name).suffix.lower() in IMAGE_SUFFIXES)
            if not images:
                raise ValueError(f"Split {split} has no images.")
            original_counts, mapped_counts, empty, duplicate_boxes = Counter(), Counter(), 0, 0
            expected_labels = set()
            for filename in images:
                image_path = PurePosixPath(filename)
                if len(image_path.parts) != 3:
                    raise ValueError("Expected images directly inside each split/images directory.")
                label = f"{split}/labels/{image_path.stem}.txt"
                if label in expected_labels or label not in members:
                    raise ValueError(f"Missing or ambiguous label for {filename}.")
                expected_labels.add(label)
                content = archive.read(filename)
                frame = cv2.imdecode(np.frombuffer(content, dtype=np.uint8), cv2.IMREAD_COLOR)
                if frame is None or min(frame.shape[:2]) < 16:
                    raise ValueError(f"Invalid image: {filename}.")
                hashes[hashlib.sha256(content).hexdigest()].append(filename)
                source_names[image_path.stem.split(".rf.")[0]].append(filename)
                rows, counts = parse_labels(archive.read(label), names, label)
                original_counts.update(counts)
                unique = list(dict.fromkeys(rows))
                duplicate_boxes += len(rows) - len(unique)
                mapped_counts.update(DATASET_CLASSES[row[0]] for row in unique)
                empty += not bool(unique)
                records.append((filename, label, unique))
            actual_labels = {name for name in members if name.startswith(f"{split}/labels/") and name.endswith(".txt")}
            if actual_labels != expected_labels:
                raise ValueError(f"Orphan labels in split {split}.")
            report["splits"][split] = {"images": len(images), "boxes": sum(mapped_counts.values()), "empty_labels": empty,
                                       "source_class_counts": dict(original_counts), "class_counts": dict(mapped_counts),
                                       "duplicate_boxes_removed": duplicate_boxes}
        report["duplicate_images"] = [paths for paths in hashes.values() if len(paths) > 1]
        report["same_source_across_splits"] = [paths for paths in source_names.values() if len({p.split('/')[0] for p in paths}) > 1]
        if report["same_source_across_splits"] or any(len({p.split('/')[0] for p in paths}) > 1 for paths in report["duplicate_images"]):
            raise ValueError("Possible data leakage across splits; resolve it before preparing training data.")
        report["warnings"].append("No motorcycle labels. Do not replace a four-class traffic model without measuring lost motorcycle coverage.")
        report["warnings"].append("Byte/source-name checks cannot exclude near-duplicate frames or unlabeled objects. Review annotations visually.")
        # Write only after the complete archive has passed validation. Do not extract arbitrary members.
        output.mkdir(parents=True)
        for filename, label, rows in records:
            image_target, label_target = output / filename, output / label
            image_target.parent.mkdir(parents=True, exist_ok=True)
            label_target.parent.mkdir(parents=True, exist_ok=True)
            image_target.write_bytes(archive.read(filename))
            label_target.write_text("".join(f"{row[0]} {' '.join(format(v, '.10g') for v in row[1:])}\n" for row in rows), encoding="utf-8")
        (output / "source.data.yaml").write_bytes(archive.read("data.yaml"))
        for name in ("README.dataset.txt", "README.roboflow.txt"):
            if name in members:
                (output / name).write_bytes(archive.read(name))
        # No absolute host paths: train.py resolves this directory in Windows, Docker or a GPU machine.
        (output / "data.yaml").write_text(yaml.safe_dump({"train": "train/images", "val": "valid/images", "test": "test/images",
            "nc": len(DATASET_CLASSES), "names": list(DATASET_CLASSES)}, sort_keys=False), encoding="utf-8")
        (output / "audit.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    report = prepare(args.archive, args.output)
    print(json.dumps({"output": str(args.output), "splits": report["splits"], "warnings": report["warnings"]}, indent=2))


if __name__ == "__main__":
    main()
