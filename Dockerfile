# Use Ubuntu 20.04 as base image
FROM ubuntu:20.04

# Set working directory
WORKDIR /app

# Set environment variables to avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive
ENV GITHUB_TOKEN=${GITHUB_TOKEN}

# Combine RUN commands and optimize package installation
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    bash \
    jq \
    git \
    sqlite3 \
    ca-certificates \
    tzdata \
    wget && \
    # Install Steampipe and Powerpipe in one layer
    curl -fsSL https://steampipe.io/install/steampipe.sh | sh && \
    curl -fsSL https://powerpipe.io/install/powerpipe.sh | sh && \
    # Create non-root user in same layer
    groupadd -r appgroup && \
    useradd -r -g appgroup appuser && \
    # Clean up apt cache
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Steampipe export command for GitHub
ENV TERM=xterm
RUN curl -fsSL https://steampipe.io/install/export.sh | sh -s github latest /usr/local/bin

# Install yq
RUN curl -L https://github.com/mikefarah/yq/releases/download/v4.30.8/yq_linux_amd64 \
    -o /usr/bin/yq && \
    chmod +x /usr/bin/yq

# Assign permissions to appuser
RUN chown -R appuser:appgroup . && \
    chmod -R 755 .

# Create home directory for non-root user
RUN mkdir -p /home/appuser && \
    chown -R appuser:appgroup /home/appuser && \
    chmod -R 755 /home/appuser

# Switch to non-root user
USER appuser

# Install plugins and manage config before declaring volume
RUN steampipe plugin install csv github config --install-dir .steampipe

# Remove default steampipe configuration
RUN rm -f .steampipe/config/*.spc

COPY --chown=appuser:appgroup config.yaml entrypoint.sh init.sql dx.sql export.sh ./
COPY --chown=appuser:appgroup dashboards/ ./dashboards/
COPY --chown=appuser:appgroup steampipe.spc .steampipe/config/config.spc

RUN chmod +x entrypoint.sh

# Create output directory
RUN mkdir -p output && \
    chown -R appuser:appgroup output && \
    chmod -R 755 output

# Initializes the embedded PostgreSQL database
RUN steampipe query *.sql --install-dir .steampipe

# Declare volume after all modifications to .steampipe
VOLUME ["/app/.steampipe", "/app/output"]

# Expose ports
EXPOSE 9193 9033

# Set entrypoint
ENTRYPOINT ["./entrypoint.sh"]
