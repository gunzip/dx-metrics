# variable "organization" {
#   type        = string
#   description = "GitHub Organization"
#   default     = "pagopa"
# }

dashboard "github_repository_metrics_online" {
  title = "Pull Requests Metrics (online)"

  input "time_interval" {
    title = "Time Interval"
    width = 6
    option "30 days" {}
    option "60 days" {}
    option "120 days" {}
    option "240 days" {}
    option "300 days" {}
    option "360 days" {}
  }

  input "repository_full_name" {
    title = "GitHub Repository"
    type = "text"
    width = 6
    placeholder = "pagopa/my-repo"

    # width = 4
    # type  = "select"
    # sql = <<EOQ
    #   SELECT
    #     name_with_owner AS value,
    #     name AS label
    #   FROM
    #     github_my_repository
    #   WHERE
    #     owner_login = 'pagopa' AND name != '.github'
    #   ORDER BY
    #     name ASC
    # EOQ
    # args = "[var.organization]"
  }

  container {
    chart {
      title = "PR Cycle Time in Days (moving average)"
      type  = "line"
      width = 6

      sql = <<EOQ
        WITH time_series AS (
            SELECT generate_series(
                (SELECT MIN(created_at::date) FROM github_pull_request 
                  WHERE repository_full_name = $1 AND created_at >= NOW() - CAST($2 AS interval)),
                CURRENT_DATE,
                '1 day'::interval
            )::date AS date
        ),
        pr_lead_times AS (
            SELECT 
                created_at,
                COALESCE(closed_at, CURRENT_TIMESTAMP) AS effective_closed_at,
                EXTRACT(EPOCH FROM (COALESCE(closed_at, CURRENT_TIMESTAMP) - created_at)) / 86400 AS lead_time_days
            FROM github_pull_request
            WHERE repository_full_name = $1
              AND author->>'login' NOT IN ('dependabot', 'dx-pagopa-bot')
              AND created_at >= NOW() - CAST($2 AS interval)
        ),
        min_date AS (
            SELECT MIN(date) as first_date FROM time_series
        )
        SELECT 
            t.date,
            CASE
                -- Only start showing values after we have at least some data (7 days after the start)
                WHEN t.date >= (SELECT first_date FROM min_date) + INTERVAL '7 days'
                THEN AVG(p.lead_time_days) FILTER (WHERE p.created_at::date <= t.date 
                    AND p.effective_closed_at::date >= t.date - INTERVAL '7 days')::numeric(10,2)
            END AS rolling_lead_time_days
        FROM time_series t
        LEFT JOIN pr_lead_times p ON p.created_at::date <= t.date
        GROUP BY t.date
        ORDER BY t.date      
      EOQ

      args = [self.input.repository_full_name.value, self.input.time_interval.value]
      
      series "rolling_lead_time_days" {
        title = "Cycle Time"
      }
    }

    # Nuovo grafico: PR aperte giornalmente
    chart {
      title = "Unmerged Pull Requests"
      type  = "line"
      width = 6
      
      sql = <<EOQ
        WITH daily_counts AS (
          SELECT 
            generate_series(
              (SELECT MIN(created_at::date) FROM github_pull_request 
                WHERE repository_full_name = $1 AND created_at >= NOW() - CAST($2 AS interval)),
              CURRENT_DATE,
              '1 day'::interval
            ) as date
        ),
        pr_status AS (
          SELECT 
            created_at::date as created_date,
            COALESCE(closed_at::date, CURRENT_DATE + 1) as closed_date
          FROM github_pull_request
          WHERE repository_full_name = $1
          AND created_at >= NOW() - CAST($2 AS interval)
        )
        SELECT 
          d.date,
          COUNT(*) FILTER (WHERE d.date >= p.created_date AND d.date < p.closed_date) as open_prs
        FROM daily_counts d
        LEFT JOIN pr_status p ON d.date >= p.created_date AND d.date < p.closed_date
        GROUP BY d.date
        ORDER BY d.date
      EOQ

      args = [self.input.repository_full_name.value, self.input.time_interval.value]
      
      series "open_prs" {
        title = "Open PRs"
      }
    }

    chart {
      title = "New Pull Requests"
      type  = "line"
      width = 6
      
      sql = <<EOQ
        WITH date_series AS (
          SELECT generate_series(
              NOW() - CAST($2 AS interval),
              NOW(),
              '1 day'::interval
          )::date AS date
        )
        SELECT 
            ds.date,
            COUNT(gpr.created_at) as pr_count
        FROM date_series ds
        LEFT JOIN github_pull_request gpr
            ON ds.date = gpr.created_at::date
            AND gpr.repository_full_name = $1
        GROUP BY ds.date
        ORDER BY ds.date;
      EOQ

      args = [self.input.repository_full_name.value, self.input.time_interval.value]
      
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
            created_at::date as date,
            COUNT(*) as daily_count
          FROM github_pull_request
          WHERE repository_full_name = $1
          AND created_at >= NOW() - CAST($2 AS interval)
          GROUP BY created_at::date
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
          -- COALESCE(d.daily_count, 0) as daily_count,
          SUM(COALESCE(d.daily_count, 0)) OVER (ORDER BY t.date) as cumulative_count
        FROM time_series t
        LEFT JOIN daily_pr_counts d ON t.date = d.date
        ORDER BY t.date
      EOQ

      args = [self.input.repository_full_name.value, self.input.time_interval.value]
      
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
          DATE(created_at) AS day,
          -- ROUND(AVG(additions), 2) AS "Average Additions per PR",
          ROUND(
              AVG(AVG(additions)) OVER (
                  ORDER BY DATE(created_at)
                  ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
              ), 2
          ) AS "Rolling Average Additions per PR"
        FROM 
            github_pull_request 
        WHERE 
            repository_full_name = $1
            AND created_at >= NOW() - CAST($2 AS interval)
        GROUP BY 
            DATE(created_at)
        ORDER BY 
            day;
      EOQ

      args = [self.input.repository_full_name.value, self.input.time_interval.value]
      
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
        DATE(created_at) AS day,
        -- ROUND(AVG(total_comments_count), 2) AS "Average Comments per PR",
        AVG( ROUND(AVG(total_comments_count), 2) ) OVER (
            ORDER BY DATE(created_at)
            ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
        ) AS "Rolling Average Comments per PR"
        FROM 
            github_pull_request 
        WHERE 
            repository_full_name = $1
            AND created_at >= NOW() - CAST($2 AS interval)
        GROUP BY 
            DATE(created_at)
        ORDER BY 
            day;
      EOQ

      args = [self.input.repository_full_name.value, self.input.time_interval.value]      
    }

    chart {
      title = "Pull Requests Comments by Size (moving average)"
      type  = "line"
      width = 12

      sql = <<EOQ
        SELECT
            DATE(created_at) AS day,
            -- ROUND(
            --    AVG(total_comments_count) / NULLIF(AVG(additions), 0), 2
            -- ) AS "Comments per Addition",
            ROUND(
                AVG(
                    AVG(total_comments_count) / NULLIF(AVG(additions), 0)
                ) OVER (
                    ORDER BY DATE(created_at)
                    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
                ), 2
            ) AS "Rolling Average Comments per Addition"
        FROM 
            github_pull_request 
        WHERE 
            repository_full_name = $1
            AND created_at >= NOW() - CAST($2 AS interval)
        GROUP BY 
            DATE(created_at)
        ORDER BY 
            day;
      EOQ

      args = [self.input.repository_full_name.value, self.input.time_interval.value]      
    }

  } # container
} # dashboard