# Tahap 3.7: registrasi rekaman offline melalui browser

Empat kartu kamera menerima rekaman pilihan pengguna dari file picker browser. Registrasi ini hanya berlaku di memori halaman saat ini. Aplikasi tidak membaca folder Windows secara otomatis, tidak memakai path absolut atau `file://`, tidak memindahkan/menyalin file video, dan tidak mengunggahnya. Tidak ada perubahan pada backend, database, Docker, AI service, API, atau simulator.

## Menggunakan dashboard

Dari root proyek di PowerShell:

```powershell
npm.cmd --prefix frontend run dev -- --host 127.0.0.1
```

Buka `http://127.0.0.1:3000/#live-monitoring` (ikuti port Vite jika berbeda), kemudian:

| Kartu | Kamera | Pilihan pengguna |
| --- | --- | --- |
| Barat | CAM-W-01 | Klik **Pilih video lokal**, pilih rekaman Barat |
| Utara | CAM-N-01 | Klik **Pilih video lokal**, pilih rekaman Utara |
| Timur | CAM-E-01 | Klik **Pilih video lokal**, pilih rekaman Timur |
| Selatan | CAM-S-01 | Klik **Pilih video lokal**, pilih rekaman Selatan |

Pengguna membuka folder tempat rekaman disimpan melalui dialog sistem, misalnya folder `cctv-offline` di laptop. Folder tidak harus bernama tertentu. Aplikasi tidak menebak lokasi file, tidak membaca `.env.cctv.local`, dan tidak memuat asset `/cctv-local/` secara otomatis.

Setelah frame berhasil dimuat, kartu menampilkan nama file yang dipilih, resolusi intrinsik video, durasi, serta **Rekaman lokal siap — menunggu analisis AI**. Status ini hanya menyatakan rekaman dapat dibaca, bukan bahwa analisis AI sedang berjalan. Status pemutaran (memutar, dijeda, buffer, atau perlu menekan Putar) ditampilkan terpisah. Video tetap muted, playsinline, loop, autoplay bila browser mengizinkan, dengan kontrol HTML5.

**Ganti video** membuka picker untuk kartu tersebut. Membatalkan dialog atau memilih file dengan tipe tidak valid mempertahankan rekaman sebelumnya. **Hapus video** melepaskan pilihan hanya pada kartu itu dan menghapus metadata tampilannya; file asli di perangkat tidak dihapus. **Coba lagi** mencoba membaca kembali File yang sama setelah error. File yang sama juga bisa dipilih ulang.

Browser tidak memberikan akses permanen ke file melalui input ini. Aplikasi tidak menyimpan File, object URL, atau registrasi dalam localStorage/IndexedDB. Setelah refresh, navigasi keluar, atau tab ditutup, pengguna perlu memilih ulang rekaman. Nama file yang tampil bukan path absolut dan tidak memberikan akses ke folder lain.

## Validasi file dan siklus hidup URL

- Picker membatasi pilihan ke MP4/M4V, WebM, OGV/OGG, dan MOV. Ketersediaan codec tetap bergantung pada browser/OS.
- Utility memeriksa ekstensi, MIME bila tersedia, ukuran bukan nol, serta `HTMLMediaElement.canPlayType`. MIME kosong atau `application/octet-stream` memakai perkiraan MIME berdasarkan ekstensi. MOV hanya diterima bila browser menyatakan dukungan.
- Ekstensi dan MIME tidak membuktikan bahwa isi file valid. Event metadata/frame dan error decoder menjadi pemeriksaan berikutnya. Video kosong/rusak, codec tidak didukung, atau resolusi/durasi tidak valid mendapat pesan error. Durasi tidak diketahui/nonfinite tidak ditampilkan sebagai angka yang dibuat-buat.
- Pemutar baru dinyatakan siap setelah dimensi/durasi valid dan frame dapat dibaca. Penolakan autoplay tidak menjadikan rekaman gagal; kontrol **Putar** tetap tersedia.
- `URL.createObjectURL(File)` menghasilkan URL `blob:` untuk membaca file yang dipilih dalam konteks browser. Ini bukan upload dan bukan salinan MP4 baru di filesystem.
- URL lama dilepas dengan `URL.revokeObjectURL` saat ganti, hapus, retry, atau unmount. Nomor versi pemilihan mengabaikan event/promise lama agar error dari rekaman sebelumnya tidak merusak status rekaman baru.

