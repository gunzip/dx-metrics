import { db } from "@/db";
import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const repository = searchParams.get("repository") || "io-infra";
  const days = parseInt(searchParams.get("days") || "120");
  const org = process.env.ORGANIZATION || "pagopa";
  const fullName = `${org}/${repository}`;

  try {
    // Compute the reference date (latest data point) for this repository
    const maxDateResult = await db.execute(sql`
      SELECT COALESCE(MAX(GREATEST(created_at, merged_at)), NOW()) AS max_date
      FROM iac_pr_lead_times
      WHERE repository_full_name = ${fullName}
    `);
    const maxDate = (maxDateResult.rows[0] as { max_date: string }).max_date;

    // IaC PR Lead Time (moving average)
    const leadTimeMovingAvg = await db.execute(sql`
      WITH pr_lead_times AS (
        SELECT created_at, merged_at,
          EXTRACT(EPOCH FROM (merged_at - created_at)) / 86400 AS lead_time_days
        FROM iac_pr_lead_times
        WHERE repository_full_name = ${fullName}
          AND merged_at >= ${maxDate}::timestamptz - MAKE_INTERVAL(days => ${days})
          AND created_at IS NOT NULL AND merged_at IS NOT NULL
          AND title != 'Version Packages'
      ),
      time_series AS (
        SELECT generate_series(
          (SELECT MIN(created_at::date) FROM pr_lead_times),
          (SELECT MAX(merged_at::date) FROM pr_lead_times),
          '1 day'::interval
        )::date AS date
      ),
      rolling AS (
        SELECT t.date,
          CASE WHEN t.date >= (SELECT MIN(date) FROM time_series) + INTERVAL '7 days'
            THEN ROUND(AVG(p.lead_time_days) FILTER (
              WHERE p.created_at::date <= t.date AND p.merged_at::date >= t.date - INTERVAL '7 days'
            )::numeric, 2)
          END AS rolling_lead_time_days
        FROM time_series t LEFT JOIN pr_lead_times p ON p.created_at::date <= t.date
        GROUP BY t.date
      )
      SELECT date, rolling_lead_time_days
      FROM rolling
      WHERE rolling_lead_time_days IS NOT NULL
      ORDER BY date
    `);

    // IaC PR Lead Time (trend)
    const leadTimeTrend = await db.execute(sql`
      WITH pr_lead_times AS (
        SELECT created_at::date AS created_date,
          EXTRACT(EPOCH FROM (merged_at - created_at)) / 86400 AS lead_time_days,
          ROW_NUMBER() OVER (ORDER BY created_at::date) AS x
        FROM iac_pr_lead_times
        WHERE repository_full_name = ${fullName}
          AND merged_at >= ${maxDate}::timestamptz - MAKE_INTERVAL(days => ${days})
          AND created_at IS NOT NULL AND merged_at IS NOT NULL
          AND title != 'Version Packages'
      ),
      stats AS (SELECT COUNT(*) AS n, AVG(x) AS x_avg, AVG(lead_time_days) AS y_avg FROM pr_lead_times),
      regression AS (
        SELECT CASE WHEN SUM(POWER(p.x - s.x_avg, 2)) != 0
          THEN SUM((p.x - s.x_avg) * (p.lead_time_days - s.y_avg)) / SUM(POWER(p.x - s.x_avg, 2))
          ELSE 0 END AS slope, s.y_avg, s.x_avg
        FROM pr_lead_times p CROSS JOIN stats s GROUP BY s.x_avg, s.y_avg
      )
      SELECT p.created_date AS date,
        ROUND((r.slope * p.x + (r.y_avg - r.slope * r.x_avg))::numeric, 2) AS trend_line
      FROM pr_lead_times p CROSS JOIN regression r ORDER BY p.created_date
    `);

    // Supervised vs Unsupervised IaC PRs (cumulative)
    const supervisedVsUnsupervised = await db.execute(sql`
      SELECT run_date, pr_type,
        SUM(daily_count) OVER (PARTITION BY pr_type ORDER BY run_date) AS cumulative_count
      FROM (
        SELECT created_at::date AS run_date,
          CASE WHEN COALESCE(array_length(target_authors, 1), 0) > 0 THEN 'Supervised PRs'
            ELSE 'Unsupervised PRs' END AS pr_type,
          COUNT(*) AS daily_count
        FROM iac_pr_lead_times
        WHERE repository_full_name = ${fullName}
          AND created_at >= ${maxDate}::timestamptz - MAKE_INTERVAL(days => ${days})
          AND created_at IS NOT NULL AND title != 'Version Packages'
        GROUP BY created_at::date,
          CASE WHEN COALESCE(array_length(target_authors, 1), 0) > 0 THEN 'Supervised PRs'
            ELSE 'Unsupervised PRs' END
      ) daily_counts ORDER BY run_date, pr_type
    `);

    // IaC PRs Count Over Time
    const prsOverTime = await db.execute(sql`
      SELECT DATE_TRUNC('week', created_at)::date AS week,
        COUNT(*) AS pr_count
      FROM iac_pr_lead_times
      WHERE repository_full_name = ${fullName}
        AND created_at >= ${maxDate}::timestamptz - MAKE_INTERVAL(days => ${days})
        AND created_at IS NOT NULL AND title != 'Version Packages'
      GROUP BY DATE_TRUNC('week', created_at)::date ORDER BY week
    `);

    // IaC PRs by Reviewer
    const prsByReviewer = await db.execute(sql`
      WITH pr_reviewers AS (
        SELECT repository_full_name, created_at, merged_at, title,
          unnest(target_authors) AS reviewer
        FROM iac_pr_lead_times
        WHERE repository_full_name = ${fullName}
          AND created_at >= ${maxDate}::timestamptz - MAKE_INTERVAL(days => ${days})
          AND created_at IS NOT NULL AND title != 'Version Packages'
          AND COALESCE(array_length(target_authors, 1), 0) > 0
      )
      SELECT reviewer, COUNT(*) AS total_prs,
        COUNT(*) FILTER (WHERE merged_at IS NOT NULL) AS merged_prs,
        ROUND(AVG(CASE WHEN merged_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (merged_at - created_at)) / 86400 END)::numeric, 2) AS avg_lead_time_days
      FROM pr_reviewers WHERE reviewer != 'web-flow'
      GROUP BY reviewer ORDER BY total_prs DESC
    `);

    return NextResponse.json({
      leadTimeMovingAvg: leadTimeMovingAvg.rows,
      leadTimeTrend: leadTimeTrend.rows,
      supervisedVsUnsupervised: supervisedVsUnsupervised.rows,
      prsOverTime: prsOverTime.rows,
      prsByReviewer: prsByReviewer.rows,
    });
  } catch (error) {
    console.error("IaC dashboard error:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}
