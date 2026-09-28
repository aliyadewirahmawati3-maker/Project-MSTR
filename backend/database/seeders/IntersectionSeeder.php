<?php

namespace Database\Seeders;

use App\Models\Approach;
use App\Models\Camera;
use App\Models\Intersection;
use App\Models\Lane;
use App\Models\SignalPhase;
use App\Models\SystemStatus;
use App\Models\SystemStatusLog;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class IntersectionSeeder extends Seeder
{
    /**
     * Seed konfigurasi awal simpang Jl. Ibrahim Adjie sisi Mall Tenth Avenue, Bandung.
     * Mengikuti prinsip kejujuran status operasional awal (CCTV offline, AI belum tersambung).
     */
    public function run(): void
    {
        DB::transaction(fn () => $this->seedInitialConfiguration());
    }

    private function seedInitialConfiguration(): void
    {
        // 1. Simpang Tunggal Prototipe
        $intersection = Intersection::firstOrCreate(
            ['code' => 'BDG-IBR-ADJ-01'],
            [
                'name' => 'Perempatan Jl. Ibrahim Adjie Sisi Mall Tenth Avenue',
                'location' => 'Bandung, Jawa Barat',
                'description' => 'Simpang 4 lengan prototype modul pendukung ATCS adaptif SIGAP (sisi Mall Tenth Avenue)',
            ]
        );

        // 2. Empat Arah Masuk Simpang (Barat, Utara, Timur, Selatan)
        $approachesData = [
            [
                'direction' => 'WEST',
                'name' => 'Arah Barat (Jl. Ibrahim Adjie Arah Barat)',
                'camera_code' => 'CAM-W-01',
                'camera_name' => 'CCTV Barat',
                'lanes' => [
                    ['lane_type' => 'outer', 'movement_rules' => 'LEFT_OR_STRAIGHT', 'order_index' => 1],
                    ['lane_type' => 'inner', 'movement_rules' => 'STRAIGHT_OR_RIGHT', 'order_index' => 2],
                ],
            ],
            [
                'direction' => 'NORTH',
                'name' => 'Arah Utara (Jl. Ibrahim Adjie Arah Utara)',
                'camera_code' => 'CAM-N-01',
                'camera_name' => 'CCTV Utara',
                'lanes' => [
                    ['lane_type' => 'outer', 'movement_rules' => 'LEFT_OR_STRAIGHT', 'order_index' => 1],
                    ['lane_type' => 'inner', 'movement_rules' => 'STRAIGHT_OR_RIGHT', 'order_index' => 2],
                ],
            ],
            [
                'direction' => 'EAST',
                'name' => 'Arah Timur (Jl. Ibrahim Adjie Arah Timur / Mall Tenth Ave)',
                'camera_code' => 'CAM-E-01',
                'camera_name' => 'CCTV Timur',
                'lanes' => [
                    ['lane_type' => 'outer', 'movement_rules' => 'LEFT_OR_STRAIGHT', 'order_index' => 1],
                    ['lane_type' => 'inner', 'movement_rules' => 'STRAIGHT_OR_RIGHT', 'order_index' => 2],
                ],
            ],
            [
                'direction' => 'SOUTH',
                'name' => 'Arah Selatan (Jl. Ibrahim Adjie Arah Selatan)',
                'camera_code' => 'CAM-S-01',
                'camera_name' => 'CCTV Selatan',
                'lanes' => [
                    ['lane_type' => 'outer', 'movement_rules' => 'LEFT_OR_STRAIGHT', 'order_index' => 1],
                    ['lane_type' => 'inner', 'movement_rules' => 'STRAIGHT_OR_RIGHT', 'order_index' => 2],
                ],
            ],
        ];

        foreach ($approachesData as $data) {
            $approach = Approach::firstOrCreate(
                [
                    'intersection_id' => $intersection->id,
                    'direction' => $data['direction'],
                ],
                [
                    'name' => $data['name'],
                ]
            );

            // 3. Dua Lajur Masuk per Arah (Outer & Inner)
            foreach ($data['lanes'] as $laneData) {
                Lane::firstOrCreate(
                    [
                        'approach_id' => $approach->id,
                        'lane_type' => $laneData['lane_type'],
                    ],
                    [
                        'movement_rules' => $laneData['movement_rules'],
                        'order_index' => $laneData['order_index'],
                    ]
                );
            }

            // 4. Satu Kamera per Arah (Kejujuran status: stream_url null, status UNCONFIGURED)
            Camera::firstOrCreate(
                [
                    'approach_id' => $approach->id,
                ],
                [
                    'code' => $data['camera_code'],
                    'name' => $data['camera_name'],
                    'stream_url' => null, // Belum terhubung ke stream CCTV fisik
                    'status' => 'UNCONFIGURED', // UNCONFIGURED pada baseline prototype
                    'resolution' => '1920x1080',
                ]
            );
        }

        // 5. Status Awal Sistem (Kejujuran: ATCS_NORMAL, AI dan CCTV false)
        SystemStatus::firstOrCreate(['intersection_id' => $intersection->id], [
            'current_mode' => 'ATCS_NORMAL',
            'is_ai_healthy' => false,
            'is_cctv_healthy' => false,
            'notes' => 'Simulator ATCS_NORMAL; menunggu data. CCTV belum dikonfigurasi dan AI standby tanpa inferensi.',
            'recorded_at' => now(),
        ]);

        // 6. Log Status Awal Sistem
        SystemStatusLog::firstOrCreate([
            'intersection_id' => $intersection->id,
            'previous_mode' => null,
            'new_mode' => 'ATCS_NORMAL',
            'reason' => 'Inisialisasi simulator SIGAP mode ATCS_NORMAL',
        ], [
            'payload' => [
                'initialized_by' => 'system_seeder',
                'atcs_mode' => 'ATCS_NORMAL',
                'is_ai_healthy' => false,
                'is_cctv_healthy' => false,
            ],
            'created_at' => now(),
        ]);

        // 7. Fase Lampu Awal
        // Disclaimer: Nilai durasi fase adalah parameter simulasi awal prototype,
        // bukan konfigurasi faktual ATCS Bandung Command Center. Batasan prototype:
        // hijau min 15s, hijau max 60s, kuning 3s, all-red 2s.
        SignalPhase::firstOrCreate(
            [
                'intersection_id' => $intersection->id,
                'phase_code' => 'PHASE_EW',
            ],
            [
                'name' => 'Fase Barat - Timur',
                'default_duration_seconds' => 30, // Default simulasi awal
                'min_duration_seconds' => 15,
                'max_duration_seconds' => 60,
                'amber_duration_seconds' => 3,
                'all_red_duration_seconds' => 2,
                'is_active' => true, // Fase awal aktif
                'sequence_order' => 1,
                'notes' => 'Parameter simulasi awal prototype. Bukan konfigurasi faktual ATCS Bandung Command Center.',
            ]
        );

        SignalPhase::firstOrCreate(
            [
                'intersection_id' => $intersection->id,
                'phase_code' => 'PHASE_NS',
            ],
            [
                'name' => 'Fase Utara - Selatan',
                'default_duration_seconds' => 25, // Default simulasi awal
                'min_duration_seconds' => 15,
                'max_duration_seconds' => 60,
                'amber_duration_seconds' => 3,
                'all_red_duration_seconds' => 2,
                'is_active' => false,
                'sequence_order' => 2,
                'notes' => 'Parameter simulasi awal prototype. Bukan konfigurasi faktual ATCS Bandung Command Center.',
            ]
        );
    }
}

