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

Dependency OpenCV headless digunakan untuk membuka video, membaca metadata, dan memastikan frame awal/referensi/akhir dapat didekode. Tidak ada model atau inferensi yang dimuat. FastAPI tetap standby tanpa YOLO; endpoint health dan ringkasan antrean konfigurasi tersedia, sedangkan validator dijalankan eksplisit sebagai CLI. Estimator satu-frame yang opt-in didokumentasikan di [offline-queue-estimation.md](offline-queue-estimation.md).

## Kontrak kamera dan koordinat

Sumber tunggal tetap [`config/cctv/queue_zones.json`](../config/cctv/queue_zones.json), dibaca frontend melalui `queueZones.js` dan container melalui [`app/local_video.py`](../ai-service/app/local_video.py). Tidak ada salinan polygon khusus Docker.

| Kamera | Arah unik | File | Resolusi asli acuan |
| --- | --- | --- | --- |
| CAM-W-01 | WEST | `CCTV SIANG JL NORMAL_BARAT.mp4` | 1920×1080 |
| CAM-N-01 | NORTH | `CCTV SIANG JL NORMAL_UTARA.mp4` | 1920×1080 |
| CAM-E-01 | EAST | `CCTV SIANG JL PADAT AMBULANS_TIMUR.mp4` | 1920×1080 |
| CAM-S-01 | SOUTH | `CCTV SIANG JL NORMAL_SELATAN.mp4` | 1920×1080 |

Kontrak sekarang memakai `input_contract_version: 2`, `coordinate_system.reference: original_decoded_frame`, serta `resolution_policy: same_aspect_ratio`. Setiap entri `cameras` adalah profile terpisah dengan `profile_id`, `camera_code`, `direction`, `reference_frame` (width, height, aspect_ratio), dua polygon, dan `calibration` (revision, status VALID, method MANUAL_FROM_DECODED_FRAMES). Hash/frame referensi serta catatan kalibrasi lama tetap dipertahankan. `expected_metadata` mendeskripsikan rekaman acuan, bukan batas mutlak resolusi/FPS rekaman berikutnya.

Polygon dinormalisasi 0–1 terhadap frame asli, titik asal kiri atas, x ke kanan dan y ke bawah. Konversi ke pixel frame **yang sedang dibaca** adalah `round(u * (W - 1))`, `round(v * (H - 1))`. Resolusi proporsional (misalnya 1920×1080 menjadi 1280×720) diterima untuk sumber dari kamera/sudut/cakupan gambar yang sama. Toleransi rasio relatif maksimal 0,5%, dikonfigurasi melalui `aspect_ratio_tolerance`. Crop, rotasi, zoom, atau perubahan posisi kamera membutuhkan pemeriksaan dan kalibrasi ulang; rasio yang sama saja tidak membuktikan kecocokan sudut pandang.

Setiap kamera mempunyai tepat dua `QueueZone`: outer (`LEFT_OR_STRAIGHT`) dan inner (`STRAIGHT_OR_RIGHT`). Untuk frame berjalan, gunakan `CameraInput.pixel_zones(width, height, input_camera_code)` dengan ukuran frame hasil decode dan identitas kamera yang telah diverifikasi. Pemanggilan tanpa argumen hanya untuk preview ukuran acuan. Resize/crop/letterbox model di Tahap 4 harus memiliki transformasi balik ke koordinat asli sebelum pengujian posisi terhadap zona. Mengubah ukuran browser tidak pernah mengubah polygon acuan.

`source_filename` hanya boleh nama berkas MP4 tanpa folder. Path Windows, traversal `../`, HTTP/RTSP, dan blob URL ditolak. `CameraInput.resolve_file(root)` juga memeriksa containment setelah resolusi filesystem agar file tidak keluar dari root mount. `video_env` pada JSON dipertahankan untuk alat Tahap 3 lama; kontrak container menggunakan `source_filename` dan root mount, bukan environment path pribadi tersebut.

Registry `video_sources` mengikat SHA256 konten ke `camera_code`, `profile_id`, dan `viewpoint_confirmed: true`. Identitas tidak ditebak dari nama file, posisi kartu, atau resolusi. Empat rekaman acuan sudah terdaftar. Hash baru tidak otomatis mewarisi zona walaupun nama/resolusinya sama. Validator menolak arah/kamera/profile duplikat atau tidak cocok, lajur salah, file hilang/tidak terbaca, rasio frame tidak cocok, koordinat di luar 0–1, dan polygon degenerat/berulang/berpotongan. Sumber tanpa registrasi menghasilkan `UNCALIBRATED_SOURCE`, tanpa polygon keluaran dan dengan `zone_analysis_eligible: false`.

