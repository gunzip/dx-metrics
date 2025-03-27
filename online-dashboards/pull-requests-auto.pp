# variable "organization" {
#   type        = string
#   description = "GitHub Organization"
#   default     = "pagopa"
# }

dashboard "github_repository_pr_without_review" {
  title = "Pull Requests Without Review (real time)"

  input "repository" {
    title = "GitHub Repository"
    type = "select"
    width = 6

    sql = <<-EOQ
      WITH repos AS (
        SELECT jsonb_array_elements_text((content->>'repositories')::jsonb) as repository
        FROM config.yml_file
        WHERE path LIKE '%config.yaml'
      )
      SELECT repository as label, repository as value
      FROM repos
      ORDER BY repository;
    EOQ
  }

  input "time_interval" {
    title = "Time Interval"
    width = 6
    option "30 days" {}
    option "60 days" {}
    option "120 days" {}
    option "240 days" {}
    option "300 days" {}
    option "360 days" {}
    option "720 days" {}
    option "1080 days" {}
    option "1440 days" {}
  }

  with "config" {
    sql = <<-EOQ
      SELECT
        concat(content->>'organization', '/', $1::text) as repository_full_name
      FROM
        config.yml_file
      WHERE
        path LIKE '%config.yaml';  
    EOQ

    args = [self.input.repository.value]
  }

  ##########################################


    chart {
      title = "PR Without Review"
      type  = "column"
      width = 12

      sql = <<EOQ

        SELECT 
            DATE_TRUNC('week', p.merged_at) AS week_start,
            COUNT(p.number) AS prs_without_review
        FROM 
            github_pull_request p
        LEFT JOIN 
            github_pull_request_review r 
            ON r.number = p.number 
            AND r.repository_full_name = p.repository_full_name
        WHERE 
            p.repository_full_name = $1
            AND r.author IS NULL
            AND p.merged_at > NOW() - CAST($2 as INTERVAL)
        GROUP BY 
            DATE_TRUNC('week', p.merged_at)
        ORDER BY 
            week_start

      EOQ

      args = [
              with.config.rows[0].repository_full_name,
              self.input.time_interval.value]
      
      series "rolling_review_time" {
        title = "Review Time"
      }
    }


} # dashboard
