dashboard "dx_requests_metrics" {
  title = "Team DX Requests Metrics (offline)"

  card {
    title = "Opened requests (total)"
    width = 4
    sql = <<EOQ
      SELECT      
        COUNT(*) AS requests
      FROM
        tracker;
    EOQ
  }

  card {
    title = "Closed requests (total)"
    width = 4
    sql = <<EOQ
      SELECT      
        COUNT(*) AS requests
      FROM
        tracker
      WHERE 
        "Data chiusura" IS NOT NULL AND "Data chiusura" != '';
    EOQ
  }

  card {
    title = "Avg Time to Close Requests"
    width = 4

    sql = <<EOQ
      SELECT
      ROUND(AVG(extract(epoch from (to_timestamp("Data chiusura", 'YYYY-MM-DD') - 
          to_timestamp("Data di invio", 'DD/MM/YY, HH24:MI')))/86400), 2) as "Days"
      FROM
        tracker
     WHERE "Data chiusura" != '' AND "Data chiusura" IS NOT NULL;
    EOQ
  }


  chart {
    title = "DX Requests per Day"
    type = "line"
    width = 12

    sql = <<EOQ
      SELECT
      DATE(to_timestamp("Data di invio", 'DD/MM/YY, HH24:MI')) as request_date,
        -- "Data chiusura", "Tipologia", "Priorità"
        COUNT(*) AS requests
      FROM
        tracker
      GROUP BY
        request_date
      ORDER BY
        request_date;
    EOQ
  }


  chart {
    title = "DX Requests per Category"
    type = "bar"
    width = 6

    sql = <<EOQ
      SELECT
      INITCAP("Tipologia") as category,
        -- "Data chiusura", "Tipologia", "Priorità"
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
        -- "Data chiusura", "Tipologia", "Priorità"
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

