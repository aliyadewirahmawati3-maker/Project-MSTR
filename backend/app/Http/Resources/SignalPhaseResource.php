<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SignalPhaseResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'intersection_id' => $this->intersection_id,
            'phase_code' => $this->phase_code,
            'name' => $this->name,
            'duration' => [
                'default_seconds' => $this->default_duration_seconds,
                'min_seconds' => $this->min_duration_seconds,
                'max_seconds' => $this->max_duration_seconds,
                'amber_seconds' => $this->amber_duration_seconds,
                'all_red_seconds' => $this->all_red_duration_seconds,
            ],
            'is_active' => $this->is_active,
            'sequence_order' => $this->sequence_order,
            'notes' => $this->notes,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}

