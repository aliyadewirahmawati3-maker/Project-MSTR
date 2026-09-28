# SIGAP-ASTRA

Prototype Decision Support System (DSS) untuk simpang Jl. Ibrahim Adjie sisi Mall Tenth Avenue, Bandung. SIGAP tidak terhubung ke kontroler lampu lalu lintas atau ATCS fisik.

Tahap 1 mengaktifkan Laravel 12, PostgreSQL 16, dan FastAPI dalam status standby. Frontend Vue/Vite beserta simulator visual tetap terpisah dan belum mengambil konfigurasi dari API.

## Batasan sistem

- Mode awal `ATCS_NORMAL` adalah **simulator**. Durasi fase merupakan parameter prototype, bukan data faktual ATCS Bandung.
- Empat kamera merupakan konfigurasi awal: `UNCONFIGURED`, `stream_url: null`. Tidak ada video/CCTV nyata yang diproses.
- AI service hanya menyediakan endpoint kesehatan; inferensi belum aktif. Container sehat tidak berarti deteksi kendaraan aktif.
- Tidak ada YOLO, vehicle tracking/tracking ID, OCR plat nomor, pengenalan wajah, algoritma heuristik keputusan, atau pengendalian lampu fisik.
- `traffic_measurements` dan `heuristic_decisions` tetap kosong. Data simulator tidak diklaim sebagai hasil deteksi nyata.

## Struktur

| Lokasi | Fungsi |
| --- | --- |
| `frontend/` | Dashboard Vue/Vite dan simulator visual |
| `backend/` | Laravel, 9 migration, Eloquent model, seeder, API read-only, PHPUnit |
| `ai-service/` | FastAPI standby, tanpa inferensi |
| `database/schema/01_init.sql` | Ekstensi PostgreSQL; tabel dikelola Laravel |
| `database/erd/README.md` | Diagram relasi |
| `docs/api.md` | Kontrak endpoint dan contoh JSON |
| `scripts/setup-env.ps1` | Menyiapkan environment lokal dan APP_KEY |

## Menjalankan Tahap 1 di Windows / PowerShell

Prasyarat: Docker Desktop dengan Linux containers/WSL2 aktif. Tidak diperlukan PHP, Composer, PostgreSQL, maupun Python global Windows. Port default: backend `8000`, ai-service `8001`, PostgreSQL `5432`.

Jalankan dari root proyek:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-env.ps1
docker compose up --build -d db backend ai-service
docker compose ps
docker compose logs --tail=50 backend
```

Opsi ExecutionPolicy berlaku hanya untuk proses PowerShell tersebut; tidak mengubah kebijakan Windows secara global. Script menyalin `.env.example` ke `.env` dan `backend/.env.example` ke `backend/.env` hanya jika belum ada, lalu mengisi APP_KEY acak 32 byte bila masih kosong/placeholder. Nilai lokal yang sudah ada dipertahankan. Compose mengambil environment dari `.env` root dan meneruskannya ke container. `.env` dan `vendor/` diabaikan Git; jangan menambahkan keduanya ke commit.

Tunggu backend `healthy` (startup Composer selesai), kemudian:

```powershell
docker compose exec -T backend php artisan migrate --seed
docker compose exec -T backend php artisan route:list
docker compose exec -T backend php artisan migrate:status
docker compose exec -T backend php vendor/bin/phpunit
```

Hanya tiga service tersebut yang dijalankan untuk menghemat RAM Docker sekitar 2,7 GB. Jangan gunakan `docker compose up -d` tanpa nama service pada Tahap 1 karena itu juga menjalankan frontend Docker.

Untuk menghentikan ketiganya tanpa menghapus data:

```powershell
docker compose stop db backend ai-service
```

## Mengapa vendor tetap tersedia pada fresh clone

Source backend di-bind mount ke `/var/www/html`, sedangkan `vendor` memakai named volume `sigap_vendor`. Dependency dari `composer.lock` dipasang saat build, termasuk PHPUnit untuk development. Volume baru menerima isi vendor dari image. Startup menjalankan `composer install` lagi untuk menyelaraskan volume yang sudah ada dengan lock file dan membentuk autoloader setelah source terpasang. Direktori storage dan bootstrap cache dibuat saat startup.

Instalasi gagal akan menghentikan startup; tidak ada `--ignore-platform-reqs`, penelanan error dengan `|| true`, atau Composer update otomatis. Dependency PHP dan `composer.lock` tidak diubah.

`COMPOSER_PROCESS_TIMEOUT=1200` disediakan di `.env.example` untuk proses Composer pada mesin lambat. Jika perlu menaikkannya, ubah `.env` root lalu ulangi build tiga service. Untuk diagnosis:

```powershell
docker compose logs --tail=100 backend
docker compose exec -T backend composer check-platform-reqs
docker compose exec -T backend ls -l vendor/autoload.php
```

Rujukan: [perilaku volume Docker](https://docs.docker.com/engine/storage/volumes/#mounting-a-volume-over-existing-data) dan [timeout proses Composer](https://getcomposer.org/doc/06-config.md#process-timeout).

## PostgreSQL dan seeder

Laravel migration adalah sumber tunggal struktur tabel. SQL init hanya menyiapkan ekstensi `uuid-ossp`; tidak membuat tabel atau menanam status kamera/AI sehat.

`php artisan migrate --seed` menghasilkan:

- 1 simpang `BDG-IBR-ADJ-01`: Perempatan Jl. Ibrahim Adjie Sisi Mall Tenth Avenue.
- 4 arah: Barat (`WEST`), Utara (`NORTH`), Timur (`EAST`), Selatan (`SOUTH`).
- 2 lajur per arah: `outer` dan `inner` (8 lajur).
- 4 konfigurasi kamera `UNCONFIGURED` dengan stream kosong.
- Status `ATCS_NORMAL`, catatan simulator/menunggu data, `is_ai_healthy: false`, `is_cctv_healthy: false`.
- Fase `PHASE_EW` (Barat–Timur, 30 detik) dan `PHASE_NS` (Utara–Selatan, 25 detik), kuning 3 detik, all-red 2 detik.
- 1 log inisialisasi; tanpa pengukuran kendaraan atau keputusan heuristik.

Seeder berjalan dalam transaksi dan hanya mengisi konfigurasi yang belum ada. Menjalankannya ulang tidak menggandakan status/log atau menimpa konfigurasi dan catatan operator.

Volume `sigap_pgdata` mempertahankan data. Perubahan SQL init hanya berlaku pada volume baru. Jika volume lama berisi tabel dari SQL baseline sebelumnya dan migration mengeluh `relation already exists`, periksa/backup isinya dan rekonsiliasi schema terlebih dahulu; jangan menghapus volume atau memakai `migrate:fresh` pada data yang ingin disimpan.

## API lokal dan pengujian

Base URL: `http://localhost:8000/api`. Ambil ID dari daftar simpang; jangan menganggap ID selalu 1.