Untuk mendaftarkan rekaman berikutnya, inspeksi frame lokal terlebih dahulu. Jika kamera, sudut, serta cakupan gambar masih sama, tambahkan hash rekaman baru ke `video_sources` dengan pasangan kamera/profile yang benar; ubah `source_filename` untuk input CLI bila perlu. Jangan mengganti metadata/hash **acuan kalibrasi** hanya karena durasi/FPS rekaman baru berbeda. Hitung hash lokal dengan `Get-FileHash -Algorithm SHA256 -LiteralPath .\cctv-offline\NAMA_VIDEO.mp4` dan simpan digest huruf kecil. Jika sudut berubah, kalibrasi ulang dua polygon pada profile kamera terkait, perbarui dimensi/frame/hash acuan dan metadata kalibrasi, naikkan revision, lalu hapus registrasi sumber lama yang tidak lagi sesuai. Kontrak saat ini mengizinkan tepat empat profile kamera; sumber kamera tambahan belum didukung.

Pemetaan geografis masih merupakan skenario pengguna. Utara–Selatan memiliki perspektif hampir sama, dan batas zona Timur merupakan pendekatan manual pada marka yang tertutup kondisi padat. Identitas sumber yang cocok tidak membuktikan geografi, aturan belok fisik, atau kualitas kalibrasi lapangan.

## Pergantian sumber di dashboard

1. Jalankan `npm.cmd --prefix frontend run dev`, lalu buka URL yang dicetak Vite. Setelah perubahan JSON kontrak di luar direktori frontend, restart Vite agar modul konfigurasi lama tidak tertahan di cache; refresh browser saja mungkin tidak cukup. Untuk production, build ulang.
2. Pilih rekaman melalui **Pilih video lokal/Ganti video** pada salah satu kartu. SHA256 dihitung lokal di browser. Rekaman Barat terdaftar mengaktifkan CAM-W-01; menggantinya dengan rekaman Utara pada kartu yang sama mengaktifkan CAM-N-01 beserta zona Utara. Label kartu mengikuti sumber aktif.
3. Video tanpa identitas terdaftar tetap dapat diputar, tetapi tidak mendapat polygon dan menampilkan **“Zona antrean belum dikalibrasi untuk sumber ini”**. Toggle zona dinonaktifkan. Tidak ada fallback ke zona kartu atau sumber sebelumnya.
4. Jika rekaman baru memang dari kamera/sudut/cakupan yang sudah dikalibrasi, pilih **Sumber kamera**, pilih **Profile zona** yang cocok, dan centang konfirmasi sudut/cakupan. Ketidakcocokan kode kamera atau rasio tetap ditolak. Konfirmasi ini adalah pernyataan manual pengguna, bukan identifikasi AI. Untuk sudut baru, biarkan zona nonaktif sampai profile dikalibrasi ulang di JSON; memilih profile yang sembarang tidak membuat kalibrasi valid.
5. Mengganti/menghapus/mencoba ulang video mereset metadata frame, identitas, profile aktif, konfirmasi, dan tempat penyimpanan hasil analisis (tetap null karena belum ada analisis). Event decoder dan hasil hash dari video lama diabaikan. Toggle tampilan tidak mengubah playback atau kontrol native.

Pilihan manual hanya berlaku pada sesi kartu browser, tidak ditulis ke registry, database, atau Docker. Setelah refresh pilih ulang file. `canAnalyzeZones` di frontend dan `zone_analysis_eligible` pada validator adalah gerbang kesiapan konfigurasi untuk integrasi berikutnya, bukan tanda bahwa detektor/perhitungan sedang berjalan. Tahap ini tidak menghasilkan hitungan atau hasil AI.

Fingerprint memakai Web Crypto (localhost/secure context) dan membaca file ke memori browser; video besar memerlukan memori sesuai ukuran file. Jika hashing tidak tersedia/gagal, sumber diperlakukan sebagai belum dikenal dan memerlukan pilihan/konfirmasi manual. File dan hash tidak dikirim ke layanan eksternal. Blob URL tetap tidak dapat dipakai FastAPI; registrasi permanen untuk CLI harus melalui JSON dan file lokal read-only.

## Menjalankan dan memeriksa

Dari root proyek, Docker Desktop harus aktif dan environment Compose Tahap 1 sudah tersedia:

```powershell
docker compose config --quiet
docker compose up -d --build --no-deps ai-service
docker compose exec -T ai-service python -m app.local_video --schema-only
docker compose exec -T ai-service python -m app.local_video
docker compose exec -T ai-service python -m unittest discover -s tests -p 'test_local_video.py' -v
```

