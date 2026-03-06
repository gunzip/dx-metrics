"use client";

import { DashboardFilters } from "@/components/DashboardFilters";
import {
  SimpleLineChart,
  SimpleBarChart,
  DataTable,
} from "@/components/Charts";
import { useDashboardData } from "@/lib/useDashboardData";
import { useDashboardFilters } from "@/lib/useDashboardFilters";

interface IacDashboardData {
  leadTimeMovingAvg: { week: string; avg_lead_time_days: number }[];
  leadTimeTrend: { date: string; trend_line: number }[];
  supervisedVsUnsupervised: {
    run_date: string;
    pr_type: string;
    cumulative_count: number;
  }[];
  prsOverTime: { week: string; pr_count: number }[];
  prsByReviewer: {
    reviewer: string;
    total_prs: number;
    merged_prs: number;
    avg_lead_time_days: number;
  }[];
}

export default function IacDashboard() {
  const { repository, days, setRepository, setDays } = useDashboardFilters({
    defaultRepository: "io-infra",
  });

  const { data, loading } = useDashboardData<IacDashboardData>("iac", {
    repository,
    days,
  });

  // Pivot supervised vs unsupervised
  const supervisedPivoted = (() => {
    if (!data?.supervisedVsUnsupervised) return [];
    const map = new Map<
      string,
      { run_date: string; supervised: number; unsupervised: number }
    >();
    for (const row of data.supervisedVsUnsupervised) {
      const entry = map.get(row.run_date) || {
        run_date: row.run_date,
        supervised: 0,
        unsupervised: 0,
      };
      if (row.pr_type === "Supervised PRs")
        entry.supervised = Number(row.cumulative_count);
      else entry.unsupervised = Number(row.cumulative_count);
      map.set(row.run_date, entry);
    }
    const arr = Array.from(map.values());
    // Fill forward: carry last cumulative value on days where a type has no entry
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].supervised === 0 && arr[i - 1].supervised > 0)
        arr[i].supervised = arr[i - 1].supervised;
      if (arr[i].unsupervised === 0 && arr[i - 1].unsupervised > 0)
        arr[i].unsupervised = arr[i - 1].unsupervised;
    }
    return arr;
  })();

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold text-white">
        IaC Pull Requests Metrics
      </h2>
      <DashboardFilters
        repository={repository}
        timeInterval={days}
        onRepositoryChange={setRepository}
        onTimeIntervalChange={setDays}
      />

      {loading && <p className="text-gray-500">Loading...</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <SimpleBarChart
              title="IaC PR Lead Time (weekly average)"
              data={data.leadTimeMovingAvg}
              xKey="week"
              bars={[
                {
                  key: "avg_lead_time_days",
                  name: "Lead Time",
                  color: "#2563eb",
                },
              ]}
              xValueFormatter={(v: string) => {
                // Shorten "2025-11-10" to "Nov 10"
                const d = new Date(v);
                return isNaN(d.getTime())
                  ? v
                  : d.toLocaleDateString("en", {
                      month: "short",
                      day: "numeric",
                    });
              }}
            />
            <SimpleLineChart
              title="IaC PR Lead Time (trend)"
              data={data.leadTimeTrend}
              xKey="date"
              lines={[{ key: "trend_line", name: "Trend", color: "#dc2626" }]}
            />
            <SimpleLineChart
              title="Supervised vs Unsupervised IaC PRs (Cumulative)"
              data={supervisedPivoted}
              xKey="run_date"
              lines={[
                {
                  key: "supervised",
                  name: "Supervised PRs",
                  color: "#dc2626",
                },
                {
                  key: "unsupervised",
                  name: "Unsupervised PRs",
                  color: "#16a34a",
                },
              ]}
            />
            <SimpleLineChart
              title="IaC PRs Count Over Time"
              data={data.prsOverTime}
              xKey="week"
              lines={[{ key: "pr_count", name: "PR Count", color: "#2563eb" }]}
            />
          </div>

          <div className="mt-4">
            <DataTable
              title="IaC PRs by Reviewer"
              columns={[
                { key: "reviewer", label: "Reviewer" },
                { key: "total_prs", label: "Total PRs" },
                { key: "merged_prs", label: "Merged PRs" },
                { key: "avg_lead_time_days", label: "Avg Lead Time (days)" },
              ]}
              data={data.prsByReviewer}
            />
          </div>
        </>
      )}
    </div>
  );
}
