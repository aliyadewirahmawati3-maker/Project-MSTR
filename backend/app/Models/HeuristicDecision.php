<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HeuristicDecision extends Model
{
    use HasFactory;

    protected $fillable = [
        'intersection_id',
        'signal_phase_id',
        'proposed_duration_seconds',
        'current_cycle_seconds',
        'reason',
        'decision_payload',
        'status',
        'decided_at',
    ];

    protected function casts(): array
    {
        return [
            'decision_payload' => 'array',
            'proposed_duration_seconds' => 'integer',
            'current_cycle_seconds' => 'integer',
            'decided_at' => 'datetime',
        ];
    }

    /**
     * Simpang target keputusan.
     */
    public function intersection(): BelongsTo
    {
        return $this->belongsTo(Intersection::class);
    }

    /**
     * Fase sinyal lampu yang diusulkan.
     */
    public function signalPhase(): BelongsTo
    {
        return $this->belongsTo(SignalPhase::class);
    }
}

