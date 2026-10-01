# YOLOv13 lokal: snapshot video browser

Pipeline ini memakai **YOLOv13-N pretrained COCO asli**, tanpa training/fine-tuning. Browser mengambil JPEG dari elemen `<video>` yang dipilih pengguna, mengirimkannya hanya ke FastAPI pada loopback, lalu menampilkan bbox dan jumlah kendaraan dalam zona. MP4 tidak dipindah, disalin, atau dikirim. Gambar hanya diproses di memori; tidak masuk database, Git, internet, atau cache disk aplikasi.

`YOLO_LOCAL_REALTIME` adalah nama kontrak mode snapshot berkala. Nama tersebut **bukan jaminan 25/30 FPS**, bukan CCTV live, dan bukan koneksi ATCS. Jumlah yang ditampilkan adalah okupansi zona pada frame terbaru, bukan jumlah kumulatif, jumlah kendaraan unik, atau bukti kendaraan berhenti.

## Dependency, weights, dan perangkat

- Implementasi: [iMoonLab/yolov13](https://github.com/iMoonLab/yolov13), commit `73289949533efac82bb5f72ec19b746618656bd2` (fork dengan paket bernama `ultralytics`, versi internal `8.3.63`). **Bukan** `pip install ultralytics` dari PyPI.
- Paper: [arXiv:2506.17733](https://arxiv.org/abs/2506.17733).
- Weights: [release resmi yolov13n.pt](https://github.com/iMoonLab/yolov13/releases/download/yolov13/yolov13n.pt), ukuran 10.570.688 byte.
- SHA256 dari asset release resmi: `6653035017b0f111f80ec11ed914874ea85699b104aeac1e46e517d16889d6b7`.
- Lokasi host: `models/yolov13/yolov13n.pt` (ignored); mount container `/models/yolov13/yolov13n.pt` read-only. Downloader dan adapter sama-sama memeriksa digest sebelum model dapat dimuat.
- Python 3.11, PyTorch `2.2.2+cpu`, torchvision `0.17.2+cpu`, NumPy `1.26.4`, OpenCV headless `4.10.0.84`. Dependency inference lain dipin di `ai-service/requirements-yolo.txt`. NumPy/OpenCV disesuaikan dengan ABI PyTorch ini. Flash Attention tidak diperlukan: kode resmi memiliki fallback PyTorch SDPA di CPU.
- Model dimuat sekali per proses, ketika frame pertama datang, lalu dipakai ulang. Gagal memuat tidak mematikan health; retry paling cepat 30 detik. Tidak ada download otomatis oleh adapter, training, tracking, OCR, atau pengenalan wajah. Lisensi fork upstream: AGPL-3.0.
- Host yang diverifikasi: AMD Ryzen AI 5 340, 6 core/12 thread, RAM sekitar 16 GB; Docker sekitar 7,4 GiB. GPU AMD tidak dipakai. Pada inspeksi tersedia sekitar 348 GiB disk; RAM bebas host sekitar 2 GiB, sehingga inference dibatasi dua thread dan satu pekerjaan global.

## Menjalankan dari PowerShell

Dari root repository, gunakan Docker untuk AI dan Vite pada host:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/setup-yolov13.ps1
docker compose build ai-service
docker compose up -d ai-service
Invoke-RestMethod http://localhost:8001/health
Invoke-RestMethod http://localhost:8001/local-video/model-status
npm.cmd --prefix frontend run dev -- --host 127.0.0.1 --port 3000
```

ExecutionPolicy hanya berlaku untuk proses downloader tersebut; tidak mengubah policy Windows permanen. Buka `http://127.0.0.1:3000` (atau port yang dicetak Vite). Pilih video pada empat kartu. Di **Mode peta**, pilih **YOLO lokal**, lalu pastikan video diputar. `Simulasi visual` tetap default dan menghentikan pengiriman frame. Pemilihan mode tidak mengubah mode Laravel, SIGAP_ADAPTIVE, kontrol fase, atau aturan simulator satu arah hijau.

Endpoint AI dipublish hanya pada `127.0.0.1:8001`. Komunikasi antarkontainer tetap memakai jaringan Compose. `VITE_AI_SERVICE_URL` default `http://localhost:8001`; pengiriman snapshot menolak hostname di luar `localhost`, `127.0.0.1`, dan `::1`. Tidak perlu menyiapkan salinan video di `frontend/public` atau mount video baru: file picker browser menjadi sumbernya. Mount `cctv-offline` existing tetap digunakan hanya oleh validator/script verifikasi offline.

## Konfigurasi

Parameter publik dapat ditentukan di environment proses PowerShell sebelum `docker compose up -d ai-service` (tanpa mengubah `.env`):

| Parameter container | Default | Keterangan |
| --- | --- | --- |
| `SIGAP_YOLO_WEIGHTS` | `/models/yolov13/yolov13n.pt` | File resmi, diperiksa SHA256; bukan input path dari request |
| `SIGAP_YOLO_DEVICE` | `cpu` | Diteruskan ke detector; image ini memakai wheels CPU. GPU memerlukan image/runtime PyTorch GPU yang sesuai dan belum diuji |
| `SIGAP_YOLO_CONFIDENCE` | `0.25` | Threshold 0,01–0,99 |
| `SIGAP_YOLO_IMAGE_SIZE` | `640` | 320–960, dibulatkan ke kelipatan 32 |
| `SIGAP_YOLO_MIN_INTERVAL_SECONDS` | `1.5` | Batas request per kamera |
| `SIGAP_YOLO_MAX_AGE_SECONDS` | `10` | Umur maksimum dihitung dari waktu capture, termasuk waktu proses |
| `SIGAP_YOLO_SLOT_TIMEOUT_SECONDS` | `3` | Batas menunggu slot model, 0,1–5 detik; maksimal satu frame per kamera |
| `VITE_YOLO_INTERVAL_MS` (host Vite) | `2000` | Target interval awal request, minimum 1500 ms; waktu proses termasuk dalam interval, ditambah jitter kecil antarkamera |

Snapshot seluruh frame diperkecil proporsional sampai sisi terpanjang 1280 px, JPEG quality 0,85, tanpa crop. Container menerima JPEG/PNG sampai 2 MiB, dimensi snapshot 16–2048 px per sumbu. Ukuran original dan rasio snapshot divalidasi sebelum inference. Ukuran original maksimum 8192 px per sumbu.

Satu request aktif per kartu dan satu slot inference global. Empat kamera dapat menunggu slot secara terbatas, maksimal satu frame per kamera. Request duplikat dari kamera yang masih menunggu/berproses ditolak HTTP 429. Jika batas tunggu habis, browser mengambil frame **baru** pada kesempatan berikutnya dan mempertahankan hasil terakhir selama belum kedaluwarsa. Usia frame dan identitas sesi diperiksa kembali setelah mendapat slot. Pause/seek/loop/remove/error/dispose/disable membatalkan request, menghapus hasil UI, dan menutup sesi. Proses native yang sudah berjalan mungkin selesai di server, tetapi tidak boleh memasukkan hasil ke sesi yang telah ditutup/diganti.

## Kontrak endpoint

- `GET /health`: liveness HTTP, `model_ready` dan `yolo_status` terpisah; tidak memuat model.
- `GET /local-video/model-status`: readiness, model, device, threshold, input size, alasan yang bisa ditindaklanjuti.
- `POST /local-video/sessions`: JSON `camera_id`, UUID `client_id`, UUID `source_id`, integer `revision > 0`; membuat UUID `session_id` baru dan menghapus hasil sebelumnya untuk kamera tersebut. Revisi lebih lama dari client yang sama ditolak 409.
- `DELETE /local-video/sessions/{camera_id}/{session_id}`: menutup hanya sesi yang cocok; cleanup sesi lama tidak mematikan sesi baru.
- `POST /local-video/detect-frame`: body biner `image/jpeg` atau `image/png`; header `X-Frame-Metadata` berisi JSON berikut, maksimum 4096 karakter. Tidak menerima URL, blob URL, atau path filesystem server.

```json
{
  "camera_id": "CAM-W-01",
  "session_id": "UUID-dari-endpoint-sessions",
  "source_id": "UUID-sumber-browser",
  "frame_sequence": 1,
  "profile_id": "CAM-W-01",
  "input_camera_code": "CAM-W-01",
  "source_sha256": "64-karakter-hex-atau-null",
  "calibration_confirmed": false,
  "captured_at": "2026-09-30T10:00:00.000Z",
  "video_time_seconds": 5.2,
  "original_width": 1920,
  "original_height": 1080,
  "frame_width": 1280,
  "frame_height": 720
}
```

`captured_at` adalah waktu snapshot saat ini, bukan tanggal rekaman. Jam browser dan Docker harus selaras. Frame yang terlalu tua atau lebih dari 5 detik di masa depan ditolak. Nomor urut harus meningkat dalam sesi; mundur dalam waktu video karena seek/loop memulai sesi baru.

Respons deteksi menyertakan identitas sumber/sesi/frame, `source_type: YOLO_LOCAL_REALTIME`, `inference_enabled`, `model_name`, waktu capture/proses/kedaluwarsa, posisi waktu video, durasi proses, `stale`, `status`, `note`, tiga nilai antrean, dan `detections`. Setiap deteksi hanya berisi nama kelas, confidence, bbox normalized `[x1,y1,x2,y2]`, serta `lane_type` bila zona valid. Tidak ada ID objek persisten atau atribut identitas pribadi.

`GET /local-video/queue-summary?mode=YOLO_LOCAL_REALTIME` selalu memberikan WEST/Barat, NORTH/Utara, EAST/Timur, SOUTH/Selatan dari cache YOLO. Polling tidak menjalankan inference. Endpoint tanpa parameter tetap mempertahankan flow `DISABLED`/`SIMULATOR`/`OFFLINE_ESTIMATION` lama. Nilai simulator tidak pernah masuk cache YOLO. Browser juga memeriksa session/source miliknya sebelum menampilkan nilai dan sebelum rekomendasi DSS.

| Status | Makna nilai |
| --- | --- |
| `WAITING_FOR_DETECTION` | Belum ada frame; semua antrean `null` |
| `DETECTION_READY` | Inference dan zona valid; nilai 0 sah jika tidak ada kendaraan dalam zona |
| `ZONE_CALIBRATION_REQUIRED` | Bbox umum boleh ada, semua antrean `null` |
| `YOLO_MODEL_UNAVAILABLE` | Weights/dependency gagal, semua antrean `null`; periksa note dan log |
| `INFERENCE_ERROR` | Frame gagal diproses; semua antrean `null` |
| `STALE` | Hasil kedaluwarsa; semua antrean `null`, `stale: true` |

UI menampilkan label singkat dan detail sesi/model/timing dalam accordion. Bbox berasal dari frame sampel terakhir, bukan tracking interpolasi; dipertahankan sampai hasil berikutnya atau TTL capture habis. Waktu frame tertera pada kartu CCTV. Pause/seek/loop, penggantian sumber, atau error membersihkan hasil. Overlay SVG mengikuti area gambar asli dengan letterbox dan resize, serta tidak menangkap pointer pada kontrol HTML5.

Respons `detect-frame` langsung memperbarui ringkasan antrean dan peta melalui state sesi browser. Polling tetap tersedia untuk sinkronisasi, tetapi nomor urut frame mencegah respons polling lama menimpa hasil yang lebih baru. Data harus cocok dengan sesi/sumber aktif dan belum kedaluwarsa; kegagalan polling tidak menghapus hasil frame browser yang masih sah.

Peta YOLO menampilkan okupansi dua lajur per arah, maksimal tujuh ikon per lajur, dengan angka total sebenarnya. Posisi ikon bersifat skematis: tidak memproyeksikan bbox CCTV ke koordinat geografis atau mengklaim tracking. Lampu dan kendaraan simulator hanya muncul pada mode simulasi. Header menampilkan mode visualisasi, sedangkan status kontrol lampu tetap menyebut konfigurasi backend `ATCS_NORMAL`/simulator.

Rekomendasi menampilkan **Data parsial (n/4 arah)** serta nama arah yang masih ditunggu jika baru sebagian video menghasilkan antrean. Arah yang tidak tersedia tetap `null`, tidak diasumsikan kosong. Perbandingan fase dan durasi hijau diberikan setelah empat arah memiliki data valid; hasil 0 kendaraan dari frame valid termasuk data yang siap.

## Zona dan video baru

Untuk checkpoint hasil fine-tuning dataset kendaraan, lihat [panduan training lokal vehicles v2](vehicles-v2-local-training.md). Profile default tetap COCO; profile `vehicles-v2` membutuhkan path dan SHA256 eksplisit, serta melaporkan cakupan tiga kelas dan keterbatasan sepeda motor.

Sumber polygon tetap `config/cctv/queue_zones.json`, dengan validator existing `load_inputs` dan `pixel_zones`. Koordinat normalized terhadap frame asli, bukan dimensi kartu. Filter kelas memakai **nama kelas model** `car`, `motorcycle`, `bus`, `truck`; ambulans/pemadam tidak diklaim sebagai kelas COCO.

Titik uji adalah bottom-center bbox `((x1+x2)/2, y2)`. Deteksi di luar kedua zona tidak dihitung. Jika titik termasuk kedua polygon (termasuk batas bersama), deteksi dikeluarkan dari kedua lajur dan tercatat sebagai ambigu. `total_queue = outer_lane_queue + inner_lane_queue`.

1. Pilih video baru di kartu, aktifkan YOLO lokal dan putar. Model boleh mendeteksi tanpa profile: UI menampilkan **Kalibrasi zona**, hitungan tetap `null`.
2. Buka **Detail sumber**. Pilih kode kamera dan profile yang cocok. Untuk rekaman baru dengan sudut/cakupan yang sama, centang konfirmasi sudut secara eksplisit; rasio frame harus cocok.
3. Jika sudut/crop berbeda, jangan centang konfirmasi. Kalibrasi ulang dua polygon dari frame asli, perbarui reference/calibration dan identity pada konfigurasi versioned, jalankan validator zona, restart AI service dan Vite, lalu pilih ulang video. Konfirmasi pengguna merupakan pernyataan manual, bukan verifikasi AI atas sudut kamera.
4. Ganti/hapus video atau pause: angka arah terkait harus langsung menjadi `-` dan bbox hilang. Video baru tidak mewarisi sesi/hasil sebelumnya. Sesudah refresh file perlu dipilih ulang.

Demo ini menggunakan satu browser operator aktif dan satu worker Uvicorn. Cache hanya empat kamera di memori dan hilang saat restart. Jangan menjalankan beberapa produsen pada kamera yang sama atau beberapa worker tanpa mengganti penyimpanan/koordinasi sesi. TTL tetap melindungi penutupan tab yang tidak sempat mengirim cleanup.

## Test dan verifikasi nyata

```powershell
docker compose exec -T ai-service pytest -q
docker compose exec -T ai-service python -m app.local_video --schema-only
docker compose exec -T ai-service python scripts/verify_yolo_local.py
Invoke-RestMethod 'http://localhost:8001/local-video/queue-summary?mode=YOLO_LOCAL_REALTIME'
(Invoke-RestMethod http://localhost:8001/openapi.json).paths
npm.cmd --prefix frontend run test:zones
npm.cmd --prefix frontend run test:local-video
npm.cmd --prefix frontend run test:phase-recommendation
npm.cmd --prefix frontend run test:queue-source
npm.cmd --prefix frontend run test:map-mode
npm.cmd --prefix frontend run test:inference
npm.cmd --prefix frontend run build
```

`verify_yolo_local.py` membaca dua frame per video dari mount offline yang sudah tersedia, menghitung SHA256 video sebenarnya, lalu mengirim frame ke endpoint HTTP yang sama. Script tidak memakai mock dan menutup sesi sesudah verifikasi; jalankan ketika dashboard tidak sedang mengirim frame. Mock hanya dipakai dalam unit test dan bukan bukti YOLO berhasil.

Verifikasi awal nyata pada mesin ini (640 input, confidence 0,25):

| Kamera | Waktu video | Deteksi kendaraan seluruh frame | Luar | Dalam | Proses server |
| --- | ---: | ---: | ---: | ---: | ---: |
| CAM-W-01 | 5 dtk | 4 | 0 | 0 | 7082,88 ms (load pertama) |
| CAM-W-01 | 8 dtk | 6 | 1 | 0 | 414,62 ms |
| CAM-N-01 | 10 dtk | 17 | 3 | 1 | 154,76 ms |
| CAM-N-01 | 13 dtk | 7 | 2 | 2 | 162,87 ms |
| CAM-E-01 | 10 dtk | 16 | 4 | 3 | 229,53 ms |
| CAM-E-01 | 13 dtk | 14 | 3 | 4 | 198,64 ms |
| CAM-S-01 | 5 dtk | 11 | 1 | 2 | 163,42 ms |
| CAM-S-01 | 8 dtk | 7 | 0 | 0 | 171,77 ms |

Rata-rata tujuh frame sesudah load pertama: **213,66 ms/frame** (decode + inference + hitung zona). Ini bukan FPS pemutaran dan bukan throughput empat kamera sekaligus. Browser sengaja memberi jeda minimal 2 detik setelah request selesai; antrean model penuh menyebabkan frame dibuang, bukan ditumpuk.

Pengulangan setelah build akhir menghasilkan jumlah deteksi/zona yang sama pada delapan frame: load pertama **6492,19 ms**, rata-rata tujuh frame hangat **186,97 ms/frame**, rentang **152,35–288,59 ms**. Output lengkap disimpan di `artifacts/yolo/final-real-inference.jsonl`. Script menutup sesi verifikasi, sehingga queue summary kembali `null`/`WAITING_FOR_DETECTION` sampai browser mengirim frame baru; kesiapan model tetap `READY`.

Pengukuran browser nyata selama **20,03 detik** dengan empat video diputar bersamaan: **11 frame sukses, 0,55 frame/detik gabungan**. Per arah: Barat 4 frame (0,20 FPS), Utara 3 (0,15 FPS), Timur 2 (0,10 FPS), Selatan 2 (0,10 FPS). Nilai zona Timur berubah 5 → 4, Utara 2 → 0 → 1. Pengujian memakai Edge headless dengan GPU browser dinonaktifkan pada host development; decode empat video dan beban host memengaruhi hasil. Ini pengukuran pipeline aktual, bukan kecepatan maksimum model. Laporan waktunya ada di `artifacts/yolo/browser-throughput.json`.

Verifikasi akhir: pytest container **54 lulus**; frontend zones **17**, local-video **19**, phase-recommendation **6**, queue-source **3**, map-mode **5**, inference **8**, serta regresi simulator/konfigurasi **25**, semuanya lulus. Production build berhasil. Browser desktop/mobile memverifikasi bbox mengikuti area video, empat arah mendapat data nyata, pergantian/pause/hapus sumber membersihkan hasil, dan simulasi tetap berjalan. Uji stop/start AI service nyata menghasilkan badge AI offline, nilai null, bbox hilang, rekomendasi menunggu data, kemudian inference pulih (`browser-downtime.json`). Pytest masih memberi satu warning deprecation upstream Starlette/httpx; tidak menggagalkan test.

Bukti browser lokal disimpan terpisah dan ignored di `artifacts/yolo/`: screenshot overlay desktop/mobile, screenshot ringkasan, dan laporan respons nyata `browser-verification.json`. Gambar/hasil ini tidak diunggah atau di-commit. Akurasi model kecil terhadap objek jauh, padat, tertutup, atau bergerak cepat belum dievaluasi terhadap anotasi ground truth. Hasil hanya untuk DSS/demo, bukan keputusan lampu otomatis.

## Daftar file implementasi

- Setup: `.gitignore`, `docker-compose.yml`, `scripts/setup-yolov13.ps1`, `ai-service/Dockerfile`, `ai-service/requirements.txt`, `ai-service/requirements-yolo.txt`.
- AI: `ai-service/app/main.py`, `queue_summary.py`, `yolo_detector.py`, `frame_inference.py`, `detection_routes.py`.
- Verifikasi AI: `ai-service/tests/test_frame_inference.py`, `ai-service/scripts/verify_yolo_local.py`.
- UI: `frontend/src/App.vue`, `components/IntersectionMap.vue`, `components/LocalCctvCamera.vue`, `components/DetectionOverlay.vue`.
- Composable: `frontend/src/composables/useMapDisplayMode.js`, `useLocalInference.js`, `useFrameInference.js`, `useVideoZoneProfile.js`, `useQueueSummary.js`.
- Service/util: `frontend/src/services/localInference.js`, `aiQueueSummary.js`, `frontend/src/utils/framePipeline.js`, `inferenceStatus.js`, `phaseRecommendation.js`, `queueSource.js`.
- Test frontend: `frontend/package.json`, `frontend/src/composables/useMapDisplayMode.test.js`, `useQueueSummary.test.js`, `useFrameInference.test.js`, `frontend/src/utils/framePipeline.test.js`.
- Dokumentasi: `README.md`, `docs/yolov13-local-inference.md`.

Tidak ada perubahan Laravel/database, konfigurasi polygon, video sumber, `.env`, atau Git remote. Weights, artifact verifikasi, dan MP4 tetap diabaikan Git. Tidak ada commit/push otomatis.

## Verifikasi perbaikan sinkronisasi dan peta

Pengujian setelah perbaikan: **92 tes frontend**, **57 tes AI service**, dan **10 tes backend (78 assertions)** lulus; production build berhasil. Regresi baru mencakup HTTP 429 tanpa menghapus hasil, interval yang memperhitungkan waktu tunggu model, empat kamera bersamaan, invalidasi sesi saat menunggu, frame kedaluwarsa, loop video, polling yang terlambat, serta jumlah ikon dan antrean parsial.

Uji Edge headless dengan empat rekaman asli membuktikan angka antrean, rekomendasi, dan peta tetap diperbarui saat request polling ringkasan sengaja diblokir. Pause dan penggantian sumber membersihkan data arah terkait, mode simulasi dapat dipulihkan, dan tampilan 1440/390 px tidak menimbulkan error JavaScript atau overflow horizontal. Dalam jendela pengukuran 20,005 detik setelah model siap, terdapat **20 respons frame sukses: 5 per kamera**. Ini pengukuran pada beban host saat pengujian, bukan jaminan FPS; HTTP 429 masih dapat terjadi saat beban tinggi dan hasil lama tetap mengikuti TTL.

Bukti lokal ignored tersedia di `artifacts/yolo/fix-browser-verification.json`, `fix-map-desktop.png`, `fix-map-mobile.png`, `fix-queues-desktop.png`, dan `fix-recommendation-desktop.png`. Perbaikan alur ini tidak mengubah weights, threshold model, atau polygon kalibrasi; akurasi deteksi terhadap anotasi ground truth belum diukur.
