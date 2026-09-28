# Dokumentasi REST API - SIGAP (Tahap 1 Backend)

Dokumentasi ini mencakup seluruh endpoint REST API konfigurasi simpang dan status sistem pada backend Laravel SIGAP. Seluruh endpoint pada tahap ini bersifat **read-only** (metode `GET`).

Base URL: `http://localhost:8000/api`

Seluruh konfigurasi fase pada tahap ini adalah parameter simulator DSS. Kamera belum dikonfigurasi, AI standby, dan belum ada data deteksi CCTV nyata. Petunjuk startup Docker tersedia di [README](../README.md).

---

## Standar Format Respons JSON

### Respons Berhasil (200 OK)
```json
{
  "status": "success",
  "data": { ... } atau [ ... ]
}
```

### Respons Gagal / Tidak Ditemukan (404 Not Found)
```json
{
  "status": "error",
  "message": "Simpang dengan ID {id} tidak ditemukan."
}
```

---

## Ringkasan Endpoint

| No | Method | Endpoint | Deskripsi |
|:---|:---|:---|:---|
| 1 | `GET` | `/health` | Status backend, mode ATCS, dan verifikasi konektivitas PostgreSQL |
| 2 | `GET` | `/intersections` | Daftar seluruh simpang yang terdaftar beserta relasi geometriknya |
| 3 | `GET` | `/intersections/{id}` | Detail konfigurasi geometrik satu simpang spesifik |
| 4 | `GET` | `/intersections/{id}/approaches` | Daftar 4 arah masuk (*approaches*) beserta data lajur dan kamera |
| 5 | `GET` | `/intersections/{id}/cameras` | Daftar 4 CCTV pemantau pada simpang |
| 6 | `GET` | `/intersections/{id}/system-status` | Status operasional terkini simpang (mode ATCS & health) |
| 7 | `GET` | `/intersections/{id}/signal-phases` | Daftar konfigurasi fase sinyal lampu dan durasi simulasi awal |

---

## 1. Pengecekan Kesehatan Layanan & Database

* **URL:** `/api/health`
* **Method:** `GET`
* **Deskripsi:** Memeriksa status runtime backend Laravel, mode ATCS yang aktif, serta status koneksi ke basis data PostgreSQL. Endpoint ini menangani kegagalan koneksi basis data secara aman (*graceful*).

### Contoh Respons (HTTP 503, Backend Hidup tetapi Database Belum Terhubung):
```json
{
  "status": "degraded",
  "service": "SIGAP Backend REST API (Laravel)",
  "version": "0.1.0-baseline",
  "target_intersection": "Perempatan Jl. Ibrahim Adjie - Mall Tenth Avenue, Bandung",
  "atcs_mode": "ATCS_NORMAL",
  "operating_context": "simulator",
  "database": {
    "connected": false,
    "driver": "pgsql",
    "host": "db",
    "database": "sigap_db",
    "error": "SQLSTATE[08006] [7] could not translate host name \"db\" to address"
  },
  "timestamp": "2026-09-23T00:36:18+07:00"
}
```

### Contoh Respons (HTTP 200, Database Terhubung):
```json
{
  "status": "ok",
  "service": "SIGAP Backend REST API (Laravel)",
  "version": "0.1.0-baseline",
  "target_intersection": "Perempatan Jl. Ibrahim Adjie - Mall Tenth Avenue, Bandung",
  "atcs_mode": "ATCS_NORMAL",
  "operating_context": "simulator",
  "database": {
    "connected": true,
    "driver": "pgsql",
    "host": "db",
    "database": "sigap_db",
    "error": null
  },
  "timestamp": "2026-09-23T00:36:18+07:00"
}
```

---

## 2. Daftar Simpang

* **URL:** `/api/intersections`
* **Method:** `GET`
* **Deskripsi:** Mengembalikan seluruh simpang yang terdaftar pada sistem beserta seluruh relasi strukturalnya (arah masuk, lajur, kamera, status terkini, dan fase lampu).

