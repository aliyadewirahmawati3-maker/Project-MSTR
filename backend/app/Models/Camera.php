<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Camera extends Model
{
    use HasFactory;

    protected $fillable = [
        'approach_id',
        'code',
        'name',
        'stream_url',
        'status',
        'resolution',
    ];

    /**
     * Arah masuk yang dipantau oleh kamera ini.
     */
    public function approach(): BelongsTo
    {
        return $this->belongsTo(Approach::class);
    }

    /**
     * Pengukuran lalu lintas yang dihasilkan dari kamera ini.
     */
    public function trafficMeasurements(): HasMany
    {
        return $this->hasMany(TrafficMeasurement::class);
    }
}

