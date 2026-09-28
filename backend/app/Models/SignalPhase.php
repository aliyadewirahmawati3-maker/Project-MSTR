<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SignalPhase extends Model
{
    use HasFactory;

    protected $fillable = [
        'intersection_id',
        'phase_code',
        'name',
        'default_duration_seconds',
        'min_duration_seconds',
        'max_duration_seconds',
        'amber_duration_seconds',
        'all_red_duration_seconds',
        'is_active',
        'sequence_order',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'default_duration_seconds' => 'integer',
            'min_duration_seconds' => 'integer',
            'max_duration_seconds' => 'integer',
            'amber_duration_seconds' => 'integer',
            'all_red_duration_seconds' => 'integer',
            'sequence_order' => 'integer',
        ];
    }

    /**
     * Simpang yang memiliki fase sinyal ini.
     */
    public function intersection(): BelongsTo
    {
        return $this->belongsTo(Intersection::class);
    }

    /**
     * Riwayat keputusan heuristik yang berhubungan dengan fase ini.
     */
    public function heuristicDecisions(): HasMany
    {
        return $this->hasMany(HeuristicDecision::class);
    }
}

