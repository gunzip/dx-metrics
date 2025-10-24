#!/bin/bash

# Check if GITHUB_TOKEN is set
if [ -z "$GITHUB_TOKEN" ]; then
    echo "Error: GITHUB_TOKEN environment variable is not set."
    echo "Please set it with: export GITHUB_TOKEN='your-github-token'"
    exit 1
fi

CONFIG_FILE="${1:-config.yaml}"

# Check if yq is installed
if ! command -v yq &> /dev/null; then
    echo "yq is required but not installed. Please install it first."
    exit 1
fi

# Read organization and repositories from config.yaml
ORGANIZATION=$(yq '.organization' "$CONFIG_FILE")
REPOSITORIES=$(yq '.repositories[]' "$CONFIG_FILE")

export_workflow_run_table() {
  local repository_full_name=$1
  local output_file=$2

  # Skip if file already exists
  if [ -f "${output_file}" ]; then
    echo "Skipping export for ${repository_full_name} workflow runs - file ${output_file} already exists"
    return
  fi

  echo "Exporting workflow runs for repository ${repository_full_name} to ${output_file}"

  steampipe_export_github github_actions_repository_workflow_run \
    --where "repository_full_name='${repository_full_name}'" \
    --select created_at,repository_full_name,conclusion,updated_at,status,id,workflow_id  \
    | tee "${output_file}"
}

export_workflow_table() {
  local repository_full_name=$1
  local output_file=$2

  # Skip if file already exists
  if [ -f "${output_file}" ]; then
    echo "Skipping export for ${repository_full_name} workflows - file ${output_file} already exists"
    return
  fi

  echo "Exporting workflows for repository ${repository_full_name} to ${output_file}"

  steampipe_export_github github_workflow \
    --where "repository_full_name='${repository_full_name}'" \
    --select id,name,repository_full_name,pipeline  \
    | tee "${output_file}"
}

export_pull_request_table() {
  local repository_full_name=$1
  local output_file=$2

  # Skip if file already exists
  if [ -f "${output_file}" ]; then
    echo "Skipping export for ${repository_full_name} pull requests - file ${output_file} already exists"
    return
  fi

  echo "Exporting pull requests for repository ${repository_full_name} to ${output_file}"

  steampipe_export_github github_pull_request \
    --where "repository_full_name='${repository_full_name}'" \
    --select repository_full_name,title,number,review_decision,created_at,closed_at,merged_at,merged_by,author,additions,total_comments_count  \
    | tee "${output_file}"
}

# Create output directory if it doesn't exist
mkdir -p output

# Loop through repositories and export data
for repo in $REPOSITORIES; do
  repo_full_name="${ORGANIZATION}/${repo}"
  echo "Processing repository: ${repo_full_name}"
  
  # Export workflow runs
  export_workflow_run_table "$repo_full_name" "output/${repo}_github_actions_repository_workflow_run.csv"
  
  # Export workflows
  export_workflow_table "$repo_full_name" "output/${repo}_github_workflow.csv"

  # Export pull requests
  export_pull_request_table "$repo_full_name" "output/${repo}_github_pull_request.csv"
done

echo "Export completed successfully!"

# Read dx_team_members from config.yaml and join with commas
DX_TEAM_MEMBERS=$(yq '.dx_team_members[]' "$CONFIG_FILE" | tr '\n' ',' | sed 's/,$//')

# Read dx_repo from config.yaml
DX_REPO=$(yq '.dx_repo' "$CONFIG_FILE")

# Loop through repositories and calculate PR lead time for infra
for repo in $REPOSITORIES; do
  # Skip if repository matches dx_repo
  if [ "$repo" = "$DX_REPO" ]; then
    echo "Skipping IAC PR lead time calculation for ${repo} (dx_repo)"
    continue
  fi
  
  output_file="output/${repo}_iac_pr_lead_time.csv"
  
  # Skip if file already exists
  if [ -f "${output_file}" ]; then
    echo "Skipping export for ${repository_full_name} workflows - file ${output_file} already exists"
    continue
  fi

  echo "Calculating IAC PR lead time for repository ${repo}"
  
  pnpx tsx pr_lead_time.ts "$ORGANIZATION" "$repo" infra "$DX_TEAM_MEMBERS" > "$output_file"
  
  echo "IAC PR lead time saved to ${output_file}"
done

echo "PR lead time calculation completed successfully!"

### For each repository in config.yaml, use terrawiz to scan the exported repositories and generate a CSV report

for repo in $REPOSITORIES; do

# Skip if file already exists
  if [ -f "output/${repo}_terraform_modules.csv" ]; then
      echo "Skipping terrawiz scan for ${repo} - file output/${repo}_terraform_modules.csv already exists"
      continue
  fi

  echo "Running terrawiz scan for repository ${repo}"

  docker run --rm -e GITHUB_TOKEN="$GITHUB_TOKEN" \
    -v $(pwd)/output:/output ghcr.io/efemaer/terrawiz:latest scan github:pagopa/$repo \
    -f csv -e /output/${repo}_terraform_modules.csv

done
