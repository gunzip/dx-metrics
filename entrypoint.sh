#!/bin/bash
set -e

# Debug message
echo "Entrypoint script is running"

# This in case we don't run in a container
steampipe query *.sql --install-dir .steampipe

steampipe service start --install-dir .steampipe

./export.sh

powerpipe server --mod-location dashboards
