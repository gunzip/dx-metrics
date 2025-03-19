dashboard "dx_metrics" {
  title = "Team DX  Metrics (online)"

  input "time_interval_days" {
    title = "Time Interval"
    width = 6
    option "30" { label="30 days" }
    option "60" { label="60 days" }
    option "120" { label="120 days" }
    option "240" { label="240 days" }
    option "300" { label="300 days" }
    option "360" { label="360 days" } 
  }

  chart {
    type = "column"
    title = "DX Members Commits on Non DX Repositories"

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
    title = "DX Members Commit by Repository"
    width = 12
    
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
        POSITION('pagopa' IN gsc.repository->>'full_name') = 1
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
        gsc.query = 'pagopa/dx AND org:pagopa'
        AND POSITION('dx' IN gsc.repository->>'full_name') = 0;  
      EOQ
  }

}