### Contoh Respons (200 OK):
```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "code": "BDG-IBR-ADJ-01",
      "name": "Perempatan Jl. Ibrahim Adjie Sisi Mall Tenth Avenue",
      "location": "Bandung, Jawa Barat",
      "description": "Simpang 4 lengan prototype modul pendukung ATCS adaptif SIGAP (sisi Mall Tenth Avenue)",
      "approaches": [
        {
          "id": 1,
          "intersection_id": 1,
          "direction": "WEST",
          "name": "Arah Barat (Jl. Ibrahim Adjie Arah Barat)",
          "lanes": [
            {
              "id": 1,
              "approach_id": 1,
              "lane_type": "outer",
              "movement_rules": "LEFT_OR_STRAIGHT",
              "order_index": 1,
              "created_at": "2026-09-23T00:30:00+07:00"
            },
            {
              "id": 2,
              "approach_id": 1,
              "lane_type": "inner",
              "movement_rules": "STRAIGHT_OR_RIGHT",
              "order_index": 2,
              "created_at": "2026-09-23T00:30:00+07:00"
            }
          ],
          "camera": {
            "id": 1,
            "approach_id": 1,
            "code": "CAM-W-01",
            "name": "CCTV Barat",
            "stream_url": null,
            "status": "UNCONFIGURED",
            "resolution": "1920x1080",
            "created_at": "2026-09-23T00:30:00+07:00"
          },
          "created_at": "2026-09-23T00:30:00+07:00"
        }
      ],
      "latest_status": {
        "id": 1,
        "intersection_id": 1,
        "current_mode": "ATCS_NORMAL",
        "is_ai_healthy": false,
        "is_cctv_healthy": false,
        "notes": "Baseline prototype belum terhubung ke CCTV dan AI service",
        "recorded_at": "2026-09-23T00:30:00+07:00"
      },
      "signal_phases": [
        {
          "id": 1,
          "intersection_id": 1,
          "phase_code": "PHASE_EW",
          "name": "Fase Barat - Timur",
          "duration": {
            "default_seconds": 30,
            "min_seconds": 15,
            "max_seconds": 60,
            "amber_seconds": 3,
            "all_red_seconds": 2
          },
          "is_active": true,
          "sequence_order": 1,
          "notes": "Parameter simulasi awal prototype. Bukan konfigurasi faktual ATCS Bandung Command Center.",
          "created_at": "2026-09-23T00:30:00+07:00"
        }
      ],
      "created_at": "2026-09-23T00:30:00+07:00",
      "updated_at": "2026-09-23T00:30:00+07:00"
    }
  ]
}
```

---

## 3. Detail Simpang

* **URL:** `/api/intersections/{id}`
* **Method:** `GET`
* **URL Parameter:** `id` (integer) — ID simpang (contoh: `1`)

### Contoh Respons (200 OK):
Format mengembalikan objek simpang tunggal seperti pada elemen array di endpoint `/api/intersections`.

### Contoh Respons (404 Not Found):
```json
{
  "status": "error",
  "message": "Simpang dengan ID 999 tidak ditemukan."
}
```

---

## 4. Daftar Arah Masuk (*Approaches*)

* **URL:** `/api/intersections/{id}/approaches`
* **Method:** `GET`
* **URL Parameter:** `id` (integer) — ID simpang

### Contoh Respons (200 OK):
```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "intersection_id": 1,
      "direction": "WEST",
      "name": "Arah Barat (Jl. Ibrahim Adjie Arah Barat)",
      "lanes": [
        {
          "id": 1,
          "approach_id": 1,
          "lane_type": "outer",
          "movement_rules": "LEFT_OR_STRAIGHT",
          "order_index": 1,
          "created_at": "2026-09-23T00:30:00+07:00"
        },
        {
          "id": 2,
          "approach_id": 1,
          "lane_type": "inner",
          "movement_rules": "STRAIGHT_OR_RIGHT",
          "order_index": 2,
          "created_at": "2026-09-23T00:30:00+07:00"
        }
      ],
      "camera": {
        "id": 1,
        "approach_id": 1,
        "code": "CAM-W-01",
        "name": "CCTV Barat",
        "stream_url": null,
        "status": "UNCONFIGURED",
        "resolution": "1920x1080",
        "created_at": "2026-09-23T00:30:00+07:00"
      },
      "created_at": "2026-09-23T00:30:00+07:00"
    },
    {
      "id": 2,
      "intersection_id": 1,
      "direction": "NORTH",
      "name": "Arah Utara (Jl. Ibrahim Adjie Arah Utara)",
      "lanes": [ ... ],
      "camera": { ... },
      "created_at": "2026-09-23T00:30:00+07:00"
    },
    {
      "id": 3,
      "intersection_id": 1,
      "direction": "EAST",
      "name": "Arah Timur (Jl. Ibrahim Adjie Arah Timur / Mall Tenth Ave)",
      "lanes": [ ... ],
      "camera": { ... },
      "created_at": "2026-09-23T00:30:00+07:00"
    },
    {
      "id": 4,
      "intersection_id": 1,
      "direction": "SOUTH",
      "name": "Arah Selatan (Jl. Ibrahim Adjie Arah Selatan)",
      "lanes": [ ... ],
      "camera": { ... },
      "created_at": "2026-09-23T00:30:00+07:00"
    }
  ]
}
```

