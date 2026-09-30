# Ringkasan konfigurasi antrean offline

`GET http://localhost:8001/local-video/queue-summary` membaca konfigurasi manual
`config/cctv/queue_zones.json` melalui `SIGAP_QUEUE_ZONES_PATH` dan validator
`load_inputs` yang sudah dipakai CLI. Endpoint tidak membaca file video, menerima
blob URL, menjalankan simulator/inferensi, atau menulis data.

Response HTTP 200 memiliki `configuration_valid: true`, `source_type: OFFLINE_CONFIG`,
`inference_enabled: false`, `source_validation: NOT_RUN`, dan array `approaches`
berurutan WEST/Barat, NORTH/Utara, EAST/Timur, SOUTH/Selatan. Tiap entri memuat
`approach_code`, `approach_name`, `camera_id`, `profile_id`, `source_type`,
`outer_lane_queue`, `inner_lane_queue`, `total_queue`, `status`, dan `note`.

Ketiga nilai antrean selalu **null**: belum diukur, bukan bukti tidak ada kendaraan.
Status tiap arah adalah `WAITING_FOR_DETECTION`. ID kamera/profile berasal dari
konfigurasi valid. Kesiapan konfigurasi tidak membuktikan file tersedia, sudut
kamera cocok, atau detektor aktif; validasi file tetap memakai CLI Tahap 3.8.

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

`pytest` menjalankan test kontrak input yang sudah ada serta test HTTP endpoint:
empat arah, nilai null, mapping profile dari JSON, konfigurasi rusak, pemulihan
konfigurasi, tidak mengakses video/menulis data, dan dokumentasi OpenAPI.
Frontend, database, dan simulator tidak diubah. Tidak ada YOLO real-time,
deteksi buatan, tracking ID, OCR plat, pengenalan wajah, atau koneksi CCTV nyata.
