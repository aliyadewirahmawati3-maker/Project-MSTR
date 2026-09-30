# Tahap 3.8: kontrak input rekaman lokal dan kalibrasi zona

Tahap ini menyiapkan input file yang dapat dibaca **dari dalam container** `ai-service`, tanpa inferensi. Blob URL dari file picker Tahap 3.7 hanya berlaku di browser pembuatnya. FastAPI Docker tidak dapat membaca blob URL tersebut, dan tidak ada endpoint upload atau pengiriman file dari browser ke FastAPI.

Dashboard tetap memakai file picker dan overlay manual seperti sebelumnya. Pipeline input container terpisah: folder host → bind mount read-only → validator konfigurasi/metadata. Tidak ada perubahan desain dashboard, backend Laravel, database, simulator, atau pengendalian lampu.

## Folder sumber lokal

Struktur yang direkomendasikan relatif terhadap root proyek:

```text
cctv-offline/                         # seluruh folder diabaikan Git
  CCTV SIANG JL NORMAL_BARAT.mp4
  CCTV SIANG JL NORMAL_UTARA.mp4
  CCTV SIANG JL PADAT AMBULANS_TIMUR.mp4
  CCTV SIANG JL NORMAL_SELATAN.mp4
config/cctv/queue_zones.json          # kontrak dan polygon terlacak Git
```

Nama file harus sama dengan `source_filename` pada konfigurasi. File MP4 asli tidak masuk source code, image Docker, database, atau upload internet. Jangan gunakan folder tracked seperti `frontend/src` atau `ai-service/app` untuk video. Ignore berlaku untuk seluruh `cctv-offline/`, bukan hanya MP4.

Pada mesin kerja saat tahap ini diterapkan, `cctv-offline` dibuat sebagai **junction Windows menuju folder eksternal `../cctv` yang sudah berisi empat rekaman asli**. Junction hanya referensi filesystem: tidak memindahkan atau menyalin byte video. Empat sumber asli tetap berada di luar repository. Junction diabaikan Git dan tidak tersedia otomatis pada clone baru.

Pada mesin baru yang sudah memiliki folder video, buat junction dari PowerShell di root proyek (ganti contoh folder sumber sesuai lokasi nyata):

```powershell
$videoSource = (Resolve-Path -LiteralPath 'D:\rekaman-sigap\cctv-offline').Path
if (Test-Path -LiteralPath .\cctv-offline) { throw 'Folder sudah ada; periksa isinya dahulu.' }
New-Item -ItemType Junction -Path .\cctv-offline -Target $videoSource
Get-ChildItem -LiteralPath .\cctv-offline -File
git check-ignore -v cctv-offline/
```

Jika belum ada rekaman, buat folder kosong dengan `New-Item -ItemType Directory -Path .\cctv-offline` dan jadikan folder tersebut tujuan penyimpanan rekaman lokal yang sah dengan empat nama di atas. Validator akan melaporkan semua sumber yang belum tersedia; tidak membuat video pengganti atau zona asal-asalan. Jangan menimpa direktori/junction yang sudah ada tanpa memeriksa targetnya. Tidak ada script penyalinan video pada alur ini.

## Mount Docker

Compose memasang dua bind mount hanya ke `ai-service`:

| Sumber host | Tujuan container | Akses |
| --- | --- | --- |
| `./cctv-offline` | `/data/cctv-offline` | read-only |
| `./config/cctv` | `/config/cctv` | read-only |

`bind.create_host_path: false` membuat Compose gagal jelas jika folder sumber belum disiapkan. Mount tidak menyalin file ke image. Context build `ai-service` tidak mencakup folder video; `.dockerignore` tambahan mengecualikan environment, cache, dan MP4 yang mungkin keliru berada di context tersebut. Read-only berlaku untuk akses container; pemilik file di host masih dapat mengubah rekaman dan perlu melakukan validasi ulang sesudahnya.

Environment container (diatur Compose, tanpa path pribadi):

```text
SIGAP_OFFLINE_ROOT=/data/cctv-offline
SIGAP_QUEUE_ZONES_PATH=/config/cctv/queue_zones.json
```

Dependency OpenCV headless digunakan hanya untuk membuka video, membaca metadata, dan memastikan frame awal/referensi/akhir dapat didekode. Tidak ada model atau inferensi yang dimuat. FastAPI tetap standby dengan endpoint health semula; validator dijalankan eksplisit sebagai CLI.

