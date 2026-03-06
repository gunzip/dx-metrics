"use client";

import { DashboardFilters } from "@/components/DashboardFilters";
import { MetricCard } from "@/components/MetricCard";
import {
  SimpleLineChart,
  SimpleBarChart,
  DataTable,
} from "@/components/Charts";
import { useDashboardData } from "@/lib/useDashboardData";
import { useDashboardFilters } from "@/lib/useDashboardFilters";

interface PrDashboardData {
  cards: {
    avgLeadTime: number | null;
    totalPrs: number | null;
    totalComments: number | null;
    commentsPerPr: number | null;
  };
  leadTimeMovingAvg: { week: string; avg_lead_time_days: number }[];
  leadTimeTrend: { date: string; trend_line: number }[];
  mergedPrs: { date: string; pr_count: number }[];
  unmergedPrs: { date: string; open_prs: number }[];
  newPrs: { date: string; pr_count: number }[];
  cumulatedNewPrs: { date: string; cumulative_count: number }[];
  prSize: { week: string; avg_additions: number }[];
  prComments: { week: string; avg_comments: number }[];
  prSizeDistribution: {
    size_range: string;
    pr_count: number;
    avg_additions: number;
  }[];
  slowestPrs: {
    title: string;
    lead_time_days: number;
    number: number;
    created_at: string;
    merged_at: string;
  }[];
}

export default function PullRequestsDashboard() {
  const { repository, days, setRepository, setDays } = useDashboardFilters();

  const { data, loading } = useDashboardData<PrDashboardData>("pull-requests", {
    repository,
    days,
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#e6edf3]">
            Pull Request <span className="text-green-500">Insights</span>
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Analyzing engineering velocity and collaboration patterns.
          </p>
        </div>
      </div>

      <DashboardFilters
        repository={repository}
        timeInterval={days}
        onRepositoryChange={setRepository}
        onTimeIntervalChange={setDays}
      />

      {loading && (
        <div className="flex items-center gap-2 text-gray-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
          <p className="text-sm font-medium">Synchronizing data...</p>
        </div>
      )}

      {data && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard
              label="Avg Lead Time"
              value={data.cards.avgLeadTime}
              suffix="days"
            />
            <MetricCard
              label="Total PRs"
              value={data.cards.totalPrs}
            />
            <MetricCard
              label="Total Comments"
              value={data.cards.totalComments}
            />
            <MetricCard
              label="Comments / PR"
              value={data.cards.commentsPerPr}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <SimpleBarChart
              title="Avg Lead Time (Weekly)"
              data={data.leadTimeMovingAvg}
              xKey="week"
              bars={[
                {
                  key: "avg_lead_time_days",
                  name: "Days",
                  color: "#238636",
                },
              ]}
            />
            <SimpleLineChart
              title="Lead Time Trend"
              data={data.leadTimeTrend}
              xKey="date"
              lines={[{ key: "trend_line", name: "Trend", color: "#dc2626" }]}
            />
            <SimpleBarChart
              title="Merged Pull Requests"
              data={data.mergedPrs}
              xKey="date"
              bars={[{ key: "pr_count", name: "Merged PRs", color: "#2563eb" }]}
            />
            <SimpleLineChart
              title="Unmerged Pull Requests"
              data={data.unmergedPrs}
              xKey="date"
              lines={[{ key: "open_prs", name: "Open PRs", color: "#ea580c" }]}
            />
            <SimpleBarChart
              title="New Pull Requests"
              data={data.newPrs}
              xKey="date"
              bars={[{ key: "pr_count", name: "New PRs", color: "#16a34a" }]}
            />
            <SimpleLineChart
              title="Cumulated New Pull Requests"
              data={data.cumulatedNewPrs}
              xKey="date"
              lines={[
                {
                  key: "cumulative_count",
                  name: "Cumulated New PRs",
                  color: "#7c3aed",
                },
              ]}
            />
            <SimpleBarChart
              title="Pull Requests Size (weekly average)"
              data={data.prSize}
              xKey="week"
              bars={[
                {
                  key: "avg_additions",
                  name: "Avg Additions",
                  color: "#2196F3",
                },
              ]}
            />
            <SimpleBarChart
              title="Pull Requests Comments (weekly average)"
              data={data.prComments}
              xKey="week"
              bars={[
                {
                  key: "avg_comments",
                  name: "Avg Comments",
                  color: "#0891b2",
                },
              ]}
            />
            <SimpleBarChart
              title="Pull Requests Size (avg additions)"
              data={data.prSizeDistribution}
              xKey="size_range"
              bars={[
                {
                  key: "avg_additions",
                  name: "Avg Additions",
                  color: "#2196F3",
                },
              ]}
            />
          </div>

          <div className="mt-8">
            <DataTable
              title="Slowest Pull Requests"
              columns={[
                { key: "title", label: "Title" },
                { key: "lead_time_days", label: "Lead Time (days)" },
                { key: "number", label: "#" },
                { key: "created_at", label: "Created" },
                { key: "merged_at", label: "Merged" },
              ]}
              data={data.slowestPrs}
            />
          </div>
        </div>
      )}
    </div>
  );
}
