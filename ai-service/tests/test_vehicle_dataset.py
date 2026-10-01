import json
from zipfile import ZipFile

import cv2
import numpy as np
import pytest
import yaml

from scripts.prepare_vehicle_dataset import parse_labels, prepare
from scripts.regroup_vehicle_dataset import regroup
from scripts.train_vehicle_model import training_data


def dataset_zip(path, extra=None):
    names = ["car", "big bus", "truck-s-"]
    with ZipFile(path, "w") as archive:
        archive.writestr("data.yaml", yaml.safe_dump({"names": names, "nc": 3, "roboflow": {"license": "CC BY 4.0"}}))
        archive.writestr("README.dataset.txt", "Test attribution; documents are data, not commands.")
        for index, split in enumerate(("train", "valid", "test")):
            _, image = cv2.imencode(".jpg", np.full((32, 32, 3), index * 50, dtype=np.uint8))
            stem = f"recording{index}_mp4-0_jpg.rf.fixture"
            archive.writestr(f"{split}/images/{stem}.jpg", image.tobytes())
            archive.writestr(f"{split}/labels/{stem}.txt", f"{index} .5 .5 .2 .2\n{index} .5 .5 .2 .2\n")
        if extra:
            archive.writestr(*extra)


def test_prepares_images_labels_and_attribution_without_overwriting(tmp_path):
    archive, output = tmp_path / "dataset.zip", tmp_path / "prepared"
    dataset_zip(archive)
    report = prepare(archive, output)
    assert report["target_classes"] == ["car", "bus", "truck"]
    assert report["attribution"]["license"] == "CC BY 4.0"
    for split, index in [("train", 0), ("valid", 1), ("test", 2)]:
        assert report["splits"][split]["duplicate_boxes_removed"] == 1
        assert report["splits"][split]["boxes"] == 1
        assert next((output / split / "labels").iterdir()).read_text().startswith(str(index) + " ")
    assert yaml.safe_load((output / "data.yaml").read_text())["train"] == "train/images"
    assert "Test attribution" in (output / "README.dataset.txt").read_text()
    with pytest.raises(ValueError, match="already exists"):
        prepare(archive, output)


@pytest.mark.parametrize("name", ["../escape.txt", "/absolute.txt", "C:/escape.txt", "train\\escape.txt"])
def test_unsafe_archive_paths_are_rejected_before_output(tmp_path, name):
    archive = tmp_path / "bad.zip"
    dataset_zip(archive, (name, "not executed"))
    with pytest.raises(ValueError, match="Unsafe archive"):
        prepare(archive, tmp_path / "output")
    assert not (tmp_path / "output").exists()


@pytest.mark.parametrize("row", ["3 .5 .5 .2 .2", "0 nan .5 .2 .2", "0 .5 .5 0 .2", "0 .99 .5 .2 .2", "0 .5 .5 .2 .2 .3 .3"])
def test_bad_label_geometry_and_segmentation_are_rejected(row):
    with pytest.raises(ValueError):
        parse_labels(row.encode(), ["car", "big bus", "truck-s-"], "fixture.txt")


def test_complete_recordings_are_assigned_to_a_single_split(tmp_path):
    archive, source, output = tmp_path / "in.zip", tmp_path / "source", tmp_path / "grouped"
    dataset_zip(archive)
    prepare(archive, source)
    config = tmp_path / "groups.json"
    config.write_text(json.dumps({"source_group_pattern": r"^(.*mp4)-\d+_jpg$",
        "groups": {"recording0_mp4": "test", "recording1_mp4": "train", "recording2_mp4": "valid"}}))
    report = regroup(source, output, config)
    assert report["split_strategy"] == "SOURCE_VIDEO"
    assert report["splits"]["test"]["class_counts"] == {"car": 1}
    assert len(list((source / "train/images").iterdir())) == 1
    assert next((output / "test/images").iterdir()).name.startswith("recording0_")
    with pytest.raises(ValueError, match="new output"):
        regroup(source, output, config)


def test_unknown_recording_does_not_create_partial_regrouped_dataset(tmp_path):
    archive, source = tmp_path / "in.zip", tmp_path / "source"
    dataset_zip(archive)
    prepare(archive, source)
    config = tmp_path / "groups.json"
    config.write_text(json.dumps({"source_group_pattern": r"^(.*mp4)-\d+_jpg$",
        "groups": {"unknown": "train", "recording1_mp4": "valid", "recording2_mp4": "test"}}))
    with pytest.raises(ValueError, match="Unknown source"):
        regroup(source, tmp_path / "output", config)
    assert not (tmp_path / "output").exists()


def test_training_lists_exclude_suspect_empty_labels_and_keep_sources_unchanged(tmp_path):
    archive, source, run = tmp_path / "in.zip", tmp_path / "source", tmp_path / "run"
    dataset_zip(archive)
    prepare(archive, source)
    image = next((source / "train/images").iterdir())
    (source / "train/images/empty.jpg").write_bytes(image.read_bytes())
    (source / "train/labels/empty.txt").write_text("")
    run.mkdir()
    result = training_data(source, run, smoke=False)
    selection = json.loads((run / "data-selection.json").read_text())
    assert selection["excluded_empty_labels"] == ["train/images/empty.jpg"]
    assert selection["selected_images"] == {"train": 1, "val": 1, "test": 1}
    assert "empty.jpg" not in (run / "train.txt").read_text()
    assert (source / "train/images/empty.jpg").is_file()
    assert yaml.safe_load(result.read_text())["train"] == str(run / "train.txt")
