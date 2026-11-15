#!/bin/sh
# Creates the databases the memory services use, inside the app's own Postgres. Safe to run again.
set -e

# Data made by the old postgres:16 image (Debian) records an older text-sorting (collation) version
# than the pgvector image. Postgres then refuses CREATE DATABASE. Rebuild the text indexes and record
# the new version, once, for each database that is out of date.
for db in $(psql -At -c "SELECT datname FROM pg_database WHERE datallowconn AND datcollversion IS DISTINCT FROM pg_database_collation_actual_version(oid)"); do
  echo "refreshing collation version of $db"
  psql -v ON_ERROR_STOP=1 -d "$db" -c "REINDEX DATABASE \"$db\""
  psql -v ON_ERROR_STOP=1 -d "$db" -c "ALTER DATABASE \"$db\" REFRESH COLLATION VERSION"
done

for db in mem0 mem0_app letta; do
  psql -v ON_ERROR_STOP=1 -tc "SELECT 1 FROM pg_database WHERE datname = '$db'" | grep -q 1 \
    || psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE $db"
done
for db in mem0 letta; do
  psql -v ON_ERROR_STOP=1 -d "$db" -c "CREATE EXTENSION IF NOT EXISTS vector"
done
echo "memory databases ready"
