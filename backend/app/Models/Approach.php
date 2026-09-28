<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Approach extends Model
{
    use HasFactory;

    protected $fillable = [
        'intersection_id',
        'direction',
        'name',
    ];

    /**
     * Simpang pemilik arah masuk ini.
     */
    public function intersection(): BelongsTo
    {
        return $this->belongsTo(Intersection::class);
    }

    /**
     * Lajur-lajur masuk (outer & inner).
     */
    public function lanes(): HasMany
    {
        return $this->hasMany(Lane::class)->orderBy('order_index');
    }

    /**
     * Kamera CCTV yang mengawasi arah masuk ini (1-to-1).
     */
    public function camera(): HasOne
    {
        return $this->hasOne(Camera::class);
    }

    /**
     * Pengukuran lalu lintas pada arah ini.
     */
    public function trafficMeasurements(): HasMany
    {
        return $this->hasMany(TrafficMeasurement::class);
    }
}