`--schema-only` tidak membaca video dan selalu menyatakan `ready_for_stage4_input: false`, dengan `source_validation: NOT_RUN`. Validasi lengkap membaca keempat sumber dan menghasilkan JSON di stdout. Exit code 0 untuk validasi lengkap berarti empat sumber berstatus `VALID`, `camera_count: 4`, `zone_count: 8`, dan `ready_for_stage4_input: true`. `inference_enabled` tetap `false`. Exit code 1 berarti ada konfigurasi/sumber yang gagal dan input belum siap. Status yang mungkin antara lain `MISSING_FILE`, `UNREADABLE_VIDEO`, `ASPECT_RATIO_MISMATCH`, `UNCALIBRATED_SOURCE`, `CAMERA_PROFILE_MISMATCH`, dan `INVALID_PATH`.

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

Perintah regresi frontend dan build:

```powershell
npm.cmd --prefix frontend run test:zones
npm.cmd --prefix frontend run test:local-video
npm.cmd --prefix frontend run build
```

Regresi bug pergantian sumber mencakup Barat ke Utara, sumber tidak dikenal, kode kamera/profile berbeda, resolusi proporsional, rasio berubah, konfirmasi manual, hasil fingerprint terlambat, dan reset saat hapus/retry/error. Test memakai stub identitas/metadata, tanpa membuat data deteksi. Validator Tahap 3 lama tetap digunakan untuk inspeksi rekaman acuan; kebijakan input rekaman berikutnya mengikuti kontrak v2 ini.

Hasil verifikasi perbaikan: 17 test zona/profile, 11 test input browser, 25 regresi dashboard/simulator, 21 test kontrak container, dan 7 test konfigurasi Tahap 3 lulus. Production build berhasil. Pemeriksaan Edge terhadap rekaman asli membuktikan pergantian Barat ke Utara, pemblokiran sumber tidak dikenal/profile berbeda, empat video dengan delapan polygon, kontrol native, toggle independen, serta alignment mobile. Validator container membaca empat sumber asli dengan status VALID; `inference_enabled: false`. Browser tidak mengirim upload selama pemeriksaan.

## Urutan kerja Tahap 4 (belum diimplementasikan)

1. Jalankan perintah Compose dan validator lengkap di atas. Hentikan persiapan inferensi jika exit code bukan 0 atau salah satu kamera tidak `VALID`. Tinjau kembali frame/polygon manual untuk memastikan rekaman yang akan dianalisis sesuai kalibrasi.
2. Di implementasi Tahap 4 nanti, gunakan `load_inputs(os.environ['SIGAP_QUEUE_ZONES_PATH'])` dan root `os.environ['SIGAP_OFFLINE_ROOT']`. Pilih kamera dari empat `camera_code` terdaftar; ambil file dengan `camera.resolve_file(root)`, verifikasi identitas melalui `validate_sources`, lalu zona melalui `camera.pixel_zones(frame_width, frame_height, input_camera_code)`. Jangan menerima blob URL atau path sembarang dari browser sebagai sumber container. Saat mengganti sumber, batalkan pekerjaan frame lama, hapus hasil lama, dan validasi identitas/profile kembali sebelum analisis.
3. Baru pada Tahap 4, tambahkan worker inferensi lokal untuk frame rekaman yang sudah lolos. Definisikan resize/letterbox dan transformasi balik ke resolusi asli. Jangan menggunakan ukuran elemen video dashboard sebagai acuan.
4. Tentukan aturan geometris penempatan hasil anonim ke zona, termasuk objek pada garis batas agar tidak dihitung ganda. Validasi pada contoh beranotasi manual dari sumber nyata. Tidak menggunakan identitas persisten, OCR, atau pengenalan wajah.
5. Hasil Tahap 4 harus berasal dari inferensi nyata dan diberi penanda rekaman offline. Jika mengeluarkan jumlah per zona, bedakan jumlah objek dalam suatu frame dari jumlah kendaraan unik sepanjang waktu; tanpa tracking tidak boleh mengklaim hitungan unik. Susun kontrak hasil dan tesnya saat tahap tersebut dikerjakan, tanpa data deteksi tiruan.
6. Integrasikan hasil ke UI/API hanya dalam ruang lingkup Tahap 4 yang disepakati. Tahap 3.8 tidak menambahkan endpoint inferensi, job model, command `infer`, output deteksi, atau keputusan lampu.

Tidak ada command inferensi yang dapat dijalankan sekarang. Semua command pada dokumen ini menyiapkan service dan memvalidasi input; estimator opt-in hanya memakai angka simulator/estimasi lokal yang diberi label jujur. Backend/database tidak diubah; tidak ada YOLO, penghitungan kendaraan dari model, tracking ID, OCR plat, pengenalan wajah, heuristik lampu, atau koneksi ATCS fisik pada tahap ini. Tidak ada commit atau push.
