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
        Schema::create('cameras', function (Blueprint $table) {
            $table->id();
            $table->foreignId('approach_id')->unique()->constrained('approaches')->cascadeOnDelete();
            $table->string('code', 50)->unique();
            $table->string('name', 100); // e.g. CCTV Barat
            $table->string('stream_url')->nullable(); // null on initial prototype
            $table->string('status', 30)->default('UNCONFIGURED'); // UNCONFIGURED / OFFLINE
            $table->string('resolution', 50)->default('1920x1080');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('cameras');
    }
};

