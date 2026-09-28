<?php

namespace Tests\Feature;

use Tests\TestCase;

class IntersectionApiTest extends TestCase
{
    /**
     * Uji penanganan 404 ketika ID simpang tidak ditemukan pada endpoint /api/intersections/{id}.
     */
    public function test_show_non_existent_intersection_returns_404(): void
    {
        $response = $this->getJson('/api/intersections/999999');

        $response->assertStatus(404)
            ->assertJson([
                'status' => 'error',
            ]);
    }

    /**
     * Uji penanganan 404 ketika ID simpang tidak ditemukan pada endpoint /api/intersections/{id}/approaches.
     */
    public function test_approaches_non_existent_intersection_returns_404(): void
    {
        $response = $this->getJson('/api/intersections/999999/approaches');

        $response->assertStatus(404)
            ->assertJson([
                'status' => 'error',
            ]);
    }

    /**
     * Uji penanganan 404 ketika ID simpang tidak ditemukan pada endpoint /api/intersections/{id}/cameras.
     */
    public function test_cameras_non_existent_intersection_returns_404(): void
    {
        $response = $this->getJson('/api/intersections/999999/cameras');

        $response->assertStatus(404)
            ->assertJson([
                'status' => 'error',
            ]);
    }

    /**
     * Uji penanganan 404 ketika ID simpang tidak ditemukan pada endpoint /api/intersections/{id}/system-status.
     */
    public function test_system_status_non_existent_intersection_returns_404(): void
    {
        $response = $this->getJson('/api/intersections/999999/system-status');

        $response->assertStatus(404)
            ->assertJson([
                'status' => 'error',
            ]);
    }

    /**
     * Uji penanganan 404 ketika ID simpang tidak ditemukan pada endpoint /api/intersections/{id}/signal-phases.
     */
    public function test_signal_phases_non_existent_intersection_returns_404(): void
    {
        $response = $this->getJson('/api/intersections/999999/signal-phases');

        $response->assertStatus(404)
            ->assertJson([
                'status' => 'error',
            ]);
    }
}

