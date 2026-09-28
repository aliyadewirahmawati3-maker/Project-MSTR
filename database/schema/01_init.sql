-- SIGAP PostgreSQL initialization (runs only on a new PostgreSQL volume).
-- Application tables and initial configuration belong exclusively to
-- Laravel migrations and seeders: php artisan migrate --seed.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
