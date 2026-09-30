# Tahap 3: rekaman CCTV lokal dan zona antrean

Seluruh sumber adalah **rekaman lokal/offline**, bukan CCTV live. Inspeksi dilakukan pada 30 September 2026 dengan membaca empat MP4 yang tersedia di folder sumber lokal. Nama sumber di bawah merupakan nama berkas sebenarnya: tidak ada subfolder `CCTV SIANG JL NORMAL` maupun `CCTV SIANG JL PADAT AMBULANS`.

Pekerjaan ini hanya menyiapkan metadata, pemetaan, polygon manual, dan preview. Backend, database, FastAPI yang sedang berjalan, dashboard, dan simulator tidak diubah. Tidak ada deteksi/inferensi, YOLO, pelatihan, penghitungan kendaraan, tracking ID, OCR, pengenalan wajah, data deteksi tiruan, keputusan heuristik, kontrol fase, fitur EVP, atau koneksi ATCS fisik.

## Inventaris sumber

| Kamera | Pemetaan arah | Nama MP4 lokal | Format / codec | Resolusi | FPS nominal | Durasi video (detik) | Frame video | Ukuran (byte) | Frame preview |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CAM-W-01 | BARAT / WEST | `CCTV SIANG JL NORMAL_BARAT.mp4` | MP4 (ISO BMFF, isom) / H.264 | 1920×1080 | 30 | 27.066666 | 812 | 30288755 | 5 s, indeks 150 |
| CAM-N-01 | UTARA / NORTH | `CCTV SIANG JL NORMAL_UTARA.mp4` | MP4 (ISO BMFF, isom) / H.264 | 1920×1080 | 30 | 25.000000 | 750 | 29947978 | 10 s, indeks 300 |
| CAM-E-01 | TIMUR / EAST | `CCTV SIANG JL PADAT AMBULANS_TIMUR.mp4` | MP4 (ISO BMFF, isom) / H.264 | 1920×1080 | 30 | 25.066666 | 752 | 30087170 | 10 s, indeks 300 |
| CAM-S-01 | SELATAN / SOUTH | `CCTV SIANG JL NORMAL_SELATAN.mp4` | MP4 (ISO BMFF, isom) / H.264 | 1920×1080 | 30 | 25.033333 | 751 | 30010987 | 5 s, indeks 150 |

OpenCV melaporkan FPS mentah berturut-turut 30.000000738916274, 30.0, 30.00000079787236, dan 30.000000399467382. Durasi di atas dihitung dari jumlah frame video / FPS nominal pembaca, bukan dari jam yang tercetak dalam gambar atau durasi audio. Angka frame adalah metadata video, bukan jumlah kendaraan. Pembacaan berurutan seluruh frame berhasil untuk keempat sumber. Header `ftyp` MP4 serta hash SHA256 juga diperiksa; nilai hash sumber tersimpan dalam konfigurasi zona.

Timur dipetakan ke skenario `PADAT_AMBULANS_EVP_VISUAL_ONLY` sesuai sumber yang diminta. Label ini hanya menyatakan skenario visual; tidak ada detektor ambulans, event EVP, atau perubahan lampu.

## Makna pemetaan dan dasar polygon

Pemetaan arah mengikuti penamaan skenario yang diminta pengguna. Tulisan lokasi yang terlihat pada frame Barat menyebut Sukajadi–Setiabudhi; Utara/Selatan menyebut Sukajadi–Depan PVJ, arah Pasopati; Timur menyebut Pasteur–Pasopati. Ini tidak membuktikan bahwa rekaman berasal dari empat pendekat simpang Ibrahim Adjie. Utara dan Selatan merupakan berkas berbeda dengan hash berbeda, tetapi sudut pandang hampir sama. Tidak ada klaim sinkronisasi waktu antarvideo.

Setiap sumber diperiksa secara visual pada detik 5 dan 10. Polygon diletakkan pada bidang aspal dengan mempertimbangkan marka, tepi jalan, perspektif, dan bagian jalan yang terlihat pada frame tersebut. Polygon adalah ROI persiapan zona antrean; panjang antrean dan garis henti fisik belum dikalibrasi. Batas polygon bukan hasil pengukuran lapangan. Aturan gerakan merupakan label lajur proyek, bukan hasil verifikasi aturan belok lokasi rekaman.

