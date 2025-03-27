# variable "organization" {
#   type        = string
#   description = "GitHub Organization"
#   default     = "pagopa"
# }

dashboard "github_repository_metrics" {
  title = "Pull Requests Metrics (cached)"

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
      title = "Merged PR Cycle Time (moving average)"
      type  = "line"
      width = 6

      sql = <<EOQ
        WITH time_series AS (
            SELECT generate_series(
                (SELECT MIN((p.result->>'created_at')::date) 
                FROM select_from_dynamic_table($1, 'github_pull_request') AS p
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
              AND (((p.result->>'author')::jsonb)->>'login')::text
                NOT IN ('renovate-pagopa', 'dependabot', 'dx-pagopa-bot')
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
      title = "Unmerged Pull Requests"
      type  = "line"
      width = 6
      
      sql = <<EOQ
        WITH daily_counts AS (
          SELECT 
              generate_series(
                  (SELECT MIN((result->>'created_at')::timestamp)::date 
                  FROM select_from_dynamic_table($1, 'github_pull_request') 
                  WHERE result->>'repository_full_name' = $2 
                    AND (result->>'created_at')::timestamp >= NOW() - CAST($3 AS interval)),
                  CURRENT_DATE,
                  '1 day'::interval
              ) AS date
        ),
        pr_status AS (
            SELECT 
                (result->>'created_at')::timestamp::date AS created_date,
                COALESCE(NULLIF(result->>'closed_at', '<nil>')::timestamp::date, CURRENT_DATE + 1) AS closed_date
            FROM select_from_dynamic_table($1, 'github_pull_request')
            WHERE result->>'repository_full_name' = $2
              AND (result->>'created_at')::timestamp >= NOW() - CAST($3 AS interval)
        )
        SELECT 
            d.date,
            COUNT(*) FILTER (WHERE d.date >= p.created_date AND d.date < p.closed_date) AS open_prs
        FROM daily_counts d
        LEFT JOIN pr_status p ON d.date >= p.created_date AND d.date < p.closed_date
        GROUP BY d.date
        ORDER BY d.date;
      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name,
              self.input.time_interval.value]
      
      series "open_prs" {
        title = "Open PRs"
      }
    }

    chart {
      title = "New Pull Requests"
      type  = "column"
      width = 6
      
      sql = <<EOQ
        WITH time_check AS (
            SELECT CAST($3 AS interval) < INTERVAL '240 days' AS is_daily
        ),
        date_series AS (
            SELECT generate_series(
                NOW() - CAST($3 AS interval),
                NOW(),
                '1 day'::interval
            )::date AS date
            WHERE (SELECT is_daily FROM time_check)
            UNION ALL
            SELECT generate_series(
                date_trunc('week', NOW() - CAST($3 AS interval))::date,
                date_trunc('week', NOW())::date,
                '7 days'::interval
            )::date AS date
            WHERE NOT (SELECT is_daily FROM time_check)
        ),
        pr_counts AS (
            SELECT 
                CASE 
                    WHEN (SELECT is_daily FROM time_check)
                    THEN (gpr.result->>'created_at')::timestamp::date
                    ELSE date_trunc('week', (gpr.result->>'created_at')::timestamp)::date
                END AS pr_date,
                COUNT(*) AS pr_count
            FROM select_from_dynamic_table($1, 'github_pull_request') gpr
            WHERE gpr.result->>'repository_full_name' = $2
            AND (gpr.result->>'created_at')::timestamp >= NOW() - CAST($3 AS interval)
            AND (gpr.result->>'created_at')::timestamp <= NOW()
            GROUP BY pr_date
        )
        SELECT 
            ds.date,
            COALESCE(pc.pr_count, 0) AS pr_count
        FROM date_series ds
        LEFT JOIN pr_counts pc
            ON ds.date = pc.pr_date
        ORDER BY ds.date;
      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name,
              self.input.time_interval.value]
      
      series "pr_count" {
        title = "New PRs by day"
      }
    }

    chart {
      title = "Cumulated New Pull Requests"
      type  = "line"
      width = 6
      
      sql = <<EOQ
        WITH daily_pr_counts AS (
          SELECT 
              (result->>'created_at')::timestamp::date AS date,
              COUNT(*) AS daily_count
          FROM select_from_dynamic_table($1, 'github_pull_request')
          WHERE result->>'repository_full_name' = $2
            AND (result->>'created_at')::timestamp >= NOW() - CAST($3 AS interval)
          GROUP BY (result->>'created_at')::timestamp::date
        ),
        time_series AS (
            SELECT generate_series(
                (SELECT MIN(date) FROM daily_pr_counts),
                CURRENT_DATE,
                '1 day'::interval
            )::date AS date
        )
        SELECT 
            t.date,
            -- COALESCE(d.daily_count, 0) AS daily_count,
            SUM(COALESCE(d.daily_count, 0)) OVER (ORDER BY t.date) AS cumulative_count
        FROM time_series t
        LEFT JOIN daily_pr_counts d ON t.date = d.date
        ORDER BY t.date;
      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name,
              self.input.time_interval.value]
      
      series "cumulative_count" {
        title = "Cumulated New PRs"
      }
    }

    chart {
      title = "Pull Requests Size (moving average)"
      type  = "line"
      width = 6

      sql = <<EOQ
       SELECT
        DATE(NULLIF(result->>'created_at', '<nil>')::timestamp) AS day,
        -- ROUND(AVG((result->>'additions')::numeric), 2) AS "Average Additions per PR",
        ROUND(
            AVG(AVG((result->>'additions')::numeric)) OVER (
                ORDER BY DATE(NULLIF(result->>'created_at', '<nil>')::timestamp)
                ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
            ), 2
        ) AS "Rolling Average Additions per PR"
        FROM 
            select_from_dynamic_table($1, 'github_pull_request') 
        WHERE 
            result->>'repository_full_name' = $2
            AND (NULLIF(result->>'created_at', '<nil>')::timestamp) >= NOW() - CAST($3 AS interval)
        GROUP BY 
            DATE(NULLIF(result->>'created_at', '<nil>')::timestamp)
        ORDER BY 
            day;
      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name,
              self.input.time_interval.value]
      
      series "pull_requests_size" {
        title = "Pull Requests Size"
        color = "#2196F3"
      }
    }

    chart {
      title = "Pull Requests Comments (moving average)"
      type  = "line"
      width = 6

      sql = <<EOQ
        SELECT
            DATE(NULLIF(result->>'created_at', '<nil>')::timestamp) AS day,
            -- ROUND(AVG((result->>'total_comments_count')::numeric), 2) AS "Average Comments per PR",
            AVG(ROUND(AVG((result->>'total_comments_count')::numeric), 2)) OVER (
                ORDER BY DATE(NULLIF(result->>'created_at', '<nil>')::timestamp)
                ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
            ) AS "Rolling Average Comments per PR"
        FROM 
            select_from_dynamic_table($1, 'github_pull_request') 
        WHERE 
            result->>'repository_full_name' = $2
            AND (NULLIF(result->>'created_at', '<nil>')::timestamp) >= NOW() - CAST($3 AS interval)
        GROUP BY 
            DATE(NULLIF(result->>'created_at', '<nil>')::timestamp)
        ORDER BY 
            day;
      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name,
              self.input.time_interval.value]
    }    

    chart {
      title = "Pull Requests Comments by Size (moving average)"
      type  = "line"
      width = 6

      sql = <<EOQ
        SELECT
          DATE(NULLIF(result->>'created_at', '<nil>')::timestamp) AS day,
          -- ROUND(
          --     AVG(NULLIF(result->>'total_comments_count', '<nil>')::numeric) / NULLIF(AVG(NULLIF(result->>'additions', '<nil>')::numeric), 0), 2
          -- ) AS "Comments per Addition",
          ROUND(
              AVG(
                  AVG(NULLIF(result->>'total_comments_count', '<nil>')::numeric) / NULLIF(AVG(NULLIF(result->>'additions', '<nil>')::numeric), 0)
              ) OVER (
                  ORDER BY DATE(NULLIF(result->>'created_at', '<nil>')::timestamp)
                  ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
              ), 2
          ) AS "Rolling Average Comments per Addition"
        FROM 
            select_from_dynamic_table($1, 'github_pull_request') 
        WHERE 
            result->>'repository_full_name' = $2
            AND (NULLIF(result->>'created_at', '<nil>')::timestamp) >= NOW() - CAST($3 AS interval)
        GROUP BY 
            DATE(NULLIF(result->>'created_at', '<nil>')::timestamp)
        ORDER BY 
            day;
      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name,
              self.input.time_interval.value]
    }


    chart {
      title = "Pull Requests Size (additions)"
      type  = "bar"
      width = 6

      sql = <<EOQ
      WITH data AS (
          SELECT 
              (result->>'additions')::numeric AS additions
          FROM 
              select_from_dynamic_table($1, 'github_pull_request')
          WHERE 
              result->>'repository_full_name' = $2
              AND (NULLIF(result->>'created_at', '<nil>')::timestamp) >= NOW() - CAST($3 AS interval)
              AND (result->>'additions')::numeric IS NOT NULL
      ),
      bucketed AS (
          SELECT 
              CASE 
                  WHEN additions <= 50 THEN '1 - 50'
                  WHEN additions <= 200 THEN '50 - 200'
                  WHEN additions <= 500 THEN '200 - 500'
                  WHEN additions <= 1000 THEN '500 - 1000'
                  ELSE '> 1000'
              END AS size_range,
              additions
          FROM data
      )
      SELECT 
          size_range,
          COUNT(*) AS pr_count
      FROM 
          bucketed
      GROUP BY 
          size_range
      ORDER BY 
          CASE 
              WHEN size_range = '1 - 50' THEN 1
              WHEN size_range = '50 - 200' THEN 2
              WHEN size_range = '200 - 500' THEN 3
              WHEN size_range = '500 - 1000' THEN 4
              WHEN size_range = '> 1000' THEN 5
          END;
      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name,
              self.input.time_interval.value]
      
      series "pull_requests_size" {
        title = "Pull Requests Size"
        color = "#2196F3"
      }
    }

    chart {
      title = "Slowest Pull Requests"
      type  = "table"
      width = 12

      sql = <<EOQ
        SELECT 
           p.result->>'title' AS title,
           -- (((p.result->>'author')::jsonb)->>'login')::text AS author,
           ROUND(EXTRACT(EPOCH FROM (
                (p.result->>'merged_at')::timestamp - 
                (p.result->>'created_at')::timestamp
            )) / 86400, 2) AS lead_time_days,
          p.result->>'number' AS number,
          (p.result->>'created_at')::timestamp AS created_at,
          (p.result->>'merged_at')::timestamp AS merged_at
        FROM select_from_dynamic_table($1, 'github_pull_request') p
        WHERE p.result->>'repository_full_name' = $2
          AND (((p.result->>'author')::jsonb)->>'login')::text 
            NOT IN ('renovate-pagopa', 'dependabot', 'dx-pagopa-bot')
          AND (p.result->>'merged_at')::timestamp >= NOW() - CAST($3 AS interval)
          AND p.result->>'created_at' != '' AND p.result->>'merged_at' != ''
          AND p.result->>'created_at' != '<nil>' AND p.result->>'merged_at' != '<nil>'
        ORDER BY lead_time_days DESC
      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name,
              self.input.time_interval.value]
      
      series "rolling_lead_time_days" {
        title = "Cycle Time"
      }
    }

  } # container
} # dashboard
