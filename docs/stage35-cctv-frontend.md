# Tahap 3.5: pemutar rekaman CCTV lokal di dashboard

> Catatan historis: Tahap 3.7 menggantikan mekanisme salinan asset dengan file picker browser. Command npm `cctv:prepare` telah dihapus. Jangan menjalankan alur penyalinan pada dokumen ini untuk Tahap 3.7; gunakan [panduan registrasi lokal terbaru](stage37-local-video-registration.md). Tool Python lama bukan bagian dari alur pemutar saat ini.

Panel **Live Monitoring CCTV — 4 Arah** mempertahankan grid, kartu, rasio gambar, dan informasi lajur dashboard. Keempat kartu menampilkan video HTML5 berlabel **REKAMAN LOKAL / OFFLINE DEMO**. Ini pemutaran rekaman, bukan CCTV live; tidak ada inferensi/deteksi atau penghitungan kendaraan, tracking ID, OCR plat, pengenalan wajah, heuristik, atau koneksi ATCS. Backend, database, Docker, dan simulator tidak diubah.

## Menyiapkan video

Prasyarat: Node/npm frontend tersedia, Python 3.13 dapat dipanggil dengan `py -3.13`, dan empat path absolut dalam `.env.cctv.local` menunjuk sumber Tahap 3. Script penyiapan hanya memakai standard library Python; OpenCV hanya diperlukan untuk validator Tahap 3.

Dari root proyek di PowerShell:

```powershell
npm.cmd --prefix frontend run cctv:prepare
```

Perintah ini menjalankan `py -3.13 ../tools/cctv/prepare_frontend.py` dari folder frontend. Alternatif langsung dari root:

```powershell
py -3.13 tools/cctv/prepare_frontend.py
```

Script membaca `.env.cctv.local` dan `config/cctv/queue_zones.json`, memvalidasi pemetaan/zona serta hash SHA256 keempat sumber sebelum menulis salinan publik. Empat salinan sementara diverifikasi kembali sebelum menggantikan file tujuan. Jika sumber hilang atau hash berbeda, proses gagal dengan identitas kamera dan salinan publik sebelumnya tidak diperbarui. Jika file tujuan sedang dikunci aplikasi lain, tutup pemutar tersebut lalu ulangi command. Penyalinan tidak memindahkan atau mengubah MP4 asli.

| Arah | Kamera | Variabel sumber lokal | Asset browser |
| --- | --- | --- | --- |
| Barat | CAM-W-01 | `SIGAP_VIDEO_WEST` | `/cctv-local/CAM-W-01.mp4` |
| Utara | CAM-N-01 | `SIGAP_VIDEO_NORTH` | `/cctv-local/CAM-N-01.mp4` |
| Timur | CAM-E-01 | `SIGAP_VIDEO_EAST` | `/cctv-local/CAM-E-01.mp4` |
| Selatan | CAM-S-01 | `SIGAP_VIDEO_SOUTH` | `/cctv-local/CAM-S-01.mp4` |

Output fisik berada di `frontend/public/cctv-local/`. Seluruh folder tersebut dan semua MP4 diabaikan Git. Browser menerima URL HTTP dari Vite, tidak menerima path Windows, isi environment, atau `file://`. Script menolak pengalihan folder tujuan melalui symlink/junction dan memverifikasi salinan sesuai identitas sumber Tahap 3. Tidak ada proses upload.

## Menjalankan dashboard

Dari root proyek:

```powershell
npm.cmd --prefix frontend run dev -- --host 127.0.0.1
```

Buka `http://127.0.0.1:3000/#live-monitoring` (ikuti port yang dicetak Vite bila port 3000 terpakai). Jika menjalankan dari folder frontend, gunakan `npm.cmd run dev -- --host 127.0.0.1`. Tidak perlu menyalakan ulang backend atau mengubah database untuk menampilkan video.

Verifikasi keempat kartu Barat, Utara, Timur, Selatan menampilkan gambar bergerak dan kode kamera yang tepat. Video memakai `muted`, `playsinline`, `loop`, `autoplay`, dan kontrol bawaan browser. Jika autoplay ditolak, status menunjukkan rekaman tersedia dan pengguna dapat menekan **Putar**. Status jeda/buffering mengikuti event media, bukan status API. Keempat rekaman tidak disinkronkan dan tidak diklaim mewakili waktu kejadian yang sama.

Informasi lajur di setiap kartu berasal dari zona Tahap 3: lajur luar = belok kiri/lurus; lajur dalam = lurus/belok kanan. Panel tetap berfungsi ketika API tidak tersedia. Status CCTV pada bagian kesehatan service dashboard tetap melaporkan kondisi API; status itu tidak menentukan ketersediaan pemutar demo. Kamera fisik pada backend tetap `UNCONFIGURED` dan stream kosong.

Jika asset belum disiapkan, tidak dapat diakses, atau gagal didekode, kartu menampilkan fallback beserta command penyiapan dan tombol **Coba lagi**. Setelah command berhasil, klik tombol tersebut atau reload halaman. Pada mode preview build, lakukan build ulang dahulu. Untuk kegagalan decode, gunakan browser dengan dukungan H.264, misalnya Edge yang telah diuji pada mesin kerja. Fallback tidak mengubah status sumber menjadi live/sehat.

## Build dan preview hasil build

Dari root proyek:

```powershell
npm.cmd --prefix frontend run cctv:prepare
Set-Location frontend
npm.cmd run build
npm.cmd run preview -- --host 127.0.0.1 --port 3001
```

Buka `http://127.0.0.1:3001/#live-monitoring`. Vite menyalin asset publik ke `frontend/dist/cctv-local/`; lakukan penyiapan sebelum build. Build tetap dapat berhasil tanpa video, tetapi dashboard akan menampilkan fallback. `dist/` diabaikan Git dan hasil build yang berisi MP4 ditujukan untuk preview lokal ini. Tidak ada penyalinan otomatis ke layanan eksternal.

## Pemeriksaan yang dilakukan

Dari root proyek:

```powershell
.\.venv-stage3\Scripts\python.exe tools/cctv/stage3.py validate --full-decode
py -3.13 -m unittest discover -s tests -p 'test_stage3_*.py' -v
Set-Location frontend
node --test src/composables/useDashboardConfiguration.test.js src/simulation/intersectionSimulator.test.js
npm.cmd run build
```

Hasil pelaksanaan: empat video terbaca sampai akhir, empat pemetaan dan delapan zona valid, tujuh tes Tahap 3 lulus, 25 tes frontend yang sudah ada lulus, dan build Vite berhasil. Uji browser Edge headless memverifikasi empat MP4 H.264 asli dapat diputar, pemetaan URL benar, delapan informasi lajur tersedia, fallback saat satu asset hilang, pemulihan melalui Coba lagi, pemutaran saat API diblokir, serta penanganan penolakan autoplay yang disimulasikan. Viewport mobile juga diperiksa tanpa overflow horizontal.

Screenshot lokal tersedia di `artifacts/stage3/cctv-dashboard-desktop.png`, `cctv-dashboard-fallback.png`, dan `cctv-dashboard-mobile.png`. Asset dan screenshot tetap diabaikan Git. Tidak ada commit atau push.