## Kontrak kamera dan koordinat

Sumber tunggal tetap [`config/cctv/queue_zones.json`](../config/cctv/queue_zones.json), dibaca frontend melalui `queueZones.js` dan container melalui [`app/local_video.py`](../ai-service/app/local_video.py). Tidak ada salinan polygon khusus Docker.

| Kamera | Arah unik | File | Resolusi asli acuan |
| --- | --- | --- | --- |
| CAM-W-01 | WEST | `CCTV SIANG JL NORMAL_BARAT.mp4` | 1920×1080 |
| CAM-N-01 | NORTH | `CCTV SIANG JL NORMAL_UTARA.mp4` | 1920×1080 |
| CAM-E-01 | EAST | `CCTV SIANG JL PADAT AMBULANS_TIMUR.mp4` | 1920×1080 |
| CAM-S-01 | SOUTH | `CCTV SIANG JL NORMAL_SELATAN.mp4` | 1920×1080 |

Konfigurasi menambahkan `input_contract_version: 1`, `coordinate_system.reference: original_decoded_frame`, serta `resolution_policy: reject_mismatch`. Field `expected_metadata.width/height` adalah dimensi frame asli yang digunakan saat kalibrasi; bukan dimensi kartu browser. Polygon tetap dinormalisasi 0–1, titik asal kiri atas, x ke kanan dan y ke bawah. Konversi ke koordinat pixel asli adalah `round(u * (W - 1))`, `round(v * (H - 1))`.

Setiap kamera mempunyai tepat dua `QueueZone`: outer (`LEFT_OR_STRAIGHT`) dan inner (`STRAIGHT_OR_RIGHT`). `CameraInput.pixel_zones()` mengembalikan polygon pixel berdasarkan resolusi acuan tersebut. Resize/crop/letterbox model di Tahap 4 harus memiliki transformasi balik ke koordinat asli sebelum pengujian posisi terhadap zona. Mengubah ukuran browser tidak pernah mengubah polygon acuan.

`source_filename` hanya boleh nama berkas MP4 tanpa folder. Path Windows, traversal `../`, HTTP/RTSP, dan blob URL ditolak. `CameraInput.resolve_file(root)` juga memeriksa containment setelah resolusi filesystem agar file tidak keluar dari root mount. `video_env` pada JSON dipertahankan untuk alat Tahap 3 lama; kontrak container menggunakan `source_filename` dan root mount, bukan environment path pribadi tersebut.

Validator menolak arah/kamera duplikat, lajur salah, file hilang/tidak terbaca, resolusi atau timing tidak cocok, koordinat di luar 0–1, polygon degenerat/berulang/berpotongan, serta hash konten yang berubah. Hash SHA256 penting karena dua rekaman dengan resolusi sama belum tentu memiliki sudut kamera sama. Jangan memperbarui hash hanya untuk melewati validator; inspeksi dan kalibrasi ulang secara manual terlebih dahulu.

Pemetaan geografis masih merupakan skenario pengguna. Utara–Selatan memiliki perspektif hampir sama, dan batas zona Timur merupakan pendekatan manual pada marka yang tertutup kondisi padat. Identitas sumber yang cocok tidak membuktikan geografi, aturan belok fisik, atau kualitas kalibrasi lapangan.

## Menjalankan dan memeriksa

Dari root proyek, Docker Desktop harus aktif dan environment Compose Tahap 1 sudah tersedia:

```powershell
docker compose config --quiet
docker compose up -d --build --no-deps ai-service
docker compose exec -T ai-service python -m app.local_video --schema-only
docker compose exec -T ai-service python -m app.local_video
docker compose exec -T ai-service python -m unittest discover -s tests -p 'test_local_video.py' -v
```

`--schema-only` tidak membaca video dan selalu menyatakan `ready_for_stage4_input: false`, dengan `source_validation: NOT_RUN`. Validasi lengkap membaca keempat sumber dan menghasilkan JSON di stdout. Exit code 0 untuk validasi lengkap berarti empat sumber berstatus `VALID`, `camera_count: 4`, `zone_count: 8`, dan `ready_for_stage4_input: true`. `inference_enabled` tetap `false`. Exit code 1 berarti ada konfigurasi/sumber yang gagal dan input belum siap. Status yang mungkin antara lain `MISSING_FILE`, `UNREADABLE_VIDEO`, `RESOLUTION_MISMATCH`, `METADATA_MISMATCH`, `SOURCE_HASH_MISMATCH`, dan `INVALID_PATH`.

