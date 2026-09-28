# Entity Relationship Diagram (ERD) - SIGAP Database
# Entity Relationship Diagram (ERD) - SIGAP Database (Tahap 2)

Dokumen ini menjelaskan rancangan skema basis data PostgreSQL untuk prototype sistem **SIGAP** (Sistem Pendukung Keputusan Pengaturan Fase Lampu Lalu Lintas Adaptif) pada Perempatan Jl. Ibrahim Adjie - Mall Tenth Avenue, Bandung.
Dokumen ini menjelaskan rancangan skema basis data relasional PostgreSQL untuk sistem **SIGAP** (Sistem Pendukung Keputusan Pengaturan Fase Lampu Lalu Lintas Adaptif) pada **Perempatan Jl. Ibrahim Adjie - Mall Tenth Avenue, Bandung**.

Seluruh struktur tabel, relasi, dan indeks pada sistem ini dikelola sepenuhnya melalui **Laravel Migrations** sebagai satu-satunya sumber kebenaran (*single source of truth*).

---

## 1. Diagram ERD (Mermaid)

```mermaid
erDiagram
    INTERSECTIONS ||--o{ APPROACHES : "memiliki 4 arah"
    INTERSECTIONS ||--o{ TRAFFIC_PHASE_LOGS : "mencatat riwayat fase"
    APPROACHES ||--o{ LANES : "memiliki 2 lajur"
    INTERSECTIONS ||--o{ SIGNAL_PHASES : "memiliki konfigurasi fase"
    INTERSECTIONS ||--o{ SYSTEM_STATUSES : "mencatat status berkala"
    INTERSECTIONS ||--o{ HEURISTIC_DECISIONS : "menerima usulan durasi"
    INTERSECTIONS ||--o{ SYSTEM_STATUS_LOGS : "mencatat log mode"

    APPROACHES ||--o{ LANES : "memiliki 2 lajur masuk"
    APPROACHES ||--|| CAMERAS : "diawasi 1 kamera CCTV"
    APPROACHES ||--o{ TRAFFIC_MEASUREMENTS : "diukur volume lalu lintasnya"

    LANES ||--o{ TRAFFIC_MEASUREMENTS : "diukur antreannya"
    CAMERAS ||--o{ TRAFFIC_MEASUREMENTS : "menghasilkan data pengukuran"
    SIGNAL_PHASES ||--o{ HEURISTIC_DECISIONS : "diberikan rekomendasi waktu"

    INTERSECTIONS {
        int id PK
        bigint id PK
        varchar code UK "BDG-IBR-ADJ-01"
        varchar name "Perempatan Jl. Ibrahim Adjie"
        varchar name "Perempatan Jl. Ibrahim Adjie Sisi Mall Tenth Avenue"
        varchar location "Bandung, Jawa Barat"
        text description
        timestamp created_at
        timestamp updated_at
    }

    APPROACHES {
        int id PK
        int intersection_id FK
        varchar direction "NORTH | SOUTH | EAST | WEST"
        bigint id PK
        bigint intersection_id FK
        varchar direction "WEST | NORTH | EAST | SOUTH"
        varchar name
        timestamp created_at
        timestamp updated_at
    }

    LANES {
        int id PK
        int approach_id FK
        varchar lane_type "OUTER_LANE | INNER_LANE"
        bigint id PK
        bigint approach_id FK
        varchar lane_type "outer | inner"
        varchar movement_rules "LEFT_OR_STRAIGHT | STRAIGHT_OR_RIGHT"
        int order_index
        timestamp created_at
        timestamp updated_at
    }

    SYSTEM_STATUS {
        int id PK
        varchar current_mode "SIGAP_ADAPTIVE | ATCS_NORMAL | FALLBACK_ATCS | OPERATOR_OVERRIDE"
    CAMERAS {
        bigint id PK
        bigint approach_id FK,UK
        varchar code UK "CAM-W-01"
        varchar name "CCTV Barat"
        varchar stream_url "nullable"
        varchar status "UNCONFIGURED | OFFLINE | ACTIVE"
        varchar resolution "1920x1080"
        timestamp created_at
        timestamp updated_at
    }

    SYSTEM_STATUSES {
        bigint id PK
        bigint intersection_id FK
        varchar current_mode "ATCS_NORMAL | SIGAP_ADAPTIVE | FALLBACK_ATCS | OPERATOR_OVERRIDE"
        boolean is_ai_healthy
        boolean is_cctv_healthy
        text notes
        timestamp recorded_at
        timestamp created_at
        timestamp updated_at
    }

    TRAFFIC_PHASE_LOGS {
    TRAFFIC_MEASUREMENTS {
        bigint id PK
        int intersection_id FK
        varchar active_phase "EAST_WEST | NORTH_SOUTH"
        varchar phase_color "GREEN | YELLOW | ALL_RED"
        int duration_seconds
        varchar mode
        text decision_reason
        bigint camera_id FK
        bigint approach_id FK
        bigint lane_id FK "nullable"
        int vehicle_count
        jsonb vehicle_class_counts "motor, mobil, bus, truk, ambulans, pemadam"
        decimal occupancy_percentage "nullable"
        decimal queue_length_meters "nullable"
        int waiting_time_seconds "nullable"
        timestamp measured_at
        timestamp created_at
        timestamp updated_at
    }

    SIGNAL_PHASES {
        bigint id PK
        bigint intersection_id FK
        varchar phase_code "PHASE_EW | PHASE_NS"
        varchar name "Fase Barat - Timur | Fase Utara - Selatan"
        int default_duration_seconds "30s"
        int min_duration_seconds "15s"
        int max_duration_seconds "60s"
        int amber_duration_seconds "3s"
        int all_red_duration_seconds "2s"
        boolean is_active
        int sequence_order
        text notes
        timestamp created_at
        timestamp updated_at
    }

    HEURISTIC_DECISIONS {
        bigint id PK
        bigint intersection_id FK
        bigint signal_phase_id FK
        int proposed_duration_seconds
        int current_cycle_seconds "nullable"
        text reason
        jsonb decision_payload "nullable"
        varchar status "PROPOSED | APPLIED | SKIPPED"
        timestamp decided_at
        timestamp created_at
        timestamp updated_at
    }

    SYSTEM_STATUS_LOGS {
        bigint id PK
        bigint intersection_id FK
        varchar previous_mode "nullable"
        varchar new_mode "ATCS_NORMAL"
        text reason
        jsonb payload "nullable"
        timestamp created_at
    }
```