| Kamera | Dasar penempatan | Keterbatasan |
| --- | --- | --- |
| CAM-W-01 | Dua bidang di kedua sisi marka putus-putus, antara y=0.43–0.72; outer di kanan gambar menuju tepi kuning, inner di kiri | Tidak meliputi seluruh jalan; trotoar, parkir kanan, dan teks bawah dikeluarkan |
| CAM-N-01 | Pemisah mengikuti marka diagonal ke kanan bawah, y=0.46–0.80; frame 10 s lebih terbuka | Truk menutup jalan pada frame 5 s; akses samping kanan atas tidak dicakup |
| CAM-E-01 | Dua koridor paling kanan pada arus mendekati kamera, y=0.47–0.86; outer menuju sisi vegetasi | Marka/aspal tertutup kondisi padat; pemisah merupakan pendekatan manual perspektif. Koridor tambahan dekat median kiri tidak dicakup |
| CAM-S-01 | Diperiksa pada video Selatan sendiri; marka diagonal dan tepi aspal kiri, y=0.46–0.80 | Sudut pandang hampir sama dengan Utara; tidak membuktikan pendekat geografis yang berbeda |

`outer` dipilih di sisi kanan gambar untuk arus mendekati kamera (sisi kiri pengemudi); `inner` di sebelah kirinya. Dua zona ini adalah pemetaan lajur skenario, bukan klaim bahwa setiap jalan sumber mempunyai tepat dua lajur fisik. Batas antar-ROI boleh berbagi garis, tetapi tidak dimaksudkan saling menumpuk areanya.

## Konfigurasi tanpa path pribadi

- Template environment: [`.env.cctv.example`](../.env.cctv.example), dengan empat nilai kosong.
- Environment lokal: `.env.cctv.local`, sudah diisi pada mesin kerja dan diabaikan Git. File ini terpisah dari `.env` service yang sudah berjalan.
- Polygon dan pemetaan: [`config/cctv/queue_zones.json`](../config/cctv/queue_zones.json).
- Loader/validator/preview: [`tools/cctv/stage3.py`](../tools/cctv/stage3.py).
- Dependency alat terisolasi: [`tools/cctv/requirements.txt`](../tools/cctv/requirements.txt).
- Tes kontrak: [`tests/test_stage3_cctv.py`](../tests/test_stage3_cctv.py).

Environment menggunakan `SIGAP_VIDEO_WEST`, `SIGAP_VIDEO_NORTH`, `SIGAP_VIDEO_EAST`, dan `SIGAP_VIDEO_SOUTH`. Isi masing-masing dengan path absolut MP4 di luar repository. Parser membaca file yang ditentukan `--env-file`; environment proses tidak menimpanya. Kutip tunggal/ganda didukung, backslash dibaca literal, tidak ada ekspansi variabel atau perintah shell. URL stream, path relatif, dan path jaringan UNC ditolak.

Repository tidak menyimpan path pribadi. Pada Tahap 3, MP4 tetap di folder sumber tanpa disalin, dipindahkan, ditambahkan ke Git, atau diunggah. `.gitignore` juga mengecualikan `*.mp4` (termasuk variasi kapital), `.venv-stage3/`, hasil `artifacts/stage3/`, dan cache Python alat/tes. Tahap 3.5 menambahkan penyalinan lokal yang secara khusus diminta untuk pemutaran browser ke folder ignored `frontend/public/cctv-local/`; lihat [panduan Tahap 3.5](stage35-cctv-frontend.md). Sumber asli tetap di tempatnya.

JSON menggunakan `schema_version: 1` dan menyimpan tepat empat kamera dengan masing-masing dua zona:

| `lane_type` | `movement_rules` |
| --- | --- |
| `outer` | `LEFT_OR_STRAIGHT` |
| `inner` | `STRAIGHT_OR_RIGHT` |

Setiap polygon berupa daftar `[x, y]` dengan nilai 0–1; titik asal kiri atas, x ke kanan, y ke bawah. Daftar titik tidak mengulang titik pertama di akhir. Konversi ke frame asli: `x_px = round(x * (width - 1))`, `y_px = round(y * (height - 1))`. Gunakan ukuran frame video asli, bukan ukuran preview yang ditambahi pita keterangan. Jangan menerapkan koordinat langsung pada gambar yang sudah di-crop atau diberi letterbox tanpa transformasi yang sesuai.

