<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SystemStatus extends Model
{
    use HasFactory;

    protected $fillable = [
        'intersection_id',
        'current_mode',
        'is_ai_healthy',
        'is_cctv_healthy',
        'notes',
        'recorded_at',
    ];

    protected function casts(): array
    {
        return [
            'is_ai_healthy' => 'boolean',
            'is_cctv_healthy' => 'boolean',
            'recorded_at' => 'datetime',
        ];
    }

    /**
     * Simpang yang statusnya dicatat.
     */
    public function intersection(): BelongsTo
    {
        return $this->belongsTo(Intersection::class);
    }
}

