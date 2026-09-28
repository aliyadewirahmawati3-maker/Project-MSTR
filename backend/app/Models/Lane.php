<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Lane extends Model
{
    use HasFactory;

    protected $fillable = [
        'approach_id',
        'lane_type',
        'movement_rules',
        'order_index',
    ];

    /**
     * Arah masuk tempat lajur ini berada.
     */
    public function approach(): BelongsTo
    {
        return $this->belongsTo(Approach::class);
    }

    /**
     * Riwayat pengukuran lalu lintas spesifik pada lajur ini.
     */
    public function trafficMeasurements(): HasMany
    {
        return $this->hasMany(TrafficMeasurement::class);
    }
}

