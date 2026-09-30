# Ringkasan antrean offline dan estimator eksplisit

`GET http://localhost:8001/local-video/queue-summary` membaca konfigurasi manual
`config/cctv/queue_zones.json` melalui `SIGAP_QUEUE_ZONES_PATH` dan validator
`load_inputs` yang sudah dipakai CLI. Secara default endpoint tidak membaca file
video dan tidak menghasilkan angka; blob URL browser tetap tidak diterima.

Estimator satu-frame dapat diaktifkan secara eksplisit melalui
`SIGAP_QUEUE_ESTIMATION_MODE`. Mode `SIMULATOR` memakai fixture angka lokal yang
jelas diberi label simulator. Mode `OFFLINE_ESTIMATION` memakai angka dari
`SIGAP_QUEUE_ESTIMATES_JSON`. Keduanya hanya memeriksa satu frame lokal sebelum
mengembalikan angka; tidak menjalankan YOLO, tracking, OCR, wajah, atau koneksi
CCTV live. Panduan lengkap ada di [offline-queue-estimation.md](offline-queue-estimation.md).

Response HTTP 200 memiliki `configuration_valid: true`, `source_type: OFFLINE_CONFIG`,
`inference_enabled: false`, `estimation_enabled: false`, `estimation_mode: DISABLED`,
`source_validation: NOT_RUN`, dan array `approaches`
berurutan WEST/Barat, NORTH/Utara, EAST/Timur, SOUTH/Selatan. Tiap entri memuat
`approach_code`, `approach_name`, `camera_id`, `profile_id`, `source_type`,
`outer_lane_queue`, `inner_lane_queue`, `total_queue`, `status`, dan `note`.

Pada mode default, ketiga nilai antrean adalah **null**: belum diukur, bukan bukti
tidak ada kendaraan. Status tiap arah adalah `WAITING_FOR_DETECTION`. Pada mode
estimator, nilai angka hanya dikembalikan untuk file/frame yang valid dan status
arahnya `SIMULATOR`; jika sumber tidak ada atau frame gagal dibaca, nilainya tetap
`null` dan status kembali `WAITING_FOR_DETECTION`.

Jika JSON hilang, tidak lengkap, atau invalid, endpoint mengembalikan HTTP **503**
beserta empat arah, `configuration_valid: false`, `error_code: INVALID_ZONE_CONFIG`,
status `OFFLINE_CONFIG`, serta ID kamera/profile dan antrean null. Seluruh kontrak
ditolak agar tidak mencampur profile lama dengan konfigurasi rusak. Pesan tidak
membocorkan path lokal atau isi JSON. Konfigurasi dibaca ulang setiap request,
sehingga perbaikan file langsung berlaku. `/health` tetap menunjukkan kesehatan
service secara terpisah dari validitas konfigurasi.

Jalankan dari root proyek dengan Docker Desktop aktif:

```powershell
docker compose build ai-service
docker compose up -d ai-service
docker compose exec ai-service pytest
Invoke-RestMethod http://localhost:8001/local-video/queue-summary | ConvertTo-Json -Depth 5
Invoke-RestMethod http://localhost:8001/health
(Invoke-RestMethod http://localhost:8001/openapi.json).paths.'/local-video/queue-summary'
```

`pytest` menjalankan test kontrak input dan estimator: empat arah, nilai null,
frame hilang, mode simulator/offline-estimation, penjumlahan lajur, mapping
profile dari JSON, konfigurasi rusak, pemulihan konfigurasi, endpoint read-only,
dan dokumentasi OpenAPI. Frontend dan database tidak diubah oleh pipeline ini.
Frontend, database, dan simulator tidak diubah. Tidak ada YOLO real-time,
deteksi buatan, tracking ID, OCR plat, pengenalan wajah, atau koneksi CCTV nyata.
