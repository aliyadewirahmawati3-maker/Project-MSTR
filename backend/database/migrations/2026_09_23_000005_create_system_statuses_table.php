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
        Schema::create('system_statuses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('intersection_id')->constrained('intersections')->cascadeOnDelete();
            $table->string('current_mode', 50)->default('ATCS_NORMAL'); // ATCS_NORMAL, SIGAP_ADAPTIVE, FALLBACK_ATCS, OPERATOR_OVERRIDE
            $table->boolean('is_ai_healthy')->default(false);
            $table->boolean('is_cctv_healthy')->default(false);
            $table->text('notes')->nullable();
            $table->timestamp('recorded_at')->useCurrent();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('system_statuses');
    }
};

