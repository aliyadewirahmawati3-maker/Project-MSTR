<?php

use Illuminate\Support\Facades\Artisan;

Artisan::command('sigap:status', function () {
    $this->info('SIGAP Backend Status: Baseline Ready');
})->purpose('Cek status baseline SIGAP CLI');

