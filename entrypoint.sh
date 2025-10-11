#!/bin/bash
set -e

# Debug message
echo "Entrypoint script is running"

# Check if GITHUB_TOKEN is set
if [ -z "$GITHUB_TOKEN" ]; then
    echo "Error: GITHUB_TOKEN environment variable is not set."
    echo "Please run the container with: docker run -e GITHUB_TOKEN=your-token ..."
    exit 1
fi

# This in case we don't run in a container
steampipe query *.sql --install-dir .steampipe

steampipe service start --install-dir .steampipe

./export.sh

powerpipe server --mod-location dashboards
