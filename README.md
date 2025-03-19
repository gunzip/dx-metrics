# Engineering Metrics Collector

The Engineering Metrics Collector is a straightforward tool designed to gather
and visualize engineering metrics. It leverages
[Steampipe](https://steampipe.io) to query databases and
[Powerpipe](https://powerpipe.io) to share insightful dashboards, providing a
comprehensive view of your engineering data.

## Build the container

Download buildx release for your platform from
https://github.com/docker/buildx/releases then run

```bash
buildx build -t metrics:latest .

# On Mac Arm64 platform, you can run for example
# $HOME/bin/buildx-v0.21.2.darwin-arm64 build -t metrics:latest .
```

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
- The `GITHUB_TOKEN` environment variable is used to authenticate with the
  GitHub API.

```bash
docker run -v steampipe-output:/app/output -v steampipe-data:/app/.steampipe -e GITHUB_TOKEN=ghp_XXXXXXXX -p 9033:9033 -p 9193:9193 metrics

# Or with the output directory mounted from the host:
# docker run -v $(pwd)/output:/app/output -v steampipe-data:/app/.steampipe -e GITHUB_TOKEN=ghp_XXXXXXXX -p 9033:9033 -p 9193:9193 metrics
```

You may also run the entrypoint script directly.
