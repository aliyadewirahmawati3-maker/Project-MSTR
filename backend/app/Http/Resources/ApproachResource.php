<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ApproachResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'intersection_id' => $this->intersection_id,
            'direction' => $this->direction,
            'name' => $this->name,
            'lanes' => LaneResource::collection($this->whenLoaded('lanes')),
            'camera' => new CameraResource($this->whenLoaded('camera')),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}