| Method | Path | Respons |
| --- | --- | --- |
| GET | `/health` | HTTP 200 saat PostgreSQL tersambung; HTTP 503 / `degraded` jika gagal; `operating_context: simulator` |
| GET | `/intersections` | Daftar simpang beserta relasi |
| GET | `/intersections/{id}` | Detail simpang |
| GET | `/intersections/{id}/approaches` | 4 arah dan 2 lajur per arah |
| GET | `/intersections/{id}/cameras` | 4 konfigurasi kamera |
| GET | `/intersections/{id}/system-status` | Mode simulator dan kesiapan AI/CCTV |
| GET | `/intersections/{id}/signal-phases` | Parameter kedua fase simulator |

```powershell
Invoke-RestMethod http://localhost:8000/api/health
$result = Invoke-RestMethod http://localhost:8000/api/intersections
$intersectionId = $result.data[0].id
Invoke-RestMethod "http://localhost:8000/api/intersections/$intersectionId/system-status"
Invoke-RestMethod http://localhost:8001/health
```

AI health `http://localhost:8001/health` menunjukkan service HTTP sehat dengan YOLO `STANDBY` dan tracking nonaktif.

PHPUnit memakai PostgreSQL sesuai `phpunit.xml`; jalankan setelah migration/seeder. Suite menguji kesehatan, kegagalan koneksi database, 404, konfigurasi dari semua endpoint simpang, dan seeder berulang. Test yang menulis data memakai transaksi yang di-rollback, tanpa `migrate:fresh`. Gunakan database development prototype ini; test baseline mengharapkan kamera belum dikonfigurasi dan tabel deteksi/keputusan kosong.

## Tahap 2: frontend mengambil data API

Tahap ini belum dikerjakan. Urutan implementasi selanjutnya:

1. Pertahankan tiga service di atas dan pastikan `/api/health` melaporkan `database.connected: true`.
2. Tetapkan `VITE_API_BASE_URL=http://localhost:8000/api` pada environment lokal frontend. Jalankan Vue dari host dengan `cd frontend`, `npm ci` bila dependency belum tersedia, lalu `npm run dev`. Frontend Docker tetap tidak diperlukan.
3. Buat modul akses API dengan fetch, pemeriksaan HTTP status, timeout, serta state loading/error. Ambil `/intersections`, pilih kode `BDG-IBR-ADJ-01`, dan gunakan ID respons untuk endpoint detail/arah/kamera/status/fase.
4. Petakan data konfigurasi ke tampilan yang sudah ada tanpa mengganti desain, layout, atau logika simulator. Pisahkan status koneksi API dari kesiapan deteksi AI/CCTV; `UNCONFIGURED`/stream null berarti standby atau menunggu data.
5. Jika origin Vite memerlukan CORS, verifikasi respons backend dan atur origin development atau proxy Vite `/api`. Uji alur normal, API terputus, data kosong, dan pulih setelah retry.
6. Jangan menghubungkan nilai simulasi ke tabel pengukuran nyata, menambahkan inferensi/heuristik, atau mengirim kontrol ke ATCS fisik.

