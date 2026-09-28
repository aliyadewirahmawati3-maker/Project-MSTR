<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

class HealthTest extends TestCase
{
    /**
     * Uji endpoint /api/health mengembalikan status HTTP 200 dan format JSON yang valid.
     */
    public function test_health_check_returns_ok_status(): void
    {
        $response = $this->getJson('/api/health');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'status',
                'service',
                'version',
                'target_intersection',
                'atcs_mode',
                'database' => [
                    'connected',
                    'driver',
                    'host',
                    'database',
                    'error',
                ],
                'timestamp',
            ])
            ->assertJson([
                'status' => 'ok',
                'operating_context' => 'simulator',
                'service' => 'SIGAP Backend REST API (Laravel)',
                'target_intersection' => 'Perempatan Jl. Ibrahim Adjie - Mall Tenth Avenue, Bandung',
                'database' => [
                    'connected' => true,
                    'driver' => 'pgsql',
                ],
            ]);
    }

    public function test_health_reports_database_failure_as_unavailable(): void
    {
        DB::shouldReceive('connection->getPdo')
            ->once()
            ->andThrow(new RuntimeException('Database unavailable for this test.'));

        $this->getJson('/api/health')
            ->assertStatus(503)
            ->assertJsonPath('status', 'degraded')
            ->assertJsonPath('database.connected', false);
    }

    /**
     * Uji fallback root endpoint /api mengembalikan info service.
     */
    public function test_api_root_returns_running_message(): void
    {
        $response = $this->getJson('/api');

        $response->assertStatus(200)
            ->assertJson([
                'message' => 'SIGAP Backend REST API is running',
            ]);
    }
}

