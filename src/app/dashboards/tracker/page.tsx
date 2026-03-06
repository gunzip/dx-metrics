"use client";

import { MetricCard } from "@/components/MetricCard";
import { SimpleLineChart, SimpleBarChart } from "@/components/Charts";
import { useDashboardData } from "@/lib/useDashboardData";

interface TrackerData {
  cards: {
    openedTotal: number | null;
    closedTotal: number | null;
    avgClose: number | null;
    requestsTrend: number | null;
  };
  frequencyTrend: {
    request_date: string;
    actual_requests: number;
    trend: number;
  }[];
  byCategory: { category: string; requests: number }[];
  byPriority: { priority: string; requests: number }[];
}

export default function TrackerDashboard() {
  const { data, loading } = useDashboardData<TrackerData>("tracker", {});

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold text-white">
        Team DX Requests Metrics
      </h2>

      {loading && <p className="text-gray-500">Loading...</p>}

      {data && (
        <>
          <div className="mb-6 grid grid-cols-4 gap-4">
            <MetricCard
              label="Opened Requests (total)"
              value={data.cards.openedTotal}
            />
            <MetricCard
              label="Closed Requests (total)"
              value={data.cards.closedTotal}
            />
            <MetricCard
              label="Avg Time to Close"
              value={data.cards.avgClose}
              suffix="days"
            />
            <MetricCard
              label="Requests Trend"
              value={data.cards.requestsTrend}
              suffix="%"
            />
          </div>

          <div className="grid grid-cols-1 gap-4">
            <SimpleLineChart
              title="DX Requests Frequency Trend"
              data={data.frequencyTrend}
              xKey="request_date"
              lines={[
                {
                  key: "actual_requests",
                  name: "Actual Requests",
                  color: "#2563eb",
                },
                { key: "trend", name: "Trend", color: "#dc2626" },
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}
