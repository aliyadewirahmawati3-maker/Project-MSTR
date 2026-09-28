<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('approaches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('intersection_id')->constrained('intersections')->cascadeOnDelete();
            $table->string('direction', 20); // WEST, NORTH, EAST, SOUTH
            $table->string('name', 100);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('approaches');
    }
};