Periksa flag read-only tanpa mencoba menulis ke video:

```powershell
docker compose exec -T ai-service python -c "import os; roots=['/data/cctv-offline','/config/cctv']; print({r:bool(os.statvfs(r).f_flag & os.ST_RDONLY) for r in roots}); assert all(os.statvfs(r).f_flag & os.ST_RDONLY for r in roots)"
Invoke-RestMethod http://localhost:8001/health
git status --short --untracked-files=all
```

Health HTTP hanya menyatakan service aktif; tidak menyatakan video valid atau detektor aktif. Kesiapan input hanya dinilai dari hasil validator lengkap. Validator tidak menulis metadata ke database, tidak mengekspor frame/video, dan tidak memperbarui file sumber.

Alternatif pemeriksaan host dengan environment OpenCV Tahap 3 yang sudah tersedia:

```powershell
.\.venv-stage3\Scripts\python.exe ai-service/app/local_video.py --config config/cctv/queue_zones.json --root cctv-offline
Push-Location ai-service
py -3.13 -m unittest discover -s tests -p 'test_local_video.py' -v
Pop-Location
```

Tes kontrak hanya memakai standard library dan tidak membutuhkan video atau OpenCV; stub metadata pada unit test dibedakan dari validasi integrasi rekaman asli.

Hasil pelaksanaan Tahap 3.8: 18 tes kontrak di dalam container, 9 tes zona frontend, dan 7 tes Tahap 3 lulus. Validasi sumber nyata berhasil di host dan container untuk empat video 1920×1080 dengan delapan zona; `ready_for_stage4_input: true` dan `inference_enabled: false`. Kedua mount terverifikasi read-only, dan health `ai-service` tetap standby. Laporan lokal diabaikan Git: `artifacts/stage3/stage38-host-input.json` dan `artifacts/stage3/stage38-container-input.json`.

## Urutan kerja Tahap 4 (belum diimplementasikan)

1. Jalankan perintah Compose dan validator lengkap di atas. Hentikan persiapan inferensi jika exit code bukan 0 atau salah satu kamera tidak `VALID`. Tinjau kembali frame/polygon manual untuk memastikan rekaman yang akan dianalisis sesuai kalibrasi.
2. Di implementasi Tahap 4 nanti, gunakan `load_inputs(os.environ['SIGAP_QUEUE_ZONES_PATH'])` dan root `os.environ['SIGAP_OFFLINE_ROOT']`. Pilih kamera dari empat `camera_code` terdaftar; ambil file dengan `camera.resolve_file(root)` dan zona melalui `camera.pixel_zones()`. Jangan menerima blob URL atau path sembarang dari browser sebagai sumber container.
3. Baru pada Tahap 4, tambahkan worker inferensi lokal untuk frame rekaman yang sudah lolos. Definisikan resize/letterbox dan transformasi balik ke resolusi asli. Jangan menggunakan ukuran elemen video dashboard sebagai acuan.
4. Tentukan aturan geometris penempatan hasil anonim ke zona, termasuk objek pada garis batas agar tidak dihitung ganda. Validasi pada contoh beranotasi manual dari sumber nyata. Tidak menggunakan identitas persisten, OCR, atau pengenalan wajah.
5. Hasil Tahap 4 harus berasal dari inferensi nyata dan diberi penanda rekaman offline. Jika mengeluarkan jumlah per zona, bedakan jumlah objek dalam suatu frame dari jumlah kendaraan unik sepanjang waktu; tanpa tracking tidak boleh mengklaim hitungan unik. Susun kontrak hasil dan tesnya saat tahap tersebut dikerjakan, tanpa data deteksi tiruan.
6. Integrasikan hasil ke UI/API hanya dalam ruang lingkup Tahap 4 yang disepakati. Tahap 3.8 tidak menambahkan endpoint inferensi, job model, command `infer`, output deteksi, atau keputusan lampu.

Tidak ada command inferensi yang dapat dijalankan sekarang. Semua command pada dokumen ini hanya menyiapkan service dan memvalidasi input. Backend/database tidak diubah; tidak ada YOLO, inferensi, penghitungan, tracking ID, OCR plat, pengenalan wajah, heuristik lampu, atau koneksi ATCS fisik pada tahap ini. Tidak ada commit atau push.
