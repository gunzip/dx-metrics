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
    --select repository_full_name,number,created_at,closed_at,author,additions,total_comments_count  \
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