---

## 5. Daftar Kamera CCTV

* **URL:** `/api/intersections/{id}/cameras`
* **Method:** `GET`
* **URL Parameter:** `id` (integer) — ID simpang

### Contoh Respons (200 OK):
```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "approach_id": 1,
      "code": "CAM-W-01",
      "name": "CCTV Barat",
      "stream_url": null,
      "status": "UNCONFIGURED",
      "resolution": "1920x1080",
      "created_at": "2026-09-23T00:30:00+07:00"
    },
    {
      "id": 2,
      "approach_id": 2,
      "code": "CAM-N-01",
      "name": "CCTV Utara",
      "stream_url": null,
      "status": "UNCONFIGURED",
      "resolution": "1920x1080",
      "created_at": "2026-09-23T00:30:00+07:00"
    },
    {
      "id": 3,
      "approach_id": 3,
      "code": "CAM-E-01",
      "name": "CCTV Timur",
      "stream_url": null,
      "status": "UNCONFIGURED",
      "resolution": "1920x1080",
      "created_at": "2026-09-23T00:30:00+07:00"
    },
    {
      "id": 4,
      "approach_id": 4,
      "code": "CAM-S-01",
      "name": "CCTV Selatan",
      "stream_url": null,
      "status": "UNCONFIGURED",
      "resolution": "1920x1080",
      "created_at": "2026-09-23T00:30:00+07:00"
    }
  ]
}
```

---

## 6. Status Operasional Terkini Simpang

* **URL:** `/api/intersections/{id}/system-status`
* **Method:** `GET`
* **URL Parameter:** `id` (integer) — ID simpang

### Contoh Respons (200 OK):
```json
{
  "status": "success",
  "data": {
    "id": 1,
    "intersection_id": 1,
    "current_mode": "ATCS_NORMAL",
    "is_ai_healthy": false,
    "is_cctv_healthy": false,
    "notes": "Simulator ATCS_NORMAL; menunggu data. CCTV belum dikonfigurasi dan AI standby tanpa inferensi.",
    "recorded_at": "2026-09-23T00:30:00+07:00"
  }
}
```

---

## 7. Daftar Fase Lampu Sinyal

* **URL:** `/api/intersections/{id}/signal-phases`
* **Method:** `GET`
* **URL Parameter:** `id` (integer) — ID simpang

### Contoh Respons (200 OK):
```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "intersection_id": 1,
      "phase_code": "PHASE_EW",
      "name": "Fase Barat - Timur",
      "duration": {
        "default_seconds": 30,
        "min_seconds": 15,
        "max_seconds": 60,
        "amber_seconds": 3,
        "all_red_seconds": 2
      },
      "is_active": true,
      "sequence_order": 1,
      "notes": "Parameter simulasi awal prototype. Bukan konfigurasi faktual ATCS Bandung Command Center.",
      "created_at": "2026-09-23T00:30:00+07:00"
    },
    {
      "id": 2,
      "intersection_id": 1,
      "phase_code": "PHASE_NS",
      "name": "Fase Utara - Selatan",
      "duration": {
        "default_seconds": 25,
        "min_seconds": 15,
        "max_seconds": 60,
        "amber_seconds": 3,
        "all_red_seconds": 2
      },
      "is_active": false,
      "sequence_order": 2,
      "notes": "Parameter simulasi awal prototype. Bukan konfigurasi faktual ATCS Bandung Command Center.",
      "created_at": "2026-09-23T00:30:00+07:00"
    }
  ]
}
```

