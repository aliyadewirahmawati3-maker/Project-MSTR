"""Create a separate dataset whose splits do not share source video recordings."""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import re
import shutil


def regroup(source, output, config_path):
    source, output = Path(source).resolve(), Path(output).resolve()
    if output.exists() or output.is_relative_to(source):
        raise ValueError("Choose a new output directory outside the source dataset.")
    config = json.loads(Path(config_path).read_text())
    groups, pattern = config["groups"], re.compile(config["source_group_pattern"], re.IGNORECASE)
    if set(groups.values()) != {"train", "valid", "test"}:
        raise ValueError("Assign source groups to exactly train, valid and test.")
    report = json.loads((source / "audit.json").read_text())
    records, seen_groups, old_groups, output_paths = [], set(), defaultdict(Counter), set()
    stats = {split: {"images": 0, "boxes": 0, "empty_labels": 0, "class_counts": Counter()} for split in ("train", "valid", "test")}
    for split in stats:
        for image in sorted((source / split / "images").iterdir()):
            match = pattern.fullmatch(image.stem.split(".rf.")[0])
            if not match or match[1] not in groups:
                raise ValueError(f"Unknown source recording for {image.name}; update the split configuration.")
            group = match[1]
            target = groups[group]
            seen_groups.add(group)
            old_groups[group][split] += 1
            label = source / split / "labels" / f"{image.stem}.txt"
            if not label.is_file():
                raise ValueError(f"Missing label: {label.name}.")
            relative = Path(target) / "images" / image.name
            if relative in output_paths:
                raise ValueError("Image name collision across source splits.")
            output_paths.add(relative)
            rows = label.read_text().splitlines()
            stats[target]["images"] += 1
            stats[target]["boxes"] += len(rows)
            stats[target]["empty_labels"] += not bool(rows)
            stats[target]["class_counts"].update(report["target_classes"][int(row.split()[0])] for row in rows)
            records.append((image, label, relative, Path(target) / "labels" / label.name))
    if seen_groups != set(groups) or any(not s["images"] for s in stats.values()):
        raise ValueError("Split configuration does not exactly match the dataset recordings.")
    output.mkdir(parents=True)
    for image, label, image_relative, label_relative in records:
        (output / image_relative).parent.mkdir(parents=True, exist_ok=True)
        (output / label_relative).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(image, output / image_relative)
        shutil.copyfile(label, output / label_relative)
    for name in ("data.yaml", "source.data.yaml", "README.dataset.txt", "README.roboflow.txt"):
        if (source / name).is_file():
            shutil.copyfile(source / name, output / name)
    report.update(original_splits=report["splits"], splits=stats, split_strategy="SOURCE_VIDEO",
                  source_video_groups=groups, original_video_groups=old_groups,
                  split_note="Different recordings may still show the same camera. Also evaluate on separately annotated SIGAP CCTV.")
    (output / "audit.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("config", type=Path)
    args = parser.parse_args()
    report = regroup(args.source, args.output, args.config)
    print(json.dumps({"output": str(args.output), "splits": report["splits"], "groups": report["source_video_groups"]}, indent=2))


if __name__ == "__main__":
    main()
