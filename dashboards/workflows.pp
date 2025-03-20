dashboard "workflow_metrics" {
  title = "Workflow  Metrics (offline)"

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
      title = "Deployment Frequency to Production"
      type  = "line"
      width = 6
        
      sql = <<EOQ
        SELECT 
          DATE(wr.result->>'created_at') as run_date,
          COUNT(*) as deployment_count
        FROM 
          select_from_dynamic_table($1, 'github_actions_repository_workflow_run') wr
        JOIN 
          select_from_dynamic_table($1, 'github_workflow') w 
            ON (wr.result->>'workflow_id')::bigint = (w.result->>'id')::bigint
          AND w.result->>'repository_full_name' = wr.result->>'repository_full_name'
        WHERE 
          w.result->>'repository_full_name' = $2
          AND (POSITION('deploy' IN LOWER(w.result->>'name')) > 0
            OR POSITION('release' IN LOWER(w.result->>'name')) > 0
            OR POSITION('apply' IN LOWER(w.result->>'name')) > 0)
          AND TRIM(wr.result->>'conclusion') = 'success'
          AND (wr.result->>'created_at')::timestamp >= NOW() - CAST($3 AS interval)
        GROUP BY 
          DATE(wr.result->>'created_at')
        ORDER BY 
          run_date ASC;
      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name,
              self.input.time_interval.value]
      
      series "deployment_count" {
        title = "Deployments"
      }
    }

    chart {
      title = "DX VS Non DX Pipeline Runs (Cumulative)"
      type  = "line"
      width = 6
        
      sql = <<EOQ
        SELECT 
          run_date,
          pipeline_type,
          SUM(daily_count) OVER (PARTITION BY pipeline_type ORDER BY run_date) AS cumulative_count
        FROM (
          SELECT 
            DATE((wr.result->>'created_at')::timestamp) AS run_date,
            CASE 
              WHEN (POSITION('pagopa/dx' IN w.result->>'pipeline') > 0) THEN 'DX Pipelines'
              ELSE 'Non-DX Pipelines'
            END AS pipeline_type,
            COUNT(*) AS daily_count
          FROM 
            select_from_dynamic_table($1, 'github_actions_repository_workflow_run') wr
          JOIN 
            select_from_dynamic_table($1, 'github_workflow') w ON (wr.result->>'workflow_id')::bigint = (w.result->>'id')::bigint
            AND w.result->>'repository_full_name' = wr.result->>'repository_full_name'
          WHERE 
            w.result->>'repository_full_name' = $2
            AND (wr.result->>'created_at')::timestamp >= NOW() - CAST($3 AS interval)
            AND w.result->>'name' != 'CodeQL'
          GROUP BY 
            DATE((wr.result->>'created_at')::timestamp),
            CASE
              WHEN (POSITION('pagopa/dx' IN w.result->>'pipeline') > 0) THEN 'DX Pipelines' 
              ELSE 'Non-DX Pipelines'
            END
        ) daily_counts
        ORDER BY 
          run_date, pipeline_type;
      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name,
              self.input.time_interval.value]
      
      series "dx_count" {
        title = "DX pipeline runs"
      }
      series "non_dx_count" {
        title = "Non-DX pipeline runs"
      }
    }

    chart {
      title = "Pipelines Failures"
      type  = "bar"
      width = 6
        
      sql = <<EOQ
        SELECT 
          CONCAT(CASE WHEN POSITION('pagopa/dx' IN w.result->>'pipeline') > 0
            THEN 'DX ' ELSE '' END, w.result->>'name') AS workflow_name,
          COUNT(*) as failed_runs
        FROM 
          select_from_dynamic_table($1, 'github_actions_repository_workflow_run') wr
        JOIN 
          select_from_dynamic_table($1, 'github_workflow') w 
            ON (wr.result->>'workflow_id')::bigint = (w.result->>'id')::bigint
          AND w.result->>'repository_full_name' = wr.result->>'repository_full_name'
        WHERE
          w.result->>'repository_full_name' = $2
          AND TRIM(wr.result->>'conclusion') = 'failure'
          AND (wr.result->>'created_at')::timestamp >= NOW() - CAST($3 AS interval)
          AND w.result->>'name' != 'CodeQL'
        GROUP BY 
          workflow_name
        ORDER BY 
          workflow_name ASC;
      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name,
              self.input.time_interval.value]
      
      series "failed_runs" {
        title = "Pipeline failed runs"
        color = "rgb(201, 125, 155)"
      }
    }

    chart {
      title = "Pipelines Average Duration (minutes)"
      type  = "bar"
      width = 6
        
      sql = <<EOQ

        SELECT
          CONCAT(CASE WHEN POSITION('pagopa/dx' IN w.result->>'pipeline') > 0
            THEN 'DX ' ELSE '' END, w.result->>'name') AS workflow_name,
          AVG(EXTRACT(EPOCH FROM ((wr.result->>'updated_at')::timestamp 
            - (wr.result->>'created_at')::timestamp))) / 60 AS average_duration_minutes
        FROM
          select_from_dynamic_table($1, 'github_actions_repository_workflow_run') wr
        JOIN
          select_from_dynamic_table($1, 'github_workflow') w
        ON
          (wr.result->>'workflow_id')::bigint = (w.result->>'id')::bigint
          AND wr.result->>'repository_full_name' = w.result->>'repository_full_name'
        WHERE
          wr.result->>'repository_full_name' = $2
          AND wr.result->>'status' = 'completed' AND TRIM(wr.result->>'conclusion') = 'success'
          AND (wr.result->>'updated_at')::timestamp >= CURRENT_DATE - CAST($3 AS interval)
          AND (wr.result->>'updated_at')::timestamp <= CURRENT_DATE
          AND w.result->>'name' != 'CodeQL'
        GROUP BY
          workflow_name
        ORDER BY
          workflow_name;

      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name,
              self.input.time_interval.value]

      series "average_duration_minutes" {
        title = "Average Duration (minutes)"
      }
    }

    chart {
      title = "Pipelines Run Count"
      type  = "bar"
      width = 6
        
      sql = <<EOQ

        SELECT
            CONCAT(CASE WHEN POSITION('pagopa/dx' IN w.result->>'pipeline') > 0 
            THEN 'DX ' ELSE '' END, w.result->>'name') AS workflow_name,
          COUNT(*) AS run_count
        FROM
          select_from_dynamic_table($1, 'github_actions_repository_workflow_run') wr
        JOIN
          select_from_dynamic_table($1, 'github_workflow') w
        ON
          (wr.result->>'workflow_id')::bigint = (w.result->>'id')::bigint
          AND wr.result->>'repository_full_name' = w.result->>'repository_full_name'
        WHERE
          wr.result->>'repository_full_name' = $2
          AND wr.result->>'status' = 'completed' AND TRIM(wr.result->>'conclusion') = 'success'
          AND (wr.result->>'updated_at')::timestamp >= CURRENT_DATE - CAST($3 AS interval)
          AND (wr.result->>'updated_at')::timestamp <= CURRENT_DATE
          AND w.result->>'name' != 'CodeQL'
        GROUP BY
          workflow_name
        ORDER BY
          workflow_name;

      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name,
              self.input.time_interval.value]

      series "cumulative_duration_minutes" {
        title = "Cumulative Duration (minutes)"
      }
    }

    chart {
      title = "Pipelines Cumulative Duration (minutes)"
      type  = "bar"
      width = 6
        
      sql = <<EOQ

        SELECT
          CONCAT(CASE WHEN POSITION('pagopa/dx' IN w.result->>'pipeline') > 0
            THEN 'DX ' ELSE '' END, w.result->>'name') AS workflow_name,
          SUM(EXTRACT(EPOCH FROM ((wr.result->>'updated_at')::timestamp 
            - (wr.result->>'created_at')::timestamp))) / 60 AS cumulative_duration_minutes
        FROM
          select_from_dynamic_table($1, 'github_actions_repository_workflow_run') wr
        JOIN
          select_from_dynamic_table($1, 'github_workflow') w
        ON
          (wr.result->>'workflow_id')::bigint = (w.result->>'id')::bigint
          AND wr.result->>'repository_full_name' = w.result->>'repository_full_name'
        WHERE
          wr.result->>'repository_full_name' = $2
          AND wr.result->>'status' = 'completed' AND TRIM(wr.result->>'conclusion') = 'success'
          AND (wr.result->>'updated_at')::timestamp >= CURRENT_DATE - CAST($3 AS interval)
          AND (wr.result->>'updated_at')::timestamp <= CURRENT_DATE
          AND w.result->>'name' != 'CodeQL'
        GROUP BY
          workflow_name
        ORDER BY
          workflow_name;

      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name,
              self.input.time_interval.value]

      series "cumulative_duration_minutes" {
        title = "Cumulative Duration (minutes)"
      }
    }

    table {
      title = "Workflow Success/Failure Ratio"
      width = 12
      
      sql = <<EOQ
        SELECT 
          w.result->>'name' AS workflow_name,
          COUNT(*) AS total_runs,
          SUM(CASE WHEN TRIM(wr.result->>'conclusion') = 'success' THEN 1 ELSE 0 END) AS successful_runs,
          SUM(CASE WHEN TRIM(wr.result->>'conclusion') = 'failure' THEN 1 ELSE 0 END) AS failed_runs,
          ROUND(
              (SUM(CASE WHEN TRIM(wr.result->>'conclusion') = 'success' THEN 1 ELSE 0 END)::float / COUNT(*) * 100)::numeric, 
              2
          ) AS success_rate_percentage
        FROM select_from_dynamic_table($1, 'github_actions_repository_workflow_run') wr
        JOIN select_from_dynamic_table($1, 'github_workflow') w 
            ON (wr.result->>'workflow_id')::bigint = (w.result->>'id')::bigint
            AND wr.result->>'repository_full_name' = w.result->>'repository_full_name'
            AND TRIM(wr.result->>'conclusion') IN ('success', 'failure')
        WHERE wr.result->>'repository_full_name' = $2
        AND (wr.result->>'created_at')::timestamp >= NOW() - CAST($3 AS interval)
        AND w.result->>'name' != 'CodeQL'
        GROUP BY w.result->>'name'
        ORDER BY total_runs DESC;
      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name,
              self.input.time_interval.value]
      
      column "workflow_name" {
        display = "Workflow Name"
      }
      column "total_runs" {
        display = "Total Runs"
      }
      column "successful_runs" {
        display = "Successful Runs"
      }
      column "failed_runs" {
        display = "Failed Runs"
      }
      column "success_rate_percentage" {
        display = "Success Rate (%)"
      }
    }
  }
  
}