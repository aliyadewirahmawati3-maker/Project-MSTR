<?php

namespace App\Http\Controllers;

use App\Http\Resources\ApproachResource;
use App\Http\Resources\CameraResource;
use App\Http\Resources\IntersectionResource;
use App\Http\Resources\SignalPhaseResource;
use App\Http\Resources\SystemStatusResource;
use App\Models\Camera;
use App\Models\Intersection;
use Illuminate\Http\JsonResponse;

class IntersectionController extends Controller
{
    /**
     * Daftar seluruh simpang yang terdaftar pada sistem SIGAP.
     * GET /api/intersections
     */
    public function index(): JsonResponse
    {
        $intersections = Intersection::with([
            'approaches.lanes',
            'approaches.camera',
            'latestSystemStatus',
            'signalPhases',
        ])->get();

        return response()->json([
            'status' => 'success',
            'data' => IntersectionResource::collection($intersections),
        ], 200);
    }

    /**
     * Detail konfigurasi geometrik spesifik sebuah simpang.
     * GET /api/intersections/{id}
     */
    public function show(int|string $id): JsonResponse
    {
        $intersection = Intersection::with([
            'approaches.lanes',
            'approaches.camera',
            'latestSystemStatus',
            'signalPhases',
        ])->find($id);

        if (!$intersection) {
            return response()->json([
                'status' => 'error',
                'message' => "Simpang dengan ID {$id} tidak ditemukan.",
            ], 404);
        }

        return response()->json([
            'status' => 'success',
            'data' => new IntersectionResource($intersection),
        ], 200);
    }

    /**
     * Daftar arah masuk (approaches) dan lajur-lajurnya pada simpang bersangkutan.
     * GET /api/intersections/{id}/approaches
     */
    public function approaches(int|string $id): JsonResponse
    {
        $intersection = Intersection::find($id);

        if (!$intersection) {
            return response()->json([
                'status' => 'error',
                'message' => "Simpang dengan ID {$id} tidak ditemukan.",
            ], 404);
        }

        $approaches = $intersection->approaches()->with(['lanes', 'camera'])->get();

        return response()->json([
            'status' => 'success',
            'data' => ApproachResource::collection($approaches),
        ], 200);
    }

    /**
     * Daftar kamera CCTV pemantau pada simpang bersangkutan.
     * GET /api/intersections/{id}/cameras
     */
    public function cameras(int|string $id): JsonResponse
    {
        $intersection = Intersection::find($id);

        if (!$intersection) {
            return response()->json([
                'status' => 'error',
                'message' => "Simpang dengan ID {$id} tidak ditemukan.",
            ], 404);
        }

        // Ambil kamera melalui approach_id yang dimiliki oleh simpang ini
        $approachIds = $intersection->approaches()->pluck('id');
        $cameras = Camera::whereIn('approach_id', $approachIds)->get();

        return response()->json([
            'status' => 'success',
            'data' => CameraResource::collection($cameras),
        ], 200);
    }

    /**
     * Status operasional terkini simpang (mode ATCS, kesehatan AI, dan CCTV).
     * GET /api/intersections/{id}/system-status
     */
    public function systemStatus(int|string $id): JsonResponse
    {
        $intersection = Intersection::find($id);

        if (!$intersection) {
            return response()->json([
                'status' => 'error',
                'message' => "Simpang dengan ID {$id} tidak ditemukan.",
            ], 404);
        }

        $latestStatus = $intersection->latestSystemStatus;

        if (!$latestStatus) {
            return response()->json([
                'status' => 'error',
                'message' => 'Status operasional simpang belum tersedia.',
            ], 404);
        }

        return response()->json([
            'status' => 'success',
            'data' => new SystemStatusResource($latestStatus),
        ], 200);
    }

    /**
     * Daftar fase sinyal lampu lalu lintas beserta batas durasi konfigurasinya.
     * GET /api/intersections/{id}/signal-phases
     */
    public function signalPhases(int|string $id): JsonResponse
    {
        $intersection = Intersection::find($id);

        if (!$intersection) {
            return response()->json([
                'status' => 'error',
                'message' => "Simpang dengan ID {$id} tidak ditemukan.",
            ], 404);
        }

        $signalPhases = $intersection->signalPhases;

        return response()->json([
            'status' => 'success',
            'data' => SignalPhaseResource::collection($signalPhases),
        ], 200);
    }
}

