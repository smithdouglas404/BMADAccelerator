#!/bin/sh
# Creates the databases the memory services use, inside the app's own Postgres. Safe to run again.
set -e
for db in mem0 mem0_app letta; do
  psql -v ON_ERROR_STOP=1 -tc "SELECT 1 FROM pg_database WHERE datname = '$db'" | grep -q 1 \
    || psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE $db"
done
for db in mem0 letta; do
  psql -v ON_ERROR_STOP=1 -d "$db" -c "CREATE EXTENSION IF NOT EXISTS vector"
done
echo "memory databases ready"
