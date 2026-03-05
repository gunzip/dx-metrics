import { db } from "@/db";
import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const repository = searchParams.get("repository") || "dx";
  const days = parseInt(searchParams.get("days") || "120");
  const org = process.env.ORGANIZATION || "pagopa";
  const fullName = `${org}/${repository}`;

  try {
    const avgLeadTime = await db.execute(sql`
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (merged_at - created_at)) / 86400)::numeric, 2) AS value
      FROM pull_requests pr JOIN repositories r ON pr.repository_id = r.id
      WHERE r.full_name = ${fullName}
        AND pr.merged_at >= NOW() - MAKE_INTERVAL(days => ${days})
        AND pr.merged_at IS NOT NULL AND pr.created_at IS NOT NULL
        AND pr.author NOT IN ('renovate-pagopa', 'dependabot', 'dx-pagopa-bot')
    `);

    const totalPrs = await db.execute(sql`
      SELECT COUNT(*) AS value FROM pull_requests pr JOIN repositories r ON pr.repository_id = r.id
      WHERE r.full_name = ${fullName}
        AND pr.created_at >= NOW() - MAKE_INTERVAL(days => ${days})
        AND pr.author NOT IN ('renovate-pagopa', 'dependabot', 'dx-pagopa-bot')
    `);

    const totalComments = await db.execute(sql`
      SELECT COALESCE(SUM(total_comments_count), 0) AS value
      FROM pull_requests pr JOIN repositories r ON pr.repository_id = r.id
      WHERE r.full_name = ${fullName}
        AND pr.created_at >= NOW() - MAKE_INTERVAL(days => ${days})
        AND pr.author NOT IN ('renovate-pagopa', 'dependabot', 'dx-pagopa-bot')
    `);

    const commentsPerPr = await db.execute(sql`
      SELECT ROUND(SUM(total_comments_count)::numeric / NULLIF(COUNT(*), 0), 2) AS value
      FROM pull_requests pr JOIN repositories r ON pr.repository_id = r.id
      WHERE r.full_name = ${fullName}
        AND pr.created_at >= NOW() - MAKE_INTERVAL(days => ${days})
        AND pr.author NOT IN ('renovate-pagopa', 'dependabot', 'dx-pagopa-bot')
    `);

    const leadTimeMovingAvg = await db.execute(sql`
      WITH pr_lead_times AS (
        SELECT pr.created_at, pr.merged_at,
          EXTRACT(EPOCH FROM (pr.merged_at - pr.created_at)) / 86400 AS lead_time_days
        FROM pull_requests pr JOIN repositories r ON pr.repository_id = r.id
        WHERE r.full_name = ${fullName}
          AND pr.merged_at >= NOW() - MAKE_INTERVAL(days => ${days})
          AND pr.merged_at IS NOT NULL AND pr.created_at IS NOT NULL
          AND pr.author NOT IN ('renovate-pagopa', 'dependabot', 'dx-pagopa-bot')
      ),
      time_series AS (
        SELECT generate_series(
          (SELECT MIN(created_at::date) FROM pr_lead_times),
          CURRENT_DATE, '1 day'::interval
        )::date AS date
      )
      SELECT t.date,
        CASE WHEN t.date >= (SELECT MIN(date) FROM time_series) + INTERVAL '7 days'
          THEN ROUND(AVG(p.lead_time_days) FILTER (
            WHERE p.created_at::date <= t.date AND p.merged_at::date >= t.date - INTERVAL '7 days'
          )::numeric, 2)
        END AS rolling_lead_time_days
      FROM time_series t LEFT JOIN pr_lead_times p ON p.created_at::date <= t.date
      GROUP BY t.date ORDER BY t.date
    `);

    const leadTimeTrend = await db.execute(sql`
      WITH pr_lead_times AS (
        SELECT pr.created_at::date AS created_date,
          EXTRACT(EPOCH FROM (pr.merged_at - pr.created_at)) / 86400 AS lead_time_days,
          ROW_NUMBER() OVER (ORDER BY pr.created_at::date) AS x
        FROM pull_requests pr JOIN repositories r ON pr.repository_id = r.id
        WHERE r.full_name = ${fullName}
          AND pr.merged_at >= NOW() - MAKE_INTERVAL(days => ${days})
          AND pr.merged_at IS NOT NULL AND pr.created_at IS NOT NULL
          AND pr.author NOT IN ('renovate-pagopa', 'dependabot', 'dx-pagopa-bot')
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

    const mergedPrs = await db.execute(sql`
      WITH date_series AS (
        SELECT generate_series(
          (NOW() - MAKE_INTERVAL(days => ${days}))::date, CURRENT_DATE,
          CASE WHEN ${days} < 240 THEN '1 day'::interval ELSE '7 days'::interval END
        )::date AS date
      ),
      pr_counts AS (
        SELECT CASE WHEN ${days} < 240 THEN pr.merged_at::date
          ELSE date_trunc('week', pr.merged_at)::date END AS pr_date,
          COUNT(*) AS pr_count
        FROM pull_requests pr JOIN repositories r ON pr.repository_id = r.id
        WHERE r.full_name = ${fullName}
          AND pr.merged_at >= NOW() - MAKE_INTERVAL(days => ${days}) AND pr.merged_at IS NOT NULL
        GROUP BY pr_date
      )
      SELECT ds.date, COALESCE(pc.pr_count, 0) AS pr_count
      FROM date_series ds LEFT JOIN pr_counts pc ON ds.date = pc.pr_date ORDER BY ds.date
    `);

    const unmergedPrs = await db.execute(sql`
      WITH daily_counts AS (
        SELECT generate_series(
          (SELECT MIN(created_at::date) FROM pull_requests pr
           JOIN repositories r ON pr.repository_id = r.id
           WHERE r.full_name = ${fullName} AND pr.created_at >= NOW() - MAKE_INTERVAL(days => ${days})),
          CURRENT_DATE, '1 day'::interval
        )::date AS date
      ),
      pr_status AS (
        SELECT pr.created_at::date AS created_date,
          COALESCE(pr.closed_at::date, CURRENT_DATE + 1) AS closed_date
        FROM pull_requests pr JOIN repositories r ON pr.repository_id = r.id
        WHERE r.full_name = ${fullName} AND pr.created_at >= NOW() - MAKE_INTERVAL(days => ${days})
      )
      SELECT d.date, COUNT(*) FILTER (WHERE d.date >= p.created_date AND d.date < p.closed_date) AS open_prs
      FROM daily_counts d LEFT JOIN pr_status p ON d.date >= p.created_date AND d.date < p.closed_date
      GROUP BY d.date ORDER BY d.date
    `);

    const newPrs = await db.execute(sql`
      WITH date_series AS (
        SELECT generate_series(
          (NOW() - MAKE_INTERVAL(days => ${days}))::date, CURRENT_DATE,
          CASE WHEN ${days} < 240 THEN '1 day'::interval ELSE '7 days'::interval END
        )::date AS date
      ),
      pr_counts AS (
        SELECT CASE WHEN ${days} < 240 THEN pr.created_at::date
          ELSE date_trunc('week', pr.created_at)::date END AS pr_date,
          COUNT(*) AS pr_count
        FROM pull_requests pr JOIN repositories r ON pr.repository_id = r.id
        WHERE r.full_name = ${fullName} AND pr.created_at >= NOW() - MAKE_INTERVAL(days => ${days})
        GROUP BY pr_date
      )
      SELECT ds.date, COALESCE(pc.pr_count, 0) AS pr_count
      FROM date_series ds LEFT JOIN pr_counts pc ON ds.date = pc.pr_date ORDER BY ds.date
    `);

    const cumulatedNewPrs = await db.execute(sql`
      WITH daily_pr AS (
        SELECT pr.created_at::date AS date, COUNT(*) AS daily_count
        FROM pull_requests pr JOIN repositories r ON pr.repository_id = r.id
        WHERE r.full_name = ${fullName} AND pr.created_at >= NOW() - MAKE_INTERVAL(days => ${days})
        GROUP BY pr.created_at::date
      ),
      ts AS (SELECT generate_series((SELECT MIN(date) FROM daily_pr), CURRENT_DATE, '1 day'::interval)::date AS date)
      SELECT t.date, SUM(COALESCE(d.daily_count, 0)) OVER (ORDER BY t.date) AS cumulative_count
      FROM ts t LEFT JOIN daily_pr d ON t.date = d.date ORDER BY t.date
    `);

    const prSize = await db.execute(sql`
      SELECT pr.created_at::date AS day,
        ROUND(AVG(AVG(pr.additions)) OVER (
          ORDER BY pr.created_at::date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
        )::numeric, 2) AS rolling_avg_additions
      FROM pull_requests pr JOIN repositories r ON pr.repository_id = r.id
      WHERE r.full_name = ${fullName}
        AND pr.created_at >= NOW() - MAKE_INTERVAL(days => ${days}) AND pr.additions IS NOT NULL
      GROUP BY pr.created_at::date ORDER BY day
    `);

    const prComments = await db.execute(sql`
      SELECT pr.created_at::date AS day,
        ROUND(AVG(AVG(pr.total_comments_count)) OVER (
          ORDER BY pr.created_at::date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
        )::numeric, 2) AS rolling_avg_comments
      FROM pull_requests pr JOIN repositories r ON pr.repository_id = r.id
      WHERE r.full_name = ${fullName} AND pr.created_at >= NOW() - MAKE_INTERVAL(days => ${days})
      GROUP BY pr.created_at::date ORDER BY day
    `);

    const prSizeDistribution = await db.execute(sql`
      WITH bucketed AS (
        SELECT CASE WHEN additions <= 50 THEN '1 - 50' WHEN additions <= 200 THEN '50 - 200'
          WHEN additions <= 500 THEN '200 - 500' WHEN additions <= 1000 THEN '500 - 1000'
          ELSE '> 1000' END AS size_range
        FROM pull_requests pr JOIN repositories r ON pr.repository_id = r.id
        WHERE r.full_name = ${fullName}
          AND pr.created_at >= NOW() - MAKE_INTERVAL(days => ${days}) AND pr.additions IS NOT NULL
      )
      SELECT size_range, COUNT(*) AS pr_count FROM bucketed GROUP BY size_range
      ORDER BY CASE WHEN size_range = '1 - 50' THEN 1 WHEN size_range = '50 - 200' THEN 2
        WHEN size_range = '200 - 500' THEN 3 WHEN size_range = '500 - 1000' THEN 4 ELSE 5 END
    `);

    const slowestPrs = await db.execute(sql`
      SELECT pr.title, ROUND(EXTRACT(EPOCH FROM (pr.merged_at - pr.created_at)) / 86400, 2) AS lead_time_days,
        pr.number, pr.created_at, pr.merged_at
      FROM pull_requests pr JOIN repositories r ON pr.repository_id = r.id
      WHERE r.full_name = ${fullName}
        AND pr.merged_at >= NOW() - MAKE_INTERVAL(days => ${days})
        AND pr.merged_at IS NOT NULL AND pr.created_at IS NOT NULL
        AND pr.author NOT IN ('renovate-pagopa', 'dependabot', 'dx-pagopa-bot')
      ORDER BY lead_time_days DESC LIMIT 50
    `);

    return NextResponse.json({
      cards: {
        avgLeadTime: avgLeadTime.rows[0]?.value,
        totalPrs: totalPrs.rows[0]?.value,
        totalComments: totalComments.rows[0]?.value,
        commentsPerPr: commentsPerPr.rows[0]?.value,
      },
      leadTimeMovingAvg: leadTimeMovingAvg.rows,
      leadTimeTrend: leadTimeTrend.rows,
      mergedPrs: mergedPrs.rows,
      unmergedPrs: unmergedPrs.rows,
      newPrs: newPrs.rows,
      cumulatedNewPrs: cumulatedNewPrs.rows,
      prSize: prSize.rows,
      prComments: prComments.rows,
      prSizeDistribution: prSizeDistribution.rows,
      slowestPrs: slowestPrs.rows,
    });
  } catch (error) {
    console.error("PR dashboard error:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}
