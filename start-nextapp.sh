#!/bin/bash
# Start Next.js dev server with proper environment variables

cd /workspaces/dx-metrics/nextapp

# Check if PostgreSQL is running
if ! docker ps | grep -q dx-metrics-db-1; then
    echo "⚠️  PostgreSQL is not running. Starting it..."
    cd /workspaces/dx-metrics
    docker-compose up -d db
    echo "⏳ Waiting for PostgreSQL to be ready..."
    sleep 3
    cd /workspaces/dx-metrics/nextapp
fi

# Set environment variables
export DATABASE_URL="postgresql://dxmetrics:dxmetrics@localhost:5432/dxmetrics"
export AUTH_SECRET="local-dev-secret-not-for-production"
export AUTH_TRUST_HOST="true"
export NEXTAUTH_URL="${NEXTAUTH_URL:-http://localhost:3000}"
export SKIP_AUTH="true"
export NODE_ENV="development"

echo "🚀 Starting Next.js development server..."
pnpm dev
