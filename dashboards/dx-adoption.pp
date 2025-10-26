dashboard "dx_adoption_metrics" {
  title = "DX Tools Adoption Metrics"

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
      title = "DX Pipeline Adoption"
      type  = "pie"
      width = 6

      sql = <<EOQ
        WITH distinct_workflows AS (
          SELECT DISTINCT ON (result->>'name')
            result->>'name' as name,
            result->>'pipeline' as pipeline
          FROM 
            select_from_dynamic_table($1, 'github_workflow') 
          WHERE 
            result->>'repository_full_name' = $2
            AND result->>'name' != 'CodeQL'
            AND result->>'name' != 'Labeler'
        )
        SELECT 
          CASE 
            WHEN POSITION('pagopa/dx' IN pipeline) > 0 THEN 'DX Pipelines'
            ELSE 'Non-DX Pipelines'
          END AS pipeline_type,
          COUNT(*) AS pipeline_count
        FROM 
          distinct_workflows
        GROUP BY 
          CASE 
            WHEN POSITION('pagopa/dx' IN pipeline) > 0 THEN 'DX Pipelines'
            ELSE 'Non-DX Pipelines'
          END
        ORDER BY 
          pipeline_type;
      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name]
      
      series "pipeline_count" {
        title = "Workflows"
      }
    }

    chart {
      title = "DX Terraform Modules Adoption"
      type  = "pie"
      width = 6

      sql = <<EOQ
        WITH distinct_modules AS (
          SELECT DISTINCT ON (result->>'module')
            result->>'module' as module
          FROM 
            select_from_dynamic_table($1, 'terraform_modules')
          WHERE 
            result->>'repository' = $2
            AND result->>'module' NOT LIKE './%'
            AND result->>'module' NOT LIKE '../%'
        )
        SELECT 
          CASE 
            WHEN POSITION('pagopa-dx' IN module) > 0 OR POSITION('pagopa/dx' IN module) > 0 THEN 'DX Terraform Modules'
            ELSE 'Non-DX Terraform Modules'
          END AS module_type,
          COUNT(*) AS module_count
        FROM 
          distinct_modules
        GROUP BY 
          CASE 
            WHEN POSITION('pagopa-dx' IN module) > 0 OR POSITION('pagopa/dx' IN module) > 0 THEN 'DX Terraform Modules'
            ELSE 'Non-DX Terraform Modules'
          END
        ORDER BY 
          module_type;
      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name]
      
      series "module_count" {
        title = "Module Count"
      }
    }
    
  }

  container {
    table {
      title = "Workflows List"
      width = 6

      sql = <<EOQ
        SELECT DISTINCT ON (result->>'name')
          result->>'name' AS workflow_name,
          CASE 
            WHEN POSITION('pagopa/dx' IN result->>'pipeline') > 0 THEN '✓ DX'
            ELSE 'Non-DX'
          END AS pipeline_type
          -- , result->>'path' AS workflow_path
        FROM 
          select_from_dynamic_table($1, 'github_workflow') 
        WHERE 
          result->>'repository_full_name' = $2
          AND result->>'name' != 'CodeQL'
          AND result->>'name' != 'Labeler'
        ORDER BY 
          result->>'name',
          CASE 
            WHEN POSITION('pagopa/dx' IN result->>'pipeline') > 0 THEN 0
            ELSE 1
          END;
      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name]
    }

    table {
      title = "Terraform Modules List"
      width = 6

      sql = <<EOQ
        SELECT DISTINCT ON (result->>'module')
          result->>'module' AS module_name,
          CASE 
            WHEN POSITION('pagopa-dx' IN result->>'module') > 0 OR POSITION('pagopa/dx' IN result->>'module') > 0 THEN '✓ DX'
            ELSE 'Non-DX'
          END AS module_type,
          result->>'file_path' AS file_path
        FROM 
          select_from_dynamic_table($1, 'terraform_modules') 
        WHERE 
          result->>'repository' = $2
          AND result->>'module' NOT LIKE './%'
          AND result->>'module' NOT LIKE '../%'
        ORDER BY 
          result->>'module',
          CASE 
            WHEN POSITION('pagopa-dx' IN result->>'module') > 0 OR POSITION('pagopa/dx' IN result->>'module') > 0 THEN 0
            ELSE 1
          END;
      EOQ

      args = [self.input.repository.value,
              with.config.rows[0].repository_full_name]

    }
  }
}
