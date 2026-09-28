<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SystemStatusResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'intersection_id' => $this->intersection_id,
            'current_mode' => $this->current_mode,
            'is_ai_healthy' => $this->is_ai_healthy,
            'is_cctv_healthy' => $this->is_cctv_healthy,
            'notes' => $this->notes,
            'recorded_at' => $this->recorded_at?->toIso8601String(),
        ];
    }
}