Tidak ada penyimpanan permanen baru, request POST/PUT/PATCH untuk file, pengiriman File ke API, atau pengiriman isi video ke layanan eksternal. Request API konfigurasi dashboard yang sudah ada tetap berjalan seperti sebelumnya.

## Overlay zona

`frontend/src/config/queueZones.js` tetap menjadi konfigurasi frontend yang terlacak Git, dengan koordinat manual dari sumber JSON Tahap 3. Delapan polygon tidak berubah. Luar biru = belok kiri/lurus; dalam oranye = lurus/belok kanan. Toggle **Zona antrean** independen per kamera dan tetap mempertahankan posisi playback.

Overlay menggunakan dimensi video terpilih dan area `object-fit: contain`, sehingga ukuran tampilan dan letterboxing tidak menggeser koordinat. `pointer-events: none` mempertahankan akses ke kontrol native. Overlay tidak tampil pada kartu kosong/gagal. Fullscreen native/Picture-in-Picture dapat menampilkan video tanpa SVG yang berada di luar elemen video.

Pemilihan file pada suatu kartu merupakan keputusan pengguna, bukan hasil identifikasi kamera otomatis. Nama file, ukuran, atau resolusi yang cocok tidak membuktikan sudut kamera cocok. Jika rekaman, crop, zoom, rotasi, atau perspektif berubah, periksa dan kalibrasi ulang polygon secara manual sesuai [panduan Tahap 3.6](stage36-queue-zones.md). Tidak ada kalibrasi AI, inferensi, atau pengecekan isi visual otomatis pada tahap ini.

## Build tanpa MP4

```powershell
npm.cmd --prefix frontend run build
npm.cmd --prefix frontend run preview -- --host 127.0.0.1 --port 3001
```

Buka `http://127.0.0.1:3001/#live-monitoring`, kemudian pilih file lagi melalui kartu. Build menonaktifkan `copyPublicDir`; hanya favicon publik yang secara eksplisit disertakan bersama HTML/JS/CSS. MP4 lama dari `frontend/public/cctv-local/` tidak masuk build. Salinan asset historis yang mungkin masih ada tidak dipakai pemutar dan tidak perlu dipindahkan untuk menggunakan Tahap 3.7.

Command npm `cctv:prepare` dihapus karena alur sekarang tidak memerlukan penyalinan. Jangan menjalankan tool penyalin dari dokumentasi historis Tahap 3.5 untuk tahap ini. Folder sumber pengguna tetap berada di luar repository. File MP4 dan environment lokal tetap diabaikan Git.

## Pengujian

Dari root proyek:

```powershell
npm.cmd --prefix frontend run test:local-video
npm.cmd --prefix frontend run test:zones
node --test frontend/src/composables/useDashboardConfiguration.test.js frontend/src/simulation/intersectionSimulator.test.js
npm.cmd --prefix frontend run build
```

Sebelas tes registrasi mencakup validasi file, metadata/status, pembatalan picker, penggantian file, pembersihan object URL, event lama, retry, autoplay ditolak, hapus/dispose, serta isolasi antarkamera. Sembilan tes zona dan 25 tes frontend yang sudah ada juga lulus. Tes integrasi dashboard memakai API lokal yang sudah berjalan.

Uji browser Edge memakai empat rekaman asli yang tersedia di luar repository melalui file picker, tanpa penyalinan. Uji ini memverifikasi metadata, delapan polygon, file invalid/rusak, retry/ganti/hapus, kontrol native, toggle independen, mobile, serta reset registrasi setelah refresh. Tidak ada request upload atau request asset MP4 lama. Screenshot lokal hasil pengujian ada di `artifacts/stage3/stage37-picker-desktop.png` (ignored Git). Build berhasil dan hasilnya tidak mengandung MP4.

## Batas sistem dan privasi

Semua pemutaran merupakan rekaman lokal/offline; tidak ada CCTV live. Tidak ada YOLO/inferensi, penghitungan kendaraan/kemacetan, tracking ID, pembacaan plat, pengenalan wajah, hasil AI palsu, atau koneksi ATCS fisik. Data yang ditampilkan hanya metadata file/media dan konfigurasi polygon manual. Rekaman asli tidak dianonimkan otomatis; isi gambar tetap terlihat pada perangkat pengguna saat diputar. Tidak ada commit atau push.
