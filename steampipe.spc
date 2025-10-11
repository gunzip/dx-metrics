connection "github" {
  plugin = "github"
  
  # Use GITHUB_TOKEN from environment variable
  # This token must be provided during both build and runtime
  token = env("GITHUB_TOKEN")
}

connection "csv" {
  plugin = "csv"
  
  # Point to the directory where CSV files will be mounted
  paths = ["/app/output/*.csv"]
}

connection "config" {
  plugin = "config"

  # All paths arguments default to CWD
  ini_paths  = [ "*.ini" ]
  json_paths = [ "*.json" ]
  yml_paths  = [ "*.yml", "*.yaml" ]
}
