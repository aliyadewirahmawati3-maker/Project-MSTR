<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class IntersectionResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'location' => $this->location,
            'description' => $this->description,
            'approaches' => ApproachResource::collection($this->whenLoaded('approaches')),
            'latest_status' => new SystemStatusResource($this->whenLoaded('latestSystemStatus')),
            'signal_phases' => SignalPhaseResource::collection($this->whenLoaded('signalPhases')),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}

