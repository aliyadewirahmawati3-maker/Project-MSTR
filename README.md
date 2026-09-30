# SIGAP-ASTRA

Prototype Decision Support System (DSS) untuk simpang Jl. Ibrahim Adjie sisi Mall Tenth Avenue, Bandung. SIGAP tidak terhubung ke kontroler lampu lalu lintas atau ATCS fisik.

Tahap 1 mengaktifkan Laravel 12, PostgreSQL 16, dan FastAPI dalam status standby. Tahap 2 menghubungkan dashboard Vue/Vite ke konfigurasi Laravel API; simulator visual tetap mandiri.

Tahap 3 menyiapkan empat rekaman CCTV lokal/offline, konfigurasi delapan polygon zona antrean, dan alat validasi/preview mandiri. Panduan, inventaris video, serta batas interpretasi zona tersedia di [docs/stage3-cctv.md](docs/stage3-cctv.md).

Tahap 3.5 menampilkan empat rekaman tersebut pada kartu CCTV dashboard menggunakan pemutar HTML5. Dari root proyek, jalankan `npm.cmd --prefix frontend run cctv:prepare`, kemudian `npm.cmd --prefix frontend run dev -- --host 127.0.0.1`. Buka `http://127.0.0.1:3000/#live-monitoring`. Panduan lengkap tersedia di [docs/stage35-cctv-frontend.md](docs/stage35-cctv-frontend.md).

## Batasan sistem

- Mode awal `ATCS_NORMAL` adalah **simulator**. Durasi fase merupakan parameter prototype, bukan data faktual ATCS Bandung.
- Empat kamera pada backend tetap merupakan konfigurasi awal: `UNCONFIGURED`, `stream_url: null`. Alat Tahap 3 membaca rekaman lokal hanya untuk inspeksi metadata dan preview zona; tidak ada CCTV live atau pemrosesan video oleh service aplikasi.
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

Jalankan frontend dari host Windows dengan Node/npm lokal, tanpa service frontend Docker:

```powershell
cd frontend
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm ci
npm run dev -- --host 127.0.0.1
```

Buka alamat yang dicetak Vite (default `http://127.0.0.1:3000`). `.env.local` berisi `VITE_API_BASE_URL=http://localhost:8000/api` dan diabaikan Git. `.env.example` merupakan contoh yang dapat dilacak. Nilai `VITE_*` masuk ke bundle browser: gunakan hanya konfigurasi publik, tanpa password/token rahasia. Restart Vite setelah mengubah environment.

Dashboard membaca tujuh endpoint GET pada tabel API di atas. Kode `BDG-IBR-ADJ-01` dipilih dari daftar simpang, kemudian ID respons dipakai untuk detail, arah/lajur, kamera, status sistem, dan fase. Axios yang sudah tersedia memberi timeout 5 detik per request.

Tombol **Refresh Status** mengambil ulang seluruh konfigurasi. Polling health berjalan 15 detik setelah request sebelumnya selesai, tanpa request tumpang tindih; timer dan request dibatalkan saat dashboard ditutup. Jika health gagal, konfigurasi terakhir tetap tersedia, sedangkan mode, fase aktif, AI, dan kamera diberi label standby/belum terverifikasi. Polling berikutnya mencoba memuat ulang konfigurasi agar dapat pulih; refresh manual juga tersedia.

Nama/durasi fase dari API merupakan konfigurasi prototype. Nilai tersebut tidak mengubah timing, geometri, animasi kendaraan, atau lampu simulator lokal. `UNCONFIGURED`, AI/CCTV `false`, dan stream kosong tetap merupakan status API. Mulai Tahap 3.5, kartu CCTV secara terpisah menampilkan rekaman lokal/offline dengan status pemutaran browser, tanpa mengubah status kamera fisik pada API.

Verifikasi (backend lokal perlu aktif untuk tes integrasi):

```powershell
npm run build
node --test src/composables/useDashboardConfiguration.test.js src/simulation/intersectionSimulator.test.js
```

Tes integrasi menggunakan respons Laravel nyata dan menyuntikkan kegagalan hanya pada klien pengujian. Untuk uji browser manual, buka DevTools → Network request blocking, blokir `*localhost:8000/api/*`, lalu klik **Refresh Status**. Pesan offline harus muncul dan simulator tetap dapat dijalankan. Hapus pemblokiran lalu klik refresh untuk memulihkan status online. Tidak perlu mematikan backend atau mengubah database.
