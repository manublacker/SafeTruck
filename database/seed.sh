#!/bin/bash
export DATABASE_URL="postgresql://postgres.bxhduayxffanioaclzrd:SafeTruck2025!@aws-1-us-east-2.pooler.supabase.com:5432/postgres"
./node_modules/.bin/ts-node docker-seed.ts
