dashboard "dx_metrics" {
  title = "Team DX  Metrics (real time)"

  input "time_interval_days" {
    title = "Time Interval"
    width = 12
    option "30" { label="30 days" }
    option "60" { label="60 days" }
    option "120" { label="120 days" }
    option "240" { label="240 days" }
    option "300" { label="300 days" }
    option "360" { label="360 days" } 
    option "720" { label="720 days" } 
    option "1080 days" { label="1080 days" }
    option "1440 days" { label="1440 days" }
  }

  chart {
    title = "Pull Requests on IO-Infra"
    type  = "column"
    width = 12
    
    sql = <<EOQ
      WITH time_check AS (
        SELECT ($1 * INTERVAL '1 day') < INTERVAL '240 days' AS is_daily
      ),
      date_series AS (
          SELECT generate_series(
              NOW() - ($1 * INTERVAL '1 day'),
              NOW(),
              '1 day'::interval
          )::date AS date
          WHERE (SELECT is_daily FROM time_check)
          UNION ALL
          SELECT generate_series(
              date_trunc('week', NOW() - ($1 * INTERVAL '1 day'))::date,
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
              SUM(CASE WHEN (((gpr.result->>'author')::jsonb)->>'login')::text IN (
                  SELECT jsonb_array_elements_text(content->'dx_team_members')
                  FROM config.yml_file
              ) THEN 1 ELSE 0 END) AS pr_count_in,
              SUM(CASE WHEN (((gpr.result->>'author')::jsonb)->>'login')::text NOT IN (
                  SELECT jsonb_array_elements_text(content->'dx_team_members')
                  FROM config.yml_file
              ) THEN 1 ELSE 0 END) AS pr_count_not_in
          FROM select_from_dynamic_table('io-infra', 'github_pull_request') gpr
          WHERE
              (gpr.result->>'created_at')::timestamp >= NOW() - ($1 * INTERVAL '1 day')
              AND (gpr.result->>'created_at')::timestamp <= NOW()
          GROUP BY pr_date
      )
      SELECT 
          ds.date,
          COALESCE(pc.pr_count_in, 0) AS "DX PR",
          COALESCE(pc.pr_count_not_in, 0) AS "Non DX PR"
      FROM date_series ds
      LEFT JOIN pr_counts pc
          ON ds.date = pc.pr_date
      ORDER BY ds.date;
    EOQ

    args = [self.input.time_interval_days.value]
  }

  chart {
    type = "column"
    title = "DX Members Commits on Non DX Repositories"
    width = 12

    sql = <<EOQ

    SELECT 
        DATE((commit->'committer'->>'date')::timestamp) as committer_date,
        mq.member_name,
        COUNT(*) AS repository_commits
      FROM 
        github_search_commit gsc
      JOIN 
        generate_member_search_queries($1::int) mq
      ON 
        gsc.query = mq.search_string
      WHERE 
        -- Exclude repositories containing 'dx' or 'eng' and include those with 'pagopa'
        -- but not 'technology-radar'
        gsc.repository->>'full_name' ~ '^(?!.*dx)(?!.*eng).*pagopa(?!.*technology-radar)'
      GROUP BY 
        mq.member_name, committer_date
      ORDER BY 
        committer_date ASC;
    EOQ

    args = [self.input.time_interval_days.value]
  }

  table {
    title = "Pull Requests on IO-Infra"
    width = 6

    sql = <<EOQ
      SELECT 
        (((gpr.result->>'author')::jsonb)->>'login')::text AS author,
        gpr.result->>'created_at' AS created_at
      FROM 
        select_from_dynamic_table('io-infra', 'github_pull_request') gpr
      WHERE 
        (gpr.result->>'created_at')::timestamp >= NOW() - ($1 * INTERVAL '1 day')
        AND (gpr.result->>'created_at')::timestamp <= NOW()
      ORDER BY 
        (gpr.result->>'created_at')::timestamp DESC;
    EOQ

    args = [self.input.time_interval_days.value]
  }

  table {
    title = "DX Members Commit by Repository"
    width = 6
    
    sql = <<EOQ

      SELECT 
        mq.member_name,
        gsc.repository->>'full_name' AS full_name,
        COUNT(*) AS repository_commits
      FROM 
        github_search_commit gsc
      JOIN 
        generate_member_search_queries($1::int) mq
      ON 
        gsc.query = mq.search_string
      WHERE 
        POSITION('pagopa/' IN gsc.repository->>'full_name') = 1 AND
        POSITION('pagopa-dx' IN gsc.repository->>'full_name') = 0 AND
        POSITION('pagopa/terraform' IN gsc.repository->>'full_name') = 0
      GROUP BY 
        mq.member_name,
        gsc.repository->>'full_name'
      ORDER BY 
        mq.member_name,
        repository_commits DESC;
    EOQ

    args = [self.input.time_interval_days.value]
  }

  table {
    title = "Projects that adopts DX tooling"
    width = 12
    sql = <<EOQ
      SELECT 
        DISTINCT gsc.repository->>'full_name' AS repository
      FROM 
        github_search_code gsc
      WHERE 
        gsc.query = 'pagopa/dx org:pagopa'
        AND POSITION('dx' IN gsc.repository->>'full_name') = 0;  
      EOQ
  }

}