<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CameraResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'approach_id' => $this->approach_id,
            'code' => $this->code,
            'name' => $this->name,
            'stream_url' => $this->stream_url,
            'status' => $this->status,
            'resolution' => $this->resolution,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}

