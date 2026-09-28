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
        Schema::create('lanes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('approach_id')->constrained('approaches')->cascadeOnDelete();
            $table->string('lane_type', 20); // outer, inner
            $table->string('movement_rules', 100); // e.g. LEFT_OR_STRAIGHT, STRAIGHT_OR_RIGHT
            $table->integer('order_index')->default(1);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('lanes');
    }
};

