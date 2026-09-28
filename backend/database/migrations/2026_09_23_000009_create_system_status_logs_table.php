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
        Schema::create('system_status_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('intersection_id')->constrained('intersections')->cascadeOnDelete();
            $table->string('previous_mode', 50)->nullable();
            $table->string('new_mode', 50);
            $table->text('reason')->nullable();
            $table->json('payload')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('system_status_logs');
    }
};

