<?php

namespace Tests\Feature;

use App\Models\Intersection;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SeededConfigurationTest extends TestCase
{
    // Use the migrated PostgreSQL database; roll back every test's writes.
    use DatabaseTransactions;

    public function test_seeded_configuration_is_available_through_all_read_endpoints(): void
    {
        $this->seed();
        $intersection = Intersection::where('code', 'BDG-IBR-ADJ-01')->firstOrFail();
        $path = '/api/intersections/'.$intersection->id;

        $this->getJson('/api/intersections')->assertOk()
            ->assertJsonFragment(['code' => 'BDG-IBR-ADJ-01']);
        $this->getJson($path)->assertOk()
            ->assertJsonPath('data.code', 'BDG-IBR-ADJ-01')
            ->assertJsonCount(4, 'data.approaches')
            ->assertJsonCount(2, 'data.signal_phases');

        $approaches = $this->getJson($path.'/approaches')->assertOk()
            ->assertJsonCount(4, 'data')->json('data');
        $this->assertEqualsCanonicalizing(['WEST', 'NORTH', 'EAST', 'SOUTH'], array_column($approaches, 'direction'));
        foreach ($approaches as $approach) {
            $this->assertCount(2, $approach['lanes']);
            $this->assertEqualsCanonicalizing(['outer', 'inner'], array_column($approach['lanes'], 'lane_type'));
        }

        $cameras = $this->getJson($path.'/cameras')->assertOk()
            ->assertJsonCount(4, 'data')->json('data');
        foreach ($cameras as $camera) {
            $this->assertSame('UNCONFIGURED', $camera['status']);
            $this->assertNull($camera['stream_url']);
        }

        $this->getJson($path.'/system-status')->assertOk()
            ->assertJsonPath('data.current_mode', 'ATCS_NORMAL')
            ->assertJsonPath('data.is_ai_healthy', false)
            ->assertJsonPath('data.is_cctv_healthy', false);
        $this->getJson($path.'/signal-phases')->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.phase_code', 'PHASE_EW')
            ->assertJsonPath('data.0.duration.default_seconds', 30)
            ->assertJsonPath('data.1.phase_code', 'PHASE_NS')
            ->assertJsonPath('data.1.duration.default_seconds', 25);
    }

    public function test_reseeding_preserves_configuration_and_does_not_duplicate_history(): void
    {
        $this->seed();
        $intersection = Intersection::where('code', 'BDG-IBR-ADJ-01')->firstOrFail();
        $intersection->latestSystemStatus->update(['notes' => 'Catatan operator simulator']);
        $intersection->signalPhases()->first()->update(['default_duration_seconds' => 35]);
        $tables = ['intersections', 'approaches', 'lanes', 'cameras', 'system_statuses', 'system_status_logs', 'signal_phases'];
        $counts = [];
        foreach ($tables as $table) {
            $counts[$table] = DB::table($table)->count();
        }

        $this->seed();

        foreach ($counts as $table => $count) {
            $this->assertDatabaseCount($table, $count);
        }
        $this->assertSame('Catatan operator simulator', $intersection->fresh()->latestSystemStatus->notes);
        $this->assertSame(35, $intersection->signalPhases()->first()->default_duration_seconds);
        $this->assertDatabaseCount('traffic_measurements', 0);
        $this->assertDatabaseCount('heuristic_decisions', 0);
    }
}
