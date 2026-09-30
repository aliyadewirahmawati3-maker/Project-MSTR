# Tahap 3.6: overlay zona antrean manual

> Mulai Tahap 3.7, pilih rekaman melalui file picker pada setiap kartu sebelum overlay tampil. Konfigurasi polygon tetap sama. Instruksi penyiapan asset dari tahap sebelumnya telah digantikan [alur registrasi lokal Tahap 3.7](stage37-local-video-registration.md), tanpa penyalinan video.

Tahap ini menampilkan delapan polygon konfigurasi pada empat rekaman CCTV lokal/offline. Zona menandai bidang jalan untuk persiapan analisis di tahap berikutnya. Polygon dibuat manual dari frame asli Tahap 3, bukan hasil AI dan bukan pengukuran panjang antrean. Status **Zona konfigurasi siap — menunggu analisis AI** menyatakan konfigurasi telah tervalidasi; tidak berarti analisis AI sedang berjalan.

Tidak ada perubahan pada backend, database, Docker, environment, sumber MP4, kontrol pemutaran HTML5, atau simulator lampu/kendaraan.

## Kamera dan lajur

| Kamera | Arah skenario | Zona luar (`outer`, biru) | Zona dalam (`inner`, oranye) |
| --- | --- | --- | --- |
| CAM-W-01 | Barat | CAM-W-01-outer | CAM-W-01-inner |
| CAM-N-01 | Utara | CAM-N-01-outer | CAM-N-01-inner |
| CAM-E-01 | Timur | CAM-E-01-outer | CAM-E-01-inner |
| CAM-S-01 | Selatan | CAM-S-01-outer | CAM-S-01-inner |

Aturan lajur luar adalah `LEFT_OR_STRAIGHT` (belok kiri / lurus); lajur dalam adalah `STRAIGHT_OR_RIGHT` (lurus / belok kanan). Nama luar/dalam mengikuti anotasi skenario, bukan posisi kiri/kanan layar secara umum. Pada rekaman saat ini, lajur luar terletak di sisi kanan gambar.

Pemetaan arah tetap mengikuti skenario pengguna. Rekaman tidak membuktikan empat pendekat geografis dari simpang yang sama. Utara dan Selatan memiliki sudut pandang hampir sama, sedangkan batas koridor Timur merupakan pendekatan manual karena marka tertutup kondisi padat. Dasar inspeksi dan keterbatasan tiap polygon tersedia di [dokumentasi Tahap 3](stage3-cctv.md).

## Sumber konfigurasi versioned

- [`frontend/src/config/queueZones.js`](../frontend/src/config/queueZones.js): konfigurasi frontend dengan `queueZoneSchemaVersion = 1` dan metode `MANUAL_LOCAL_OFFLINE`.
- [`config/cctv/queue_zones.json`](../config/cctv/queue_zones.json): sumber tunggal koordinat manual, identitas video, dan catatan inspeksi Tahap 3. Modul frontend mengadaptasi JSON ini; tidak ada salinan koordinat lain yang perlu diselaraskan.
- [`frontend/src/utils/queueZones.js`](../frontend/src/utils/queueZones.js): validator polygon, validasi konfigurasi, centroid label, serta geometri `object-fit: contain`.
- [`frontend/src/components/QueueZoneOverlay.vue`](../frontend/src/components/QueueZoneOverlay.vue): rendering SVG tanpa membaca isi piksel video.

Format setiap zona frontend:

```js
{
  id: 'CAM-W-01-outer',
  cameraId: 'CAM-W-01',
  laneType: 'outer',
  label: 'Zona BARAT — lajur luar',
  movementRule: 'LEFT_OR_STRAIGHT',
  movementLabel: 'belok kiri / lurus',
  polygon: [[0.455, 0.43], [0.626, 0.43], [0.58, 0.72], [0.277, 0.72]]
}
```

Konfigurasi divalidasi ketika modul dimuat, lalu dibekukan termasuk setiap titik polygon. Validator menolak field di luar format tersebut agar payload pelacakan, kendaraan, penghitungan, dan analisis tidak dicampur ke konfigurasi zona. Tidak ada data deteksi tiruan.

## Koordinat dan tampilan

Setiap titik adalah `[x, y]` dengan angka finite pada rentang 0–1. Titik asal `(0, 0)` berada di kiri atas frame asli, `(1, 1)` di kanan bawah; x bertambah ke kanan, y ke bawah. Untuk anotasi pixel pada frame lebar W dan tinggi H, gunakan `x = x_pixel / (W - 1)` dan `y = y_pixel / (H - 1)`. Polygon memiliki minimal tiga titik berurutan, tanpa mengulang titik pertama di akhir, tanpa perpotongan sendiri, dan luas lebih besar dari nol.

SVG memakai `viewBox="0 0 1 1"` dan `preserveAspectRatio="none"` di dalam kotak yang persis mengikuti area gambar video. Kotak tersebut dihitung dari ukuran intrinsik video dan `object-fit: contain`; bidang hitam horizontal/vertikal tidak masuk area polygon. `ResizeObserver` memperbarui posisi saat ukuran berubah. Ini bukan crop, warp, atau pengubahan playback.

Isi polygon memiliki opacity 0.12; border 1.5 px memakai `vector-effect="non-scaling-stroke"`. Luar berwarna biru, dalam oranye. Label kecil Luar/Dalam ditempatkan pada centroid polygon. Overlay memiliki `pointer-events: none`, sehingga klik, seek, Play/Pause, dan kontrol video tetap diteruskan ke pemutar. Overlay baru dirender setelah metadata dimensi video tersedia dan disembunyikan ketika video gagal dimuat.

