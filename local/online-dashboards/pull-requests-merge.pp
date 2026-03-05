# variable "organization" {
#   type        = string
#   description = "GitHub Organization"
#   default     = "pagopa"
# }

dashboard "github_repository_pr_merge_time" {
  title = "Pull Requests Approve to Merge Time (real time)"

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
      title = "PR Merge Time (moving average)"
      type  = "line"
      width = 12

      sql = <<EOQ
        WITH time_series AS (
            SELECT generate_series(
                (SELECT MIN((p.merged_at)::date) 
                FROM github_pull_request AS p
                WHERE p.repository_full_name = $1
                  AND (p.merged_at)::date >= NOW() - CAST($2 AS interval)),
                CURRENT_DATE,
                '1 day'::interval
            )::date AS date
        ),
        pr_lead_times_v1 AS (
          SELECT 
              (t.merged_at)::timestamp AS merged_at,
              t.author,
              t.submitted_at
          FROM (
              SELECT 
                  p.merged_at,
                  r.author,
                  r.submitted_at,
                  ROW_NUMBER() OVER (
                      PARTITION BY p.repository_full_name, p.number 
                      ORDER BY r.submitted_at ASC
                  ) as rn
              FROM github_pull_request p 
              INNER JOIN github_pull_request_review r
                  ON p.repository_full_name = r.repository_full_name
                  AND p.number = r.number
              WHERE
                  r.repository_full_name = $1
                  AND (r.submitted_at)::timestamp >= NOW() - CAST($2 AS INTERVAL)
                  AND p.merged_at::timestamp >= NOW() - CAST($2 AS interval)
                  AND r.state = 'APPROVED'
                  AND p.merged_at IS NOT NULL
          ) t
          WHERE t.rn = 1
        ),
        pr_lead_times AS (
          SELECT s.*, EXTRACT(EPOCH FROM (
              (s.merged_at)::timestamp
            - (s.submitted_at)::timestamp
          )) / 86400 AS lead_time_days
          FROM pr_lead_times_v1 s
        ),
        min_date AS (
            SELECT MIN(date) AS first_date FROM time_series
        )
        SELECT             
            t.date,
            CASE
                -- Moving average
                WHEN t.date >= (SELECT first_date FROM min_date) + INTERVAL '7 days'
                THEN AVG(p.lead_time_days) FILTER (WHERE p.merged_at::date <= t.date 
                    AND p.submitted_at::date >= t.date - INTERVAL '7 days')::numeric(10,2)
            END AS rolling_lead_time_days
          FROM time_series t
          INNER JOIN pr_lead_times p ON (p.merged_at::date <= t.date)
          -- does not work without querying the author
          WHERE p.author::text != ''
            GROUP BY t.date
            ORDER BY t.date        
      EOQ

      args = [
              with.config.rows[0].repository_full_name,
              self.input.time_interval.value]
      
      series "rolling_review_time" {
        title = "Review Time"
      }
    }


} # dashboard
