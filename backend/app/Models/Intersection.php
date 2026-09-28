<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Intersection extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'location',
        'description',
    ];

    /**
     * Arah masuk pada simpang (Barat, Utara, Timur, Selatan).
     */
    public function approaches(): HasMany
    {
        return $this->hasMany(Approach::class);
    }

    /**
     * Seluruh kamera CCTV pada simpang (melalui relasi approach).
     */
    public function cameras()
    {
        return $this->hasManyThrough(Camera::class, Approach::class);
    }

    /**
     * Fase-fase sinyal lampu lalu lintas pada simpang.
     */
    public function signalPhases(): HasMany
    {
        return $this->hasMany(SignalPhase::class)->orderBy('sequence_order');
    }

    /**
     * Riwayat dan status operasional sistem SIGAP.
     */
    public function systemStatuses(): HasMany
    {
        return $this->hasMany(SystemStatus::class);
    }

    /**
     * Status operasional terkini simpang.
     */
    public function latestSystemStatus(): HasOne
    {
        return $this->hasOne(SystemStatus::class)->latestOfMany();
    }

    /**
     * Keputusan heuristik pengaturan durasi lampu lalu lintas.
     */
    public function heuristicDecisions(): HasMany
    {
        return $this->hasMany(HeuristicDecision::class);
    }

    /**
     * Log perubahan mode operasional sistem.
     */
    public function systemStatusLogs(): HasMany
    {
        return $this->hasMany(SystemStatusLog::class);
    }
}

