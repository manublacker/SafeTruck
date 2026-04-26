#!/bin/bash
export PGPASSWORD="SafeTruck2025!"
CONN="postgresql://postgres.bxhduayxffanioaclzrd@aws-1-us-east-2.pooler.supabase.com:5432/postgres"
psql "$CONN" -c "SET statement_timeout = 0;" -f "$1"
