<?php

use App\Http\Controllers\HealthController;
use App\Http\Controllers\IntersectionController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes - SIGAP Backend
|--------------------------------------------------------------------------
| Seluruh rute API publik dan internal untuk komunikasi dashboard,
| FastAPI AI service, dan simulator fase lampu lalu lintas.
| Seluruh rute API publik dan internal untuk komunikasi dashboard operator,
| FastAPI AI service, dan simulator fase lampu lalu lintas adaptif.
*/

// Endpoint Kesehatan & Konektivitas Database
Route::get('/health', [HealthController::class, 'check'])->name('api.health');

// Fallback status rute
// REST API Konfigurasi Simpang (Read-Only - Tahap 2)
Route::prefix('intersections')->name('api.intersections.')->group(function () {
    Route::get('/', [IntersectionController::class, 'index'])->name('index');
    Route::get('/{id}', [IntersectionController::class, 'show'])->name('show');
    Route::get('/{id}/approaches', [IntersectionController::class, 'approaches'])->name('approaches');
    Route::get('/{id}/cameras', [IntersectionController::class, 'cameras'])->name('cameras');
    Route::get('/{id}/system-status', [IntersectionController::class, 'systemStatus'])->name('system-status');
    Route::get('/{id}/signal-phases', [IntersectionController::class, 'signalPhases'])->name('signal-phases');
});

// Fallback root status API
Route::get('/', function () {
    return response()->json([
        'message' => 'SIGAP Backend API is running',
        'message' => 'SIGAP Backend REST API is running',
        'version' => '0.2.0-phase2',
        'health_check' => url('/api/health'),
        'endpoints' => [
            'intersections' => url('/api/intersections'),
        ],
    ]);
});

