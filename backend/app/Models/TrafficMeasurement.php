<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TrafficMeasurement extends Model
{
    use HasFactory;

    protected $fillable = [
        'camera_id',
        'approach_id',
        'lane_id',
        'vehicle_count',
        'vehicle_class_counts',
        'occupancy_percentage',
        'queue_length_meters',
        'waiting_time_seconds',
        'measured_at',
    ];

    protected function casts(): array
    {
        return [
            'vehicle_class_counts' => 'array',
            'occupancy_percentage' => 'float',
            'queue_length_meters' => 'float',
            'measured_at' => 'datetime',
        ];
    }

    /**
     * Kamera sumber pengukuran.
     */
    public function camera(): BelongsTo
    {
        return $this->belongsTo(Camera::class);
    }

    /**
     * Arah masuk yang diukur.
     */
    public function approach(): BelongsTo
    {
        return $this->belongsTo(Approach::class);
    }

    /**
     * Lajur spesifik pengukuran (jika spesifik per lajur).
     */
    public function lane(): BelongsTo
    {
        return $this->belongsTo(Lane::class);
    }
}

