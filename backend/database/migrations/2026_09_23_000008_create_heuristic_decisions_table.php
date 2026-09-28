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
        Schema::create('heuristic_decisions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('intersection_id')->constrained('intersections')->cascadeOnDelete();
            $table->foreignId('signal_phase_id')->constrained('signal_phases')->cascadeOnDelete();
            $table->integer('proposed_duration_seconds');
            $table->integer('current_cycle_seconds')->nullable();
            $table->text('reason')->nullable();
            $table->json('decision_payload')->nullable(); // Skor antrean, parameter masukan
            $table->string('status', 30)->default('PROPOSED'); // PROPOSED, APPLIED, SKIPPED
            $table->timestamp('decided_at')->useCurrent();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('heuristic_decisions');
    }
};

