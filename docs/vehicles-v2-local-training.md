# Dataset kendaraan v2: persiapan dan training lokal SIGAP

Dataset `vehicles.v2-release.yolo26.zip` sudah diaudit dan disiapkan untuk **YOLOv13-N lokal yang terpasang di SIGAP**. Nama ekspor `yolo26` tidak menentukan arsitektur weights: label ZIP memakai format bounding box `class x_center y_center width height` normalized yang dapat dibaca loader YOLOv13 ini. ZIP tidak menyertakan model `.pt`.

Rujukan format: [Ultralytics YOLO detection datasets](https://docs.ultralytics.com/datasets/detect/). Implementasi runtime tetap fork iMoonLab yang sudah dipin di Dockerfile; jangan menggantinya dengan `pip install ultralytics` terbaru hanya karena nama ZIP.

## Hasil audit

Sumber: [RF100 vehicles, versi 2](https://universe.roboflow.com/roboflow-100/vehicles-q0x2v/dataset/2). Lisensi dari metadata ZIP: **CC BY 4.0**. Pembuat asal yang tercatat: Yudha Bhakti Nugraha dan Kris. README atribusi disalin bersama dataset.

SHA256 ZIP: `08995252e68d56507b22c98cd8c8df29926c1d4ac3bd1d070c1741c6099560ec`.

| Pembagian ekspor asli | Gambar | Kotak asli | Kotak setelah normalisasi | Label kosong |
| --- | ---: | ---: | ---: | ---: |
| Train | 2.634 | 31.905 | 31.903 | 1 |
| Validasi | 966 | 13.450 | 13.450 | 3 |
| Test | 458 | 6.222 | 6.222 | 4 |
| Total | **4.058** | **51.577** | **51.575** | **8** |

Seluruh gambar dapat didekode, pasangan gambar/label lengkap, dan koordinat kotak valid. Dua kotak identik di train dihapus dari salinan hasil normalisasi. Tidak ditemukan gambar identik berdasarkan SHA256 atau nama frame sumber yang sama lintas split. Pemeriksaan ini tidak membuktikan seluruh objek telah dianotasi atau menyingkirkan frame yang hampir sama.

Inspeksi visual menemukan kendaraan pada contoh yang labelnya kosong, termasuk `adit_mp4-1279_jpg` (banyak kendaraan jelas terlihat) dan `malam_04112021_mp4-330_jpg` (kendaraan/lampu di kejauhan). Karena itu delapan gambar berlabel kosong dikeluarkan dari daftar input training/evaluasi sampai dianotasi ulang. File sumber tetap disimpan; daftar pengecualian ditulis ke `data-selection.json` setiap run. Setelah pembagian per video, kedelapan contoh berada di train, sehingga input efektif adalah **2.719 train, 684 validasi, 647 test**.

| Kelas SIGAP | Label sumber | Jumlah kotak |
| --- | --- | ---: |
| `car` | `car` | 31.641 |
| `bus` | `big bus`, `small bus`, `bus-l-`, `bus-s-` | 1.625 |
| `truck` | `big truck`, `mid truck`, `small truck`, `truck-l-`, `truck-m-`, `truck-s-`, `truck-xl-` | 18.309 |

Dataset tidak memiliki kelas **motorcycle**, ambulans, atau pemadam. Model tiga kelas tidak boleh diklaim menghitung seluruh jenis kendaraan SIGAP. Kelas bus jauh lebih sedikit; evaluasi harus menampilkan metrik per kelas, tidak hanya angka agregat. Contoh yang diinspeksi memperlihatkan rekaman jalan tol, sehingga performanya pada simpang SIGAP tetap perlu diukur dengan anotasi rekaman simpang.

## Pembagian berdasarkan video sumber

Lima video sumber masing-masing tersebar dalam train, validasi, dan test pada ekspor asli. Frame dari rekaman yang sama berisiko membuat evaluasi terlalu optimistis. Salinan `datasets/vehicles-v2-grouped/` memakai seluruh rekaman sebagai satu kelompok:

| Split baru | Rekaman sumber | Gambar |
| --- | --- | ---: |
| Train | `adit_mp4`, `malam_04112021_mp4`, `siang_15112021_1_mp4` | 2.727 |
| Validasi | `pagi_16112021_mp4` | 684 |
| Test | `aditganteng_mp4` | 647 |

Konfigurasi yang dapat direview: [`config/datasets/vehicles-v2-splits.json`](../config/datasets/vehicles-v2-splits.json). Rekaman berbeda masih mungkin berasal dari kamera yang sama. Tetap sediakan test tambahan dari CCTV SIGAP dan tambahkan anotasi sepeda motor sebelum mengganti model empat kelas.

ZIP asli di Downloads tetap utuh. `datasets/vehicles-v2/` mempertahankan pembagian ekspor dengan label yang dinormalisasi; `datasets/vehicles-v2-grouped/` adalah input training yang disarankan. Kedua direktori dan artifact training diabaikan Git.

## Menyiapkan ulang

Jalankan dari root proyek. Gunakan nama output baru jika direktori sudah ada; script menolak menimpa hasil sebelumnya.

```powershell
$archive = (Resolve-Path -LiteralPath 'C:\Users\Aliya Dewi Rahmawati\Downloads\vehicles.v2-release.yolo26.zip').Path
$datasetDir = Join-Path (Get-Location) 'datasets'
$splitConfigDir = Join-Path (Get-Location) 'config/datasets'
New-Item -ItemType Directory -Force -Path $datasetDir | Out-Null
docker compose run --rm --no-deps --entrypoint python --volume "${archive}:/input/vehicles.zip:ro" --volume "${datasetDir}:/datasets" ai-service scripts/prepare_vehicle_dataset.py /input/vehicles.zip /datasets/vehicles-v2
docker compose run --rm --no-deps --entrypoint python --volume "${datasetDir}:/datasets" --volume "${splitConfigDir}:/split-config:ro" ai-service scripts/regroup_vehicle_dataset.py /datasets/vehicles-v2 /datasets/vehicles-v2-grouped /split-config/vehicles-v2-splits.json
```

`prepare_vehicle_dataset.py` memvalidasi seluruh ZIP sebelum menulis, memeriksa traversal path, memetakan kelas, serta menyimpan `audit.json`. Isi dokumen ZIP diperlakukan sebagai atribusi/data dan tidak dieksekusi. `regroup_vehicle_dataset.py` menolak nama rekaman yang belum dipetakan dan tetap mempertahankan salinan sumber.

## Uji training kecil dan training penuh

Lingkungan yang tersedia memakai PyTorch `2.2.2+cpu`; CUDA tidak tersedia. Uji kecil memakai delapan gambar train dan delapan gambar validasi, satu epoch, ukuran 320, batch 2. Hasilnya hanya membuktikan training, validasi, dan penulisan checkpoint berjalan. **Weights uji kecil tidak layak dipasang ke dashboard.**

Service tambahan memakai image AI service yang sudah terpasang, dua CPU, batas RAM 3 GiB, dan `network_mode: none`. Jika nama image berbeda, isi `SIGAP_TRAINING_IMAGE` dengan image AI service lokal dari `docker compose images ai-service`. Tidak memerlukan SDK atau API key Roboflow. Font bawaan Matplotlib dipakai untuk menghindari download font otomatis dari loader upstream.

```powershell
# Ganti nama output untuk setiap percobaan.
docker compose -f docker-compose.yml -f docker-compose.training.yml run --rm --no-deps yolo-training --data /datasets/vehicles-v2-grouped --output /runs/vehicles-v2-smoke-offline --smoke-test --batch 2

# Training penuh: jalankan saat siap mengalokasikan CPU untuk waktu yang lama.
docker compose -f docker-compose.yml -f docker-compose.training.yml run --rm --no-deps yolo-training --data /datasets/vehicles-v2-grouped --output /runs/vehicles-v2-full --epochs 50 --imgsz 640 --batch 2
```

Training penuh belum dijalankan. Script menolak pembagian ekspor asli untuk training penuh; validasi dipakai selama pemilihan checkpoint, dan test baru dievaluasi setelah kandidat akhir dipilih. Early stopping memakai patience 10. Hasil tersimpan di `artifacts/training/<nama-run>/`: `training/weights/best.pt`, hasil metrik, serta `model-manifest.json` dengan SHA256, sumber dataset, dan tujuan percobaan. Test kecil diberi `SMOKE_TEST_ONLY`; kandidat training penuh diberi `TRAINED_CANDIDATE`. Keduanya tidak otomatis mengubah konfigurasi dashboard.

## Menggunakan kandidat setelah evaluasi

Verifikasi yang sudah dijalankan: **74 tes AI lulus**, termasuk geometri label, path ZIP, regrouping, karantina label kosong, alias kelas, serta pemeriksaan hash model. Uji `vehicles-v2-grouped-smoke` berhasil menjalankan satu epoch dan validasi pada 8+8 gambar tanpa jaringan, lalu menghasilkan checkpoint dan manifest. Checkpoint tersebut juga berhasil dimuat melalui adapter SIGAP dengan kelas `car`, `bus`, `truck` dan laporan kelas `motorcycle` yang belum tercakup. Ini uji kompatibilitas; skor dari subset kecil tidak digunakan sebagai bukti akurasi atau dasar deployment. Bukti lokal ada di `artifacts/training/vehicles-v2-grouped-smoke/model-manifest.json` dan `data-selection.json`.

Adapter SIGAP mendukung profile `coco` (default) dan `vehicles-v2`. Profile baru memeriksa hash file dan keberadaan kelas mobil/bus/truk, lalu memetakan nama kelas ke kontrak SIGAP. `/local-video/model-status` menyebut nama model, kelas yang tersedia, dan kelas yang tidak tercakup. Hasil antrean juga menjelaskan keterbatasan kelas sepeda motor.

Setelah model penuh lolos evaluasi dan cakupan kelas diterima, salin checkpoint yang direview ke `models/vehicles-v2/best.pt`, lalu atur di `.env` lokal:

```dotenv
SIGAP_YOLO_MODEL_PROFILE=vehicles-v2
SIGAP_YOLO_WEIGHTS=/models/vehicles-v2/best.pt
SIGAP_YOLO_WEIGHTS_SHA256=<SHA256 dari model-manifest.json kandidat yang direview>
```

Terapkan dengan `docker compose up -d --no-deps ai-service`. Hash merupakan pemeriksaan integritas, bukan bukti akurasi atau keamanan arbitrary checkpoint; gunakan hasil training sendiri yang direview. Konfigurasi aktif tetap `coco` sampai langkah ini dilakukan secara sengaja.

## Contoh API yang dikirim

Cuplikan tersebut memanggil workflow `general-segmentation-api` dengan prompt kelas; cuplikan itu tidak menunjukkan checkpoint yang dilatih dari dataset vehicles v2. Pemanggilan serverless mengirim gambar ke layanan Roboflow. Karena pilihan integrasi adalah lokal, `inference-sdk` tidak dipasang dan API key tidak disimpan dalam proyek. Dokumentasi SDK: [Roboflow Inference SDK](https://docs.roboflow.com/reference/inference/inference-sdk).