`load_zones(path)` memakai standard library Python saja, mengembalikan dictionary tervalidasi, dan tidak membuka video atau menginisialisasi service. JSON dapat dibaca FastAPI pada Tahap 4; integrasi endpoint/startup tidak dikerjakan pada tahap ini. Metadata harapan dan SHA256 mengikat polygon ke video yang telah diperiksa. Jika isi video berubah, validator menolak sumber sampai frame baru diinspeksi dan konfigurasi dikalibrasi ulang.

## Menjalankan ulang di PowerShell

Dari root proyek, persiapan pada mesin baru:

```powershell
py -3.13 -m venv .venv-stage3
.\.venv-stage3\Scripts\python.exe -m pip install -r tools/cctv/requirements.txt
if (!(Test-Path .env.cctv.local)) { Copy-Item .env.cctv.example .env.cctv.local }
```

Isi keempat path lokal dalam `.env.cctv.local` sebelum menjalankan validator. Pada mesin kerja saat ini environment dan dependency alat sudah disiapkan. Tidak perlu mengaktifkan virtualenv atau mengubah execution policy.

```powershell
# Metadata, hash sumber, 8 polygon, dan pembacaan seluruh frame video
.\.venv-stage3\Scripts\python.exe tools/cctv/stage3.py validate --full-decode

# Frame asli dan overlay untuk keempat kamera
.\.venv-stage3\Scripts\python.exe tools/cctv/stage3.py preview

# Tes konfigurasi tanpa video, OpenCV, atau backend
py -3.13 -m unittest discover -s tests -p 'test_stage3_*.py' -v

git status --short --untracked-files=all
git check-ignore -v .env.cctv.local artifacts/stage3/CAM-W-01_overlay.jpg
```

Tanpa `--full-decode`, validator dan preview membaca sampel awal, frame referensi, tengah, dan akhir setiap video. `--full-decode` membaca semua frame secara berurutan, tanpa menganalisis objek apa pun. Opsi `--config`, `--env-file`, dan `--output` menerima path alternatif; gunakan direktori output yang juga diabaikan Git.

Jika sumber hilang/tidak terbaca, hash atau metadata berubah, atau konfigurasi tidak valid, proses mengembalikan exit code 1 dengan identitas kamera/berkas. Semua sumber divalidasi sebelum laporan dan preview baru dibuat. Artefak lama mungkin masih ada setelah kegagalan; keberadaan gambar lama bukan bukti run terbaru berhasil. Tidak ada polygon pengganti otomatis.

## Artefak dan hasil validasi

| Kamera | Frame asli lokal | Overlay lokal |
| --- | --- | --- |
| CAM-W-01 | `artifacts/stage3/CAM-W-01_frame.jpg` | `artifacts/stage3/CAM-W-01_overlay.jpg` |
| CAM-N-01 | `artifacts/stage3/CAM-N-01_frame.jpg` | `artifacts/stage3/CAM-N-01_overlay.jpg` |
| CAM-E-01 | `artifacts/stage3/CAM-E-01_frame.jpg` | `artifacts/stage3/CAM-E-01_overlay.jpg` |
| CAM-S-01 | `artifacts/stage3/CAM-S-01_frame.jpg` | `artifacts/stage3/CAM-S-01_overlay.jpg` |

Preview memakai hijau untuk outer dan biru untuk inner, label lajur di dalam polygon, serta kode kamera, arah, waktu frame, aturan gerakan, dan status LOCAL/OFFLINE pada pita bawah. Frame asli 1920×1080; preview dengan pita keterangan 1920×1260. Keempat overlay telah diperiksa secara visual.

Laporan mesin tersedia di `artifacts/stage3/validate_report.json` dan `artifacts/stage3/preview_report.json`. Laporan mencatat identitas sumber, metadata, mode pembacaan, indeks frame referensi, serta hash konfigurasi tanpa path video pribadi.

Hasil pelaksanaan: 4/4 sumber berhasil dibaca sampai akhir; 4/4 pemetaan kamera valid; tepat 8 zona valid dengan koordinat 0–1; 4 frame asli dan 4 overlay tersedia; 7 tes konfigurasi lulus. `git status` tidak menampilkan MP4 maupun environment lokal. Tidak ada commit atau push.
