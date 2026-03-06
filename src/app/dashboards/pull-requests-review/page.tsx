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

interface PrReviewDashboardData {
  cards: {
    avgTimeToFirstReview: number | null;
    avgTimeToMerge: number | null;
  };
  timeToFirstReviewTrend: { week: string; avg_hours_to_first_review: number }[];
  timeToMergeTrend: { week: string; avg_hours_to_merge: number }[];
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
}

export default function PullRequestsReviewDashboard() {
  const { repository, days, setRepository, setDays } = useDashboardFilters();

  const { data, loading } = useDashboardData<PrReviewDashboardData>(
    "pull-requests-review",
    {
      repository,
      days,
    },
  );

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold text-gray-900">
        Pull Requests Review
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
          <div className="mb-6 grid grid-cols-2 gap-4">
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

          {/* Review Timing */}
          {(data.timeToFirstReviewTrend.length > 0 ||
            data.timeToMergeTrend.length > 0) && (
            <>
              <h3 className="mt-2 mb-4 text-base font-semibold text-gray-800">
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
