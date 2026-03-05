dashboard "dx_requests_metrics" {
  title = "Team DX Requests Metrics (cached)"

  card {
    title = "Opened requests (total)"
    width = 3
    sql = <<EOQ
      SELECT      
        COUNT(*) AS requests
      FROM
        tracker;
    EOQ
  }

  card {
    title = "Closed requests (total)"
    width = 3
    sql = <<EOQ
      SELECT      
        COUNT(*) AS requests
      FROM
        tracker
      WHERE 
        "Data di scadenza" IS NOT NULL AND "Data di scadenza" != '';
    EOQ
  }

  card {
    title = "Avg Time to Close Requests"
    width = 3

    sql = <<EOQ
      SELECT
      ROUND(AVG(extract(epoch from (to_timestamp("Data di scadenza", 'YYYY-MM-DD') - 
          to_timestamp("Data di invio", 'DD/MM/YY, HH24:MI')))/86400), 2) as "Days"
      FROM
        tracker
     WHERE "Data di scadenza" != '' AND "Data di scadenza" IS NOT NULL;
    EOQ
  }

  card {
    title = "Requests Trend"
    width = 3

    sql = <<EOQ
      WITH daily_requests AS (
        SELECT
          DATE(to_timestamp("Data di invio", 'DD/MM/YY, HH24:MI')) as request_date,
          COUNT(*) AS requests
        FROM
          tracker
        GROUP BY
          request_date
      ),
      numbered_days AS (
        SELECT
          request_date,
          requests,
          ROW_NUMBER() OVER (ORDER BY request_date) as day_number
        FROM
          daily_requests
      ),
      regression AS (
        SELECT
          COUNT(*) as n,
          SUM(day_number) as sum_x,
          SUM(requests) as sum_y,
          SUM(day_number * requests) as sum_xy,
          SUM(day_number * day_number) as sum_xx
        FROM
          numbered_days
      ),
      trend_values AS (
        SELECT
          MIN(CASE WHEN nd.day_number = 1 THEN 
            (r.sum_xy * r.n - r.sum_x * r.sum_y) / (r.sum_xx * r.n - r.sum_x * r.sum_x) * nd.day_number + 
            (r.sum_y - (r.sum_xy * r.n - r.sum_x * r.sum_y) / (r.sum_xx * r.n - r.sum_x * r.sum_x) * r.sum_x) / r.n
          END) as first_value,
          MAX(CASE WHEN nd.day_number = r.n THEN 
            (r.sum_xy * r.n - r.sum_x * r.sum_y) / (r.sum_xx * r.n - r.sum_x * r.sum_x) * nd.day_number + 
            (r.sum_y - (r.sum_xy * r.n - r.sum_x * r.sum_y) / (r.sum_xx * r.n - r.sum_x * r.sum_x) * r.sum_x) / r.n
          END) as last_value
        FROM
          numbered_days nd
        CROSS JOIN
          regression r
      )
      SELECT
        ROUND(((last_value - first_value) / NULLIF(first_value, 0) * 100), 2) as "%"
      FROM
        trend_values;
    EOQ
  }

  chart {
    title = "DX Requests Frequency Trend (trend)"
    type = "line"
    width = 12

    sql = <<EOQ
      WITH daily_requests AS (
        SELECT
          DATE(to_timestamp("Data di invio", 'DD/MM/YY, HH24:MI')) as request_date,
          COUNT(*) AS requests
        FROM
          tracker
        GROUP BY
          request_date
      ),
      numbered_days AS (
        SELECT
          request_date,
          requests,
          ROW_NUMBER() OVER (ORDER BY request_date) as day_number
        FROM
          daily_requests
      ),
      regression AS (
        SELECT
          COUNT(*) as n,
          SUM(day_number) as sum_x,
          SUM(requests) as sum_y,
          SUM(day_number * requests) as sum_xy,
          SUM(day_number * day_number) as sum_xx
        FROM
          numbered_days
      )
      SELECT
        nd.request_date,
        nd.requests as actual_requests,
        ROUND((r.sum_xy * r.n - r.sum_x * r.sum_y) / (r.sum_xx * r.n - r.sum_x * r.sum_x) * nd.day_number + 
              (r.sum_y - (r.sum_xy * r.n - r.sum_x * r.sum_y) / (r.sum_xx * r.n - r.sum_x * r.sum_x) * r.sum_x) / r.n, 2) as trend
      FROM
        numbered_days nd
      CROSS JOIN
        regression r
      ORDER BY
        nd.request_date;
    EOQ
  }


  chart {
    title = "DX Requests per Category"
    type = "bar"
    width = 6

    sql = <<EOQ
      SELECT
      INITCAP("Tipologia") as category,
        -- "Data di scadenza", "Tipologia", "Priorità"
        COUNT(*) AS requests
      FROM
        tracker
      GROUP BY
        category
      ORDER BY
        category;
    EOQ
  }

  chart {
    title = "DX Requests per Priority"
    type = "bar"
    width = 6

    sql = <<EOQ
      SELECT
      INITCAP("Priorità") as priority,
        -- "Data di scadenza", "Tipologia", "Priorità"
        COUNT(*) AS requests
      FROM
        tracker
      GROUP BY
        priority
      ORDER BY
        priority;
    EOQ
  }

}

