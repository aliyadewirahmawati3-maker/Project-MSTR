<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LaneResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'approach_id' => $this->approach_id,
            'lane_type' => $this->lane_type,
            'movement_rules' => $this->movement_rules,
            'order_index' => $this->order_index,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}

