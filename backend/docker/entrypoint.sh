#!/bin/sh
set -eu

cd /var/www/html
mkdir -p storage/app/private storage/app/public storage/framework/cache/data \
    storage/framework/sessions storage/framework/views storage/logs bootstrap/cache

# A persisted vendor volume can outlive the image or composer.lock. Reconcile it
# before booting Laravel; installation failures must stop startup visibly.
composer install --prefer-dist --no-interaction --no-progress --optimize-autoloader

exec "$@"
