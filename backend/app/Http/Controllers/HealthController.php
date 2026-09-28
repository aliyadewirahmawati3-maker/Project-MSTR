<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Throwable;

class HealthController extends Controller
{
    /**
     * Pengecekan status backend dan konektivitas database PostgreSQL.
     * Sesuai batasan Tahap 1: Hanya memeriksa status baseline, bukan heuristik penuh.
     */
    public function check(): JsonResponse
    {
        $dbStatus = [
            'connected' => false,
            'driver' => config('database.default', 'pgsql'),
            'host' => config('database.connections.pgsql.host', 'db'),
            'database' => config('database.connections.pgsql.database', 'sigap_db'),
            'error' => null,
        ];

        try {
            DB::connection()->getPdo();
            $dbStatus['connected'] = true;
        } catch (Throwable $e) {
            $dbStatus['connected'] = false;
            $dbStatus['error'] = $e->getMessage();
        }

        $atcsMode = env('DEFAULT_ATCS_MODE', 'ATCS_NORMAL');

        return response()->json([
            'status' => $dbStatus['connected'] ? 'ok' : 'degraded',
            'service' => 'SIGAP Backend REST API (Laravel)',
            'version' => '0.1.0-baseline',
            'target_intersection' => 'Perempatan Jl. Ibrahim Adjie - Mall Tenth Avenue, Bandung',
            'atcs_mode' => $atcsMode,
            'operating_context' => 'simulator',
            'database' => $dbStatus,
            'timestamp' => now()->toIso8601String(),
        ], $dbStatus['connected'] ? 200 : 503);
    }
}