Overlay ditujukan untuk pemutar di dalam kartu. Fullscreen bawaan elemen video/Picture-in-Picture dapat menampilkan video saja tanpa SVG yang merupakan elemen terpisah. Kontrol fullscreen bawaan tidak diganti. Kontrol HTML5 yang sedang muncul dapat menutupi sebagian gambar/zona untuk sementara.

## Menampilkan atau menyembunyikan zona

1. Jalankan frontend seperti pada [Tahap 3.5](stage35-cctv-frontend.md): `npm.cmd --prefix frontend run dev -- --host 127.0.0.1` dari root proyek.
2. Buka `http://127.0.0.1:3000/#live-monitoring` atau port yang dicetak Vite.
3. Zona aktif secara default. Klik **Zona antrean** pada kartu untuk menampilkan/menyembunyikan dua zona kamera tersebut. Tombol menampilkan status Aktif/Nonaktif dan mendukung keyboard serta `aria-pressed`.
4. Legenda Luar biru/Dalam oranye, catatan konfigurasi manual, dan status menunggu analisis tetap tersedia. Toggle tidak memuat ulang, menjeda, atau mereset posisi video. Pengaturan tampil/sembunyi hanya berlaku selama halaman dibuka; reload kembali ke kondisi aktif.

Apabila MP4 belum tersedia, gunakan petunjuk fallback Tahap 3.5. Zona tidak ditampilkan di atas fallback. Setelah **Coba lagi** berhasil memuat video, zona muncul kembali sesuai pilihan toggle.

## Kalibrasi ulang

Normalisasi hanya mengatasi perubahan ukuran tampilan. Polygon lama tidak otomatis tepat jika arah kamera, zoom, crop, rotasi, perspektif, atau isi rekaman berubah.

1. Inspeksi sumber lokal baru yang benar-benar dapat dibaca dan simpan frame referensi. Jangan mengganti polygon dengan perkiraan bila sumber gagal dibuka.
2. Periksa marka, tepi jalan, arah arus, dan bidang aspal secara manual pada beberapa frame. Tentukan ulang batas lajur luar/dalam; catat bagian yang terhalang atau tidak pasti. Tidak ada deteksi otomatis dalam langkah ini.
3. Ubah polygon kamera terkait di `config/cctv/queue_zones.json` menggunakan koordinat normalisasi. Pertahankan empat ID kamera dan tepat satu outer serta satu inner per kamera. Perbarui catatan geometri, frame referensi, metadata, dan SHA256 hanya setelah inspeksi sumber baru selesai. Validator Tahap 3 sengaja menolak hash yang berubah sebelum konfigurasi diperbarui.
4. Jalankan validator/preview Tahap 3 serta tes frontend di bawah. Tinjau overlay terhadap frame asli pada desktop dan mobile. Jangan mengganti koordinat lagi pada modul frontend karena modul tersebut membaca sumber JSON yang sama.
5. Jika sumber MP4 berubah, siapkan ulang asset dengan `npm.cmd --prefix frontend run cctv:prepare`, lalu reload Vite. Untuk preview `dist`, lakukan build ulang. Pergantian file langsung di folder publik dapat membuat polygon tidak sesuai; gunakan alur penyiapan yang memverifikasi hash sumber.

## Privasi dan batas sistem

Semua video adalah rekaman lokal/offline. Tidak ada koneksi CCTV live, upload, inferensi/YOLO, penghitungan kendaraan, tingkat kemacetan, tracking ID, pembacaan plat, pengenalan wajah, atau keputusan kontrol ATCS fisik. Overlay hanya membaca dimensi dan event elemen video; tidak mengekstrak objek maupun identitas.

Konfigurasi frontend tidak menyimpan path Windows pribadi, kredensial, atau data individu. MP4 dan `.env.cctv.local` tetap diabaikan Git sebagaimana Tahap 3.5. Gambar pada rekaman asli tetap terlihat saat diputar; tahap ini tidak melakukan anonimisasi/blur otomatis. Rekaman dan build yang menyertakannya tetap digunakan sebagai demo lokal. Aturan belok adalah label skenario dan bukan validasi aturan lalu lintas di lokasi sumber.

## Validasi dan pengujian

Dari root proyek:

```powershell
npm.cmd --prefix frontend run test:zones
py -3.13 -m unittest discover -s tests -p 'test_stage3_*.py' -v
node --test frontend/src/composables/useDashboardConfiguration.test.js frontend/src/simulation/intersectionSimulator.test.js
npm.cmd --prefix frontend run build
```

Tes frontend yang sudah ada menggunakan API lokal untuk bagian integrasi. Tes zona berjalan mandiri pada Node yang tersedia di proyek (diuji pada Node 24), tanpa video atau backend. Sembilan tes zona mencakup delapan zona/dua per kamera, kesesuaian koordinat sumber Tahap 3, aturan lajur, rentang 0–1, bentuk polygon, penolakan field analisis, immutability, centroid, dan letterboxing.

Hasil pelaksanaan: 9 tes zona, 7 tes Tahap 3, dan 25 tes frontend yang sudah ada lulus; build Vite berhasil. Uji browser Edge memverifikasi delapan polygon, toggle independen tanpa reset video, klik yang diteruskan ke Play/Pause HTML5, keselarasan desktop/mobile dan dua jenis letterboxing, serta pemulihan overlay setelah video gagal lalu dicoba ulang. Screenshot lokal tersedia di `artifacts/stage3/stage36-zones-desktop.png` dan `artifacts/stage3/stage36-zones-mobile.png` (ignored Git).