---

## 2. Penjelasan Entitas & Batasan Desain
## 2. Penjelasan Rinci Entitas & Hubungan Antar Tabel

1. **`intersections`**: Menyimpan identitas simpang fisik yang disimulasikan.
2. **`approaches`**: Merepresentasikan empat arah masuk simpang (Barat, Utara, Timur, Selatan).
3. **`lanes`**: Merepresentasikan dua lajur per arah (Lajur Luar: belok kiri / lurus; Lajur Dalam: lurus / belok kanan).
4. **`system_status`**: Mencatat status operasional aktif dan kondisi kesehatan komponen (AI, kamera, koneksi) untuk memicu logika fallback simulasi.
5. **`traffic_phase_logs`**: Menyimpan riwayat perubahan fase lampu (Hijau $\rightarrow$ Kuning $\rightarrow$ Semua Merah $\rightarrow$ Hijau) beserta alasan pengambilan keputusan untuk perbandingan evaluasi mode adaptif vs normal.
1. **`intersections`**: Entitas sentral yang menyimpan identitas fisik simpang yang dimodelkan.
2. **`approaches`**: Empat arah geometrik masuk simpang (Barat, Utara, Timur, Selatan). Relasi *1-to-Many* dari simpang.
3. **`lanes`**: Dua lajur masuk per arah (Lajur Luar: belok kiri / lurus; Lajur Dalam: lurus / belok kanan). Total 8 lajur untuk 4 arah.
4. **`cameras`**: Satu kamera CCTV untuk setiap arah masuk (relasi *1-to-1* dengan `approaches`).
   - Pada baseline prototype: `stream_url` bernilai `null` dan `status` bernilai `UNCONFIGURED` (kejujuran status awal, belum terhubung ke CCTV fisik).
5. **`system_statuses`**: Menyimpan rekaman status sistem terkini (mode operasional aktif: `ATCS_NORMAL`, `SIGAP_ADAPTIVE`, `FALLBACK_ATCS`, `OPERATOR_OVERRIDE`).
   - Pada inisialisasi awal: `is_ai_healthy` bernilai `false` dan `is_cctv_healthy` bernilai `false` karena layanan deteksi dan kamera fisik belum aktif.
6. **`traffic_measurements`**: *(Fondasi Arsitektural)*
   - Disiapkan untuk menampung metrik penghitungan volume kendaraan anonim, distribusi kelas kendaraan (`vehicle_class_counts`: motor, mobil, bus, truk, ambulans, pemadam), estimasi kepadatan lajur (`occupancy_percentage`), panjang antrean (meter), dan estimasi waktu tunggu.
   - **Penting:** Pada Tahap 2 ini, tabel ini murni skema DDL kosong, belum diisi data palsu/tiruan. Pengisian akan dilakukan pada Tahap 3 saat integrasi AI Service.
7. **`signal_phases`**: Konfigurasi fase lampu lalu lintas:
   - `Fase Barat - Timur` (fase awal aktif, durasi default simulasi 30 detik).
   - `Fase Utara - Selatan` (fase non-aktif, durasi default simulasi 25 detik).
   - Batasan durasi prototype yang disepakati: Hijau minimum 15 detik, Hijau maksimum 60 detik, Kuning 3 detik, dan All-Red 2 detik.
   - Catatan: Durasi fase merupakan parameter simulasi awal yang dapat dikonfigurasi, bukan konfigurasi faktual dari ATCS Bandung Command Center.
8. **`heuristic_decisions`**: *(Fondasi Arsitektural)*
   - Disiapkan untuk mencatat rekomendasi durasi fase adaptif yang dihitung oleh algoritma heuristik pada Tahap 4. Pada Tahap 2, tabel ini masih kosong.
9. **`system_status_logs`**: Riwayat audit perubahan mode operasional sistem (misalnya saat terjadi intervensi operator atau *automatic fallback*).

---

## 3. Batasan Privasi & Desain Sistem

> [!IMPORTANT]
> **Privasi & Regulasi:**
> Skema database **TIDAK** menyimpan nomor plat kendaraan, gambar wajah, maupun ID pelacakan (*tracking ID*). Sistem hanya berfokus pada agregasi jumlah kendaraan dalam antrean.

> **Kepatuhan Privasi Data Publik:**
> Basis data SIGAP **TIDAK** memuat kolom nomor plat kendaraan, gambar wajah pengemudi, maupun *tracking ID* individu. Sistem hanya mengelola data numerik volume kendaraan per kelas secara teragregasi dalam poligon zona antrean demi menjamin kepatuhan terhadap privasi publik.
