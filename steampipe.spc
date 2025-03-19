connection "github" {
  plugin = "github"
  
  # Credentials will be provided via environment variables:
  # GITHUB_TOKEN when running the container
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
