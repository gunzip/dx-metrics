# variable "organization" {
#   type        = string
#   description = "GitHub Organization"
#   default     = "pagopa"
# }

dashboard "iac_metrics" {
  title = "IaC Pull Requests Metrics (cached)"

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

  container {
    chart {
      title = "IaC PR Cycle Time (moving average)"
      type  = "line"
      width = 6

      sql = <<EOQ
        WITH time_series AS (
            SELECT generate_series(
                (SELECT MIN((p.result->>'created_at')::date) 
                FROM select_from_dynamic_table($1, 'iac_pr_lead_time') AS p
                WHERE p.result->>'repository_full_name' = $2 
                  AND (p.result->>'created_at')::date >= NOW() - CAST($3 AS interval)),
                CURRENT_DATE,
                '1 day'::interval
            )::date AS date
        ),
        pr_lead_times AS (
            SELECT 
                (p.result->>'created_at')::timestamp AS created_at,
                (p.result->>'merged_at')::timestamp AS merged_at,
                EXTRACT(EPOCH FROM (
                    (p.result->>'merged_at')::timestamp
                  - (p.result->>'created_at')::timestamp
                )) / 86400 AS lead_time_days
            FROM select_from_dynamic_table($1, 'github_pull_request') p
            WHERE p.result->>'repository_full_name' = $2
              -- Filter out bots
              -- AND (((p.result->>'author')::jsonb)->>'login')::text
              --  NOT IN ('renovate-pagopa', 'dependabot', 'dx-pagopa-bot')
              -- Only for PR merged in the latest N days
              AND (p.result->>'merged_at')::timestamp >= NOW() - CAST($3 AS interval)
              AND p.result->>'created_at' != '' AND p.result->>'merged_at' != ''
              AND p.result->>'created_at' != '<nil>' AND p.result->>'merged_at' != '<nil>'
        ),
        min_date AS (
            SELECT MIN(date) AS first_date FROM time_series
        )
        SELECT 
            t.date,
            CASE
                -- Moving average
                WHEN t.date >= (SELECT first_date FROM min_date) + INTERVAL '7 days'
                THEN AVG(p.lead_time_days) FILTER (WHERE p.created_at::date <= t.date 
                    AND p.merged_at::date >= t.date - INTERVAL '7 days')::numeric(10,2)
            END AS rolling_lead_time_days
        FROM time_series t
        LEFT JOIN pr_lead_times p ON (p.created_at::date <= t.date)
        GROUP BY t.date
        ORDER BY t.date;     
      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name,
              self.input.time_interval.value]
      
      series "rolling_lead_time_days" {
        title = "Cycle Time"
      }
    }

    chart {
      title = "IaC PR Cycle Time (linear regression)"
      type  = "line"
      width = 6

      sql = <<EOQ
        WITH pr_lead_times AS (
            SELECT 
                (p.result->>'created_at')::date AS created_date,
                EXTRACT(EPOCH FROM (
                    (p.result->>'merged_at')::timestamp
                  - (p.result->>'created_at')::timestamp
                )) / 86400 AS lead_time_days,
                ROW_NUMBER() OVER (ORDER BY (p.result->>'created_at')::date) AS x
            FROM select_from_dynamic_table($1, 'github_pull_request') p
            WHERE p.result->>'repository_full_name' = $2
              AND (p.result->>'merged_at')::timestamp >= NOW() - CAST($3 AS interval)
              AND p.result->>'created_at' != '' AND p.result->>'merged_at' != ''
              AND p.result->>'created_at' != '<nil>' AND p.result->>'merged_at' != '<nil>'
        ),
        stats AS (
            SELECT
                COUNT(*) AS n,
                AVG(x) AS x_avg,
                AVG(lead_time_days) AS y_avg,
                SUM((x - (SELECT AVG(x) FROM pr_lead_times)) * 
                    (lead_time_days - (SELECT AVG(lead_time_days) FROM pr_lead_times))) AS numerator,
                SUM(POWER(x - (SELECT AVG(x) FROM pr_lead_times), 2)) AS denominator
            FROM pr_lead_times
        ),
        regression AS (
            SELECT
                CASE 
                    WHEN denominator != 0 THEN numerator / denominator 
                    ELSE 0 
                END AS slope,
                y_avg - (CASE 
                    WHEN denominator != 0 THEN numerator / denominator 
                    ELSE 0 
                END * x_avg) AS intercept
            FROM stats
        )
        SELECT 
            p.created_date AS date,
            (r.slope * p.x + r.intercept)::numeric(10,2) AS trend_line
        FROM pr_lead_times p
        CROSS JOIN regression r
        ORDER BY p.created_date;
      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name,
              self.input.time_interval.value]
      
      series "trend_line" {
        title = "Trend"
      }
    }

    chart {
      title = "Supervised vs Unsupervised IaC PRs (Cumulative)"
      type  = "line"
      width = 6
        
      sql = <<EOQ
        SELECT 
          run_date,
          pr_type,
          SUM(daily_count) OVER (PARTITION BY pr_type ORDER BY run_date) AS cumulative_count
        FROM (
          SELECT 
            DATE((p.result->>'created_at')::timestamp) AS run_date,
            CASE 
              WHEN COALESCE(TRIM(p.result->>'target_authors'), '') != '' THEN 'Supervised PRs'
              ELSE 'Unsupervised PRs'
            END AS pr_type,
            COUNT(*) AS daily_count
          FROM 
            select_from_dynamic_table($1, 'iac_pr_lead_time') p
          WHERE 
            p.result->>'repository_full_name' = $2
            AND (p.result->>'created_at')::timestamp >= NOW() - CAST($3 AS interval)
            AND p.result->>'created_at' != '' 
            AND p.result->>'created_at' != '<nil>'
          GROUP BY 
            DATE((p.result->>'created_at')::timestamp),
            CASE
              WHEN COALESCE(TRIM(p.result->>'target_authors'), '') != '' THEN 'Supervised PRs'
              ELSE 'Unsupervised PRs'
            END
        ) daily_counts
        ORDER BY 
          run_date, pr_type;
      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name,
              self.input.time_interval.value]
      
      series "supervised_count" {
        title = "Supervised PRs"
      }
      series "unsupervised_count" {
        title = "Unsupervised PRs"
      }
    }

    chart {
      title = "IaC PRs Count Over Time"
      type  = "line"
      width = 6
        
      sql = <<EOQ
        SELECT 
          DATE_TRUNC('week', (p.result->>'created_at')::timestamp)::date AS week,
          'PR Count' AS pr_type,
          COUNT(*) AS pr_count
        FROM 
          select_from_dynamic_table($1, 'iac_pr_lead_time') p
        WHERE 
          p.result->>'repository_full_name' = $2
          AND (p.result->>'created_at')::timestamp >= NOW() - CAST($3 AS interval)
          AND p.result->>'created_at' != '' 
          AND p.result->>'created_at' != '<nil>'
        GROUP BY 
          DATE_TRUNC('week', (p.result->>'created_at')::timestamp)::date
        ORDER BY 
          week ASC;
      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name,
              self.input.time_interval.value]
      
      series "pr_count" {
        title = "PR Count"
      }
    }
  }
}