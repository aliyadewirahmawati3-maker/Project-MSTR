FROM php:8.3-cli-alpine

WORKDIR /var/www/html

ARG COMPOSER_PROCESS_TIMEOUT=1200
ENV COMPOSER_ALLOW_SUPERUSER=1 \
    COMPOSER_PROCESS_TIMEOUT=${COMPOSER_PROCESS_TIMEOUT}

RUN apk add --no-cache postgresql-dev unzip curl git \
    && docker-php-ext-install -j1 pdo_pgsql pgsql pcntl bcmath

# Copy composer from official image
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Cache the locked dependencies, including PHPUnit for local development.
COPY composer.json composer.lock ./
RUN composer install --prefer-dist --no-interaction --no-progress --no-scripts

COPY . .
COPY docker/entrypoint.sh /usr/local/bin/sigap-entrypoint
# Windows checkouts may use CRLF. Keep the entrypoint outside the bind mount.
RUN sed -i 's/\r$//' /usr/local/bin/sigap-entrypoint \
    && chmod +x /usr/local/bin/sigap-entrypoint

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS http://localhost:8000/api/health || exit 1

ENTRYPOINT ["sigap-entrypoint"]
CMD ["php", "-S", "0.0.0.0:8000", "-t", "public"]

