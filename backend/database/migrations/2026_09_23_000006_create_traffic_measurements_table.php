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
        Schema::create('traffic_measurements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('camera_id')->constrained('cameras')->cascadeOnDelete();
            $table->foreignId('approach_id')->constrained('approaches')->cascadeOnDelete();
            $table->foreignId('lane_id')->nullable()->constrained('lanes')->nullOnDelete();
            $table->integer('vehicle_count')->default(0);
            // Komposisi kelas kendaraan: motor, mobil, bus, truk, ambulans, pemadam
            $table->json('vehicle_class_counts')->nullable();
            $table->decimal('occupancy_percentage', 5, 2)->nullable(); // Estimasi kepadatan zona (%)
            $table->decimal('queue_length_meters', 8, 2)->nullable();
            $table->integer('waiting_time_seconds')->nullable();
            $table->timestamp('measured_at')->useCurrent();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('traffic_measurements');
    }
};

