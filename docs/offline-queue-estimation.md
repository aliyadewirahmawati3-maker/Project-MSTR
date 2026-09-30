# Estimator antrean offline eksplisit

`GET /local-video/queue-summary` tetap aman secara default. Tanpa konfigurasi
mode, service hanya membaca `config/cctv/queue_zones.json` dan mengembalikan
empat arah dengan antrean `null` serta status `WAITING_FOR_DETECTION`.

Estimator ini bukan YOLO dan bukan pembacaan CCTV live. Saat diaktifkan,
service membuka satu frame awal per MP4 untuk memastikan file lokal dapat
dibaca, resolusinya sebanding dengan profile kamera, dan polygon profile dapat
diproyeksikan. Tidak ada model deteksi, identitas kendaraan, tracking, OCR,
wajah, atau penghitungan objek dari frame.

## Mode yang tersedia

Mode dikendalikan oleh environment `SIGAP_QUEUE_ESTIMATION_MODE`:

- `DISABLED` (default): konfigurasi saja, semua nilai antrean `null`.
- `SIMULATOR`: setelah frame valid, memakai fixture angka simulator yang terlihat
  di kode. Angka diberi `source_type: SIMULATOR`, `status: SIMULATOR`, dan note
  bahwa nilainya bukan pengamatan kamera.
- `OFFLINE_ESTIMATION`: setelah frame valid, memakai angka lokal dari
  `SIGAP_QUEUE_ESTIMATES_JSON`. Jika JSON tidak ada atau invalid, nilai tetap
  `null` dan status `WAITING_FOR_DETECTION`.

Contoh menjalankan mode simulator secara eksplisit dari PowerShell:

```powershell
$env:SIGAP_QUEUE_ESTIMATION_MODE = 'SIMULATOR'
docker compose up -d --build ai-service
Invoke-RestMethod http://localhost:8001/local-video/queue-summary | ConvertTo-Json -Depth 6
```

Contoh estimator offline dengan nilai lokal yang sengaja dipasok operator:

```powershell
$env:SIGAP_QUEUE_ESTIMATION_MODE = 'OFFLINE_ESTIMATION'
$env:SIGAP_QUEUE_ESTIMATES_JSON = '{"CAM-W-01":{"outer":2,"inner":1},"CAM-N-01":{"outer":1,"inner":2},"CAM-E-01":{"outer":3,"inner":2},"CAM-S-01":{"outer":1,"inner":0}}'
docker compose up -d --build ai-service
```

Nilai harus bilangan bulat nol atau lebih. `total_queue` selalu dihitung
sebagai `outer_lane_queue + inner_lane_queue`. Hapus kedua environment atau
set mode `DISABLED` untuk mengembalikan perilaku aman default. Compose tetap
memasang `cctv-offline/` dan konfigurasi zona secara read-only.

Mode simulator/offline-estimation hanya memberi kontrak data untuk pengujian
alur frontend. Ia tidak mengubah backend Laravel, database, fase lampu, atau
status kamera fisik. Frontend memakai angka tersebut melalui endpoint yang
sudah ada; label sumber dan status tetap ditampilkan.
