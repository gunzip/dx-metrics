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
    avgTimeToFirstReview: number | null;
    avgTimeToMerge: number | null;
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
  reviewDistribution: {
    reviewer: string;
    total_reviews: number;
    approvals: number;
    change_requests: number;
  }[];
  reviewMatrix: {
    author: string;
    reviewer: string;
    review_count: number;
  }[];
  timeToFirstReviewTrend: { week: string; avg_hours_to_first_review: number }[];
  timeToMergeTrend: { week: string; avg_hours_to_merge: number }[];
}

export default function PullRequestsDashboard() {
  const { repository, days, setRepository, setDays } = useDashboardFilters();

  const { data, loading } = useDashboardData<PrDashboardData>("pull-requests", {
    repository,
    days,
  });

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold text-gray-900">
        Pull Requests Metrics
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
          <div className="mb-6 grid grid-cols-3 gap-4">
            <MetricCard
              label="Average Lead Time"
              value={data.cards.avgLeadTime}
              suffix="days"
            />
            <MetricCard
              label="Total Pull Requests"
              value={data.cards.totalPrs}
            />
            <MetricCard
              label="Total Comments"
              value={data.cards.totalComments}
            />
            <MetricCard
              label="Comments per PR"
              value={data.cards.commentsPerPr}
            />
            <MetricCard
              label="Avg Time to First Review"
              value={data.cards.avgTimeToFirstReview}
              suffix="hours"
            />
            <MetricCard
              label="Avg Time to Merge"
              value={data.cards.avgTimeToMerge}
              suffix="hours"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <SimpleBarChart
              title="Merged PR Lead Time (weekly average)"
              data={data.leadTimeMovingAvg}
              xKey="week"
              bars={[
                {
                  key: "avg_lead_time_days",
                  name: "Lead Time",
                  color: "#2563eb",
                },
              ]}
            />
            <SimpleLineChart
              title="Merged PR Lead Time (trend)"
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

          <div className="mt-4">
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

          {/* Time to Review & Time to Merge */}
          {(data.timeToFirstReviewTrend.length > 0 ||
            data.timeToMergeTrend.length > 0) && (
            <>
              <h3 className="mt-8 mb-4 text-base font-semibold text-gray-800">
                Review Timing
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <SimpleLineChart
                  title="Avg Time to First Review (weekly, hours)"
                  data={data.timeToFirstReviewTrend}
                  xKey="week"
                  lines={[
                    {
                      key: "avg_hours_to_first_review",
                      name: "Hours to First Review",
                      color: "#2563eb",
                    },
                  ]}
                />
                <SimpleLineChart
                  title="Avg Time to Merge after Approval (weekly, hours)"
                  data={data.timeToMergeTrend}
                  xKey="week"
                  lines={[
                    {
                      key: "avg_hours_to_merge",
                      name: "Hours to Merge",
                      color: "#dc2626",
                    },
                  ]}
                />
              </div>
            </>
          )}

          {/* Code Review Distribution */}
          {data.reviewDistribution.length > 0 && (
            <>
              <h3 className="mt-8 mb-4 text-base font-semibold text-gray-800">
                Code Review Distribution
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <SimpleBarChart
                  title="Reviews per Reviewer"
                  data={data.reviewDistribution}
                  xKey="reviewer"
                  layout="vertical"
                  bars={[
                    {
                      key: "approvals",
                      name: "Approvals",
                      color: "#16a34a",
                      stackId: "reviews",
                    },
                    {
                      key: "change_requests",
                      name: "Change Requests",
                      color: "#dc2626",
                      stackId: "reviews",
                    },
                  ]}
                />
                <DataTable
                  title="Reviewer Stats"
                  columns={[
                    { key: "reviewer", label: "Reviewer" },
                    { key: "total_reviews", label: "Total" },
                    { key: "approvals", label: "Approvals" },
                    { key: "change_requests", label: "Changes Requested" },
                  ]}
                  data={data.reviewDistribution as Record<string, unknown>[]}
                />
              </div>
              <div className="mt-4">
                <DataTable
                  title="Author → Reviewer Matrix"
                  columns={[
                    { key: "author", label: "Author" },
                    { key: "reviewer", label: "Reviewer" },
                    { key: "review_count", label: "Reviews" },
                  ]}
                  data={data.reviewMatrix as Record<string, unknown>[]}
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
