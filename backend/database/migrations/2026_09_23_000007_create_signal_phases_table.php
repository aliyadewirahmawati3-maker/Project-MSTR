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
        Schema::create('signal_phases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('intersection_id')->constrained('intersections')->cascadeOnDelete();
            $table->string('phase_code', 50); // e.g. PHASE_EW, PHASE_NS
            $table->string('name', 100); // e.g. Fase Barat - Timur
            $table->integer('default_duration_seconds')->default(30); // Parameter simulasi awal prototype
            $table->integer('min_duration_seconds')->default(15); // Batas minimum hijau prototype (15s)
            $table->integer('max_duration_seconds')->default(60); // Batas maksimum hijau prototype (60s)
            $table->integer('amber_duration_seconds')->default(3); // Kuning 3s
            $table->integer('all_red_duration_seconds')->default(2); // All-red 2s
            $table->boolean('is_active')->default(false);
            $table->integer('sequence_order')->default(1);
            $table->text('notes')->nullable(); // Catatan disclaimer parameter simulasi
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('signal_phases');
    }
};

