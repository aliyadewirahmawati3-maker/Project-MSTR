# Mode zona antrean video lokal

`SINGLE_QUEUE` menggunakan satu polygon `queue` per arah. `DUAL_LANE` tetap
menggunakan polygon `outer` dan `inner`. Konfigurasi lama tanpa `lane_mode`
tetap dibaca sebagai `DUAL_LANE`; polygon lama tidak digabung otomatis karena
cakupan antrean utama harus dikalibrasi pada rekaman yang digunakan.

Untuk video satu zona: pilih video, buka **Kalibrasi zona**, pilih **Satu zona
antrean**, geser titik polygon **Antrean** mengikuti area antrean utama,
pilih **Simpan kalibrasi lokal**, lalu **Gunakan untuk video ini**. Polygon
awal adalah kandidat dari profile, bukan bukti kalibrasi video baru. Kalibrasi
sesi hilang saat sumber diganti atau halaman dimuat ulang.
Kalibrasi baru pada kartu video lokal dimulai dengan satu zona antrean;
pilihan **Dua lajur** tetap tersedia. Mengedit kalibrasi yang sudah diterapkan
mempertahankan mode yang dipilih sebelumnya.

Untuk profile permanen di `config/cctv/queue_zones.json`, isi camera
`lane_mode: "SINGLE_QUEUE"` dan tepat satu zona dengan
`zone_id: "<camera_code>-queue"`, `lane_type: "queue"`,
`movement_rules: "QUEUE"`, dan polygon koordinat normalisasi 0..1 yang telah
dikalibrasi manual. Metadata sumber, identitas kamera, dan aturan validasi
polygon tetap berlaku. Untuk `DUAL_LANE`, dua zona lama tetap digunakan.

YOLO menerima seluruh frame. Penghitungan memakai bottom-center bbox pada
polygon aktif, termasuk batas polygon. Bbox di luar polygon tetap tersedia
sebagai deteksi umum. Pada dua lajur, bbox yang masuk kedua polygon tidak
dihitung karena ambigu.

Respons frame dan `GET /local-video/queue-summary` menyertakan `lane_mode`,
`queue_count`, `outer_lane_queue`, `inner_lane_queue`, `total_queue`, `status`,
dan `note`. Pada satu zona, `total_queue = queue_count`, `outer_lane_queue`
adalah alias kompatibilitas, dan `inner_lane_queue = null` karena tidak ada
zona dalam. Data belum diukur, gagal, atau kedaluwarsa tetap null. Semua
polygon aktif, termasuk hasil kalibrasi kedua mode, dikirim sebagai
`active_zones: [{lane_type, polygon}]` dan `lane_mode` pada header JSON
`X-Frame-Metadata` di `POST /local-video/detect-frame`. Polygon memakai
koordinat original frame yang dinormalisasi, bukan koordinat layar.
AI service memvalidasi dan memakai polygon tersebut; polygon invalid atau
belum dikonfirmasi tidak diganti diam-diam dengan profile default.
`queue_polygon` lama tetap diterima untuk kompatibilitas satu zona.
Browser memakai hitungan respons AI service tanpa menghitung ulang bbox.

Setiap deteksi memiliki `in_queue_zone` dan `lane_zone`. Bottom-center yang
masuk satu polygon memiliki nilai true dan `queue`, `outer`, atau `inner`.
Deteksi di luar zona, ambigu, atau tanpa kalibrasi memiliki false dan null,
serta tidak menambah antrean. Bbox overlap polygon saja tidak cukup.

Frontend menampilkan **Antrean** untuk satu zona dan **Luar/Dalam** untuk dua
lajur. Rekomendasi fase menggunakan `total_queue` valid dari setiap arah;
data parsial atau kedaluwarsa tidak menghasilkan rekomendasi lengkap.
Bbox dalam zona tampil hijau jelas; bbox umum tampil abu-abu tipis secara
default. Pilihan **Bbox luar zona → Sembunyikan** hanya mengubah tampilan,
bukan inference maupun hitungan antrean.

Angka merupakan okupansi kendaraan terdeteksi pada frame terbaru, bukan
tracking, OCR, bukti kendaraan berhenti, atau kontrol ATCS fisik. Mode
estimator/simulator tetap terpisah dan hanya menerima nilai konfigurasi
eksplisit; satu zona memerlukan `queue_count`, bukan penjumlahan fixture
outer/inner lama.
