"use client";

import { DashboardFilters } from "@/components/DashboardFilters";
import {
  SimpleLineChart,
  SimpleBarChart,
  DataTable,
} from "@/components/Charts";
import { useDashboardData } from "@/lib/useDashboardData";
import { useDashboardFilters } from "@/lib/useDashboardFilters";

interface WorkflowDashboardData {
  deployments: { run_week: string; moving_avg_deployment_freq: number }[];
  dxVsNonDx: {
    run_date: string;
    pipeline_type: string;
    cumulative_count: number;
  }[];
  failures: { workflow_name: string; failed_runs: number }[];
  avgDuration: {
    workflow_name: string;
    average_duration_minutes: number;
  }[];
  runCount: { workflow_name: string; run_count: number }[];
  cumulativeDuration: {
    workflow_name: string;
    cumulative_duration_minutes: number;
  }[];
  infraPlan: { run_timestamp: string; duration_minutes: number }[];
  infraApply: { run_timestamp: string; duration_minutes: number }[];
  successRatio: {
    workflow_name: string;
    total_runs: number;
    successful_runs: number;
    failed_runs: number;
    success_rate_percentage: number;
  }[];
}

export default function WorkflowsDashboard() {
  const { repository, days, setRepository, setDays } = useDashboardFilters();

  const { data, loading } = useDashboardData<WorkflowDashboardData>(
    "workflows",
    { repository, days },
  );

  // Pivot dxVsNonDx for chart
  const dxVsNonDxPivoted = (() => {
    if (!data?.dxVsNonDx) return [];
    const map = new Map<
      string,
      { run_date: string; dx: number; non_dx: number }
    >();
    for (const row of data.dxVsNonDx) {
      const entry = map.get(row.run_date) || {
        run_date: row.run_date,
        dx: 0,
        non_dx: 0,
      };
      if (row.pipeline_type === "DX Pipelines")
        entry.dx = Number(row.cumulative_count);
      else entry.non_dx = Number(row.cumulative_count);
      map.set(row.run_date, entry);
    }
    return Array.from(map.values());
  })();

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold text-gray-900">Workflow Metrics</h2>
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
            <SimpleLineChart
              title="Deployments to Production (moving average)"
              data={data.deployments}
              xKey="run_week"
              lines={[
                {
                  key: "moving_avg_deployment_freq",
                  name: "Deployments",
                  color: "#2563eb",
                },
              ]}
            />
            <SimpleLineChart
              title="DX VS Non-DX Pipeline Runs (Cumulative)"
              data={dxVsNonDxPivoted}
              xKey="run_date"
              lines={[
                { key: "dx", name: "DX Pipelines", color: "#2563eb" },
                { key: "non_dx", name: "Non-DX Pipelines", color: "#dc2626" },
              ]}
            />
            <SimpleBarChart
              title="Pipeline Failures"
              data={data.failures}
              xKey="workflow_name"
              bars={[
                {
                  key: "failed_runs",
                  name: "Failed Runs",
                  color: "#c97d9b",
                },
              ]}
              layout="vertical"
            />
            <SimpleBarChart
              title="Pipeline Average Duration (minutes)"
              data={data.avgDuration}
              xKey="workflow_name"
              bars={[
                {
                  key: "average_duration_minutes",
                  name: "Avg Duration",
                  color: "#2563eb",
                },
              ]}
              layout="vertical"
            />
            <SimpleBarChart
              title="Pipeline Run Count"
              data={data.runCount}
              xKey="workflow_name"
              bars={[{ key: "run_count", name: "Run Count", color: "#16a34a" }]}
              layout="vertical"
            />
            <SimpleBarChart
              title="Pipeline Cumulative Duration (minutes)"
              data={data.cumulativeDuration}
              xKey="workflow_name"
              bars={[
                {
                  key: "cumulative_duration_minutes",
                  name: "Cumulative Duration",
                  color: "#7c3aed",
                },
              ]}
              layout="vertical"
            />
            <SimpleLineChart
              title="Infra Plan Duration (minutes)"
              data={data.infraPlan}
              xKey="run_timestamp"
              lines={[
                {
                  key: "duration_minutes",
                  name: "Duration",
                  color: "#2563eb",
                },
              ]}
            />
            <SimpleLineChart
              title="Infra Apply Duration (minutes)"
              data={data.infraApply}
              xKey="run_timestamp"
              lines={[
                {
                  key: "duration_minutes",
                  name: "Duration",
                  color: "#16a34a",
                },
              ]}
            />
          </div>

          <div className="mt-4">
            <DataTable
              title="Workflow Success/Failure Ratio"
              columns={[
                { key: "workflow_name", label: "Workflow" },
                { key: "total_runs", label: "Total Runs" },
                { key: "successful_runs", label: "Successful" },
                { key: "failed_runs", label: "Failed" },
                { key: "success_rate_percentage", label: "Success Rate (%)" },
              ]}
              data={data.successRatio}
            />
          </div>
        </>
      )}
    </div>
  );
}
