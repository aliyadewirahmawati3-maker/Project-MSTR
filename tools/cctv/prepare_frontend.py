"""Prepare verified local MP4 copies for the offline frontend demo (stdlib only)."""

import hashlib
from pathlib import Path
import shutil
import sys
import tempfile

from stage3 import DEFAULT_ENV, ROOT, load_zones, read_environment, require, resolve_video

DESTINATION = ROOT / "frontend/public/cctv-local"


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def prepare():
    config = load_zones()
    environment = read_environment(DEFAULT_ENV)
    sources = []
    # Validate every original before creating or changing any public video.
    for camera in config["cameras"]:
        code = camera["camera_code"]
        try:
            source = resolve_video(camera, environment)
            require(sha256(source) == camera["source_sha256"],
                    "SHA256 berbeda dari sumber Tahap 3; inspeksi ulang diperlukan")
            sources.append((camera, source))
        except (ValueError, OSError) as exc:
            raise ValueError(f'{code} ({camera["source_filename"]}): {exc}') from exc

    # Refuse redirected public folders; never copy into a junction/symlink target.
    require(DESTINATION.resolve() == DESTINATION,
            "Folder tujuan tidak boleh dialihkan melalui symlink/junction")
    DESTINATION.mkdir(parents=True, exist_ok=True)
    # Stage and verify all four copies before replacing final files. No private
    # source path or environment file is written into the browser's public folder.
    with tempfile.TemporaryDirectory(prefix=".prepare-", dir=DESTINATION) as staging:
        pending = []
        for camera, source in sources:
            name = f'{camera["camera_code"]}.mp4'
            staged = Path(staging) / name
            target = DESTINATION / name
            require(not target.is_symlink(), f"Tujuan {name} tidak boleh berupa symlink")
            shutil.copyfile(source, staged)
            require(sha256(staged) == camera["source_sha256"],
                    f"{name}: salinan tidak cocok; sumber mungkin berubah saat disalin")
            pending.append((staged, target))
        for staged, target in pending:
            staged.replace(target)
            print(f"READY: frontend/public/cctv-local/{target.name}")
    print("PASS: 4 rekaman lokal/offline siap. Sumber asli tetap di tempatnya.")
    print("Jalankan Vite atau build ulang untuk memperbarui preview dist.")


if __name__ == "__main__":
    try:
        prepare()
    except (ValueError, OSError, KeyError, TypeError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        sys.exit(1)
