# Engineering Metrics Collector

The Engineering Metrics Collector is a straightforward tool designed to gather
and visualize engineering metrics. It leverages
[Steampipe](https://steampipe.io) to query databases and
[Powerpipe](https://powerpipe.io) to share insightful dashboards, providing a
comprehensive view of your engineering data.

## Build the container

**Important**: Ensure you have your `GITHUB_TOKEN` environment variable set on your host machine before building. The token is needed during the build phase for Steampipe plugin installation and database initialization.

Download buildx release for your platform from
https://github.com/docker/buildx/releases then run

```bash
# Using Docker BuildKit with secret mount (required for security)
DOCKER_BUILDKIT=1 docker build --secret id=github_token,env=GITHUB_TOKEN -t metrics:latest .

# If using buildx:
DOCKER_BUILDKIT=1 buildx build --secret id=github_token,env=GITHUB_TOKEN -t metrics:latest .

# On Mac Arm64 platform with downloaded buildx binary:
DOCKER_BUILDKIT=1 $HOME/bin/buildx-v0.21.2.darwin-arm64 build --secret id=github_token,env=GITHUB_TOKEN -t metrics:latest .
```

**Security Note**: This build uses Docker BuildKit's `--secret` mount feature exclusively, which provides the `GITHUB_TOKEN` during build without storing it in any image layer or build cache. This approach:

- Never exposes the token in image history
- Doesn't leak the token in intermediate layers
- Passes security linting (no ARG or ENV for secrets)
- Requires `DOCKER_BUILDKIT=1` to be set

The build process will attempt to initialize the Steampipe database and install plugins. If this fails during build, don't worry - the initialization will be retried when the container starts. The token is also required at runtime for ongoing GitHub API operations.

## Getting the GitHub token

To export data from GitHub, you need to create a personal access token. Follow
the instructions at
https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token
to create a token with the `repo` scope.

## Export data

Use the `./export.sh` script to export data from the connected sources (ie.
GitHub, Jira, etc). The script will create an `output` directory with the
exported data in CSV format.

```bash
GITHUB_TOKEN=ghp_XXXXXXXX ./export.sh
```

## Run the container

Running the container will start the Powerpipe server on port 9033 and the
Steampipe server on port 9193.

- The `output` directory is mounted to the container to access the exported
  data.
- The `steampipe-data` volume is mounted to the container to persist the
  Steampipe configuration.
- The `GITHUB_TOKEN` environment variable is **required** at runtime to authenticate with the
  GitHub API for data export and Steampipe queries.

**Important**: You MUST pass the `GITHUB_TOKEN` at runtime using the `-e` flag. The container will exit with an error if the token is not provided. Never hardcode it or commit it to version control.

```bash
# Using the GITHUB_TOKEN from your host environment (recommended)
docker run -v steampipe-output:/app/output -v steampipe-data:/app/.steampipe -e GITHUB_TOKEN="${GITHUB_TOKEN}" -p 9033:9033 -p 9193:9193 metrics

# Or with the output directory mounted from the host:
docker run -v $(pwd)/output:/app/output -v steampipe-data:/app/.steampipe -e GITHUB_TOKEN="${GITHUB_TOKEN}" -p 9033:9033 -p 9193:9193 metrics

# Alternatively, you can specify the token directly (less secure):
# docker run -v steampipe-output:/app/output -v steampipe-data:/app/.steampipe -e GITHUB_TOKEN=ghp_XXXXXXXX -p 9033:9033 -p 9193:9193 metrics
```

**Note**: If you forget to pass the `GITHUB_TOKEN`, the container will fail immediately with a clear error message.

You may also run the entrypoint script directly.
