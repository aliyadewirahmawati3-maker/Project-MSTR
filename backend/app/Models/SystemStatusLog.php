<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SystemStatusLog extends Model
{
    use HasFactory;

    // Tabel ini hanya memiliki created_at, tidak ada updated_at
    public const UPDATED_AT = null;

    protected $fillable = [
        'intersection_id',
        'previous_mode',
        'new_mode',
        'reason',
        'payload',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'created_at' => 'datetime',
        ];
    }

    /**
     * Simpang terkait log status.
     */
    public function intersection(): BelongsTo
    {
        return $this->belongsTo(Intersection::class);
    }
}

