"use client";

import { DashboardFilters } from "@/components/DashboardFilters";
import { SimpleBarChart, DataTable } from "@/components/Charts";
import { useDashboardData } from "@/lib/useDashboardData";
import { useDashboardFilters } from "@/lib/useDashboardFilters";

interface DxTeamData {
  ioInfraPrs: { date: string; dx_pr: number; non_dx_pr: number }[];
  dxCommits: {
    committer_date: string;
    member_name: string;
    repository_commits: number;
  }[];
  ioInfraPrTable: { author: string; created_at: string }[];
  commitsByRepo: {
    member_name: string;
    full_name: string;
    repository_commits: number;
  }[];
  dxAdoptingProjects: { repository: string }[];
}

export default function DxTeamDashboard() {
  const { days, setDays } = useDashboardFilters();

  const { data, loading } = useDashboardData<DxTeamData>("dx-team", { days });

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold text-gray-900">Team DX Metrics</h2>
      <DashboardFilters
        timeInterval={days}
        onTimeIntervalChange={setDays}
        showRepository={false}
      />

      {loading && <p className="text-gray-500">Loading...</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <SimpleBarChart
              title="Pull Requests on IO-Infra"
              data={data.ioInfraPrs}
              xKey="date"
              bars={[
                { key: "dx_pr", name: "DX PR", color: "#2563eb", stackId: "a" },
                {
                  key: "non_dx_pr",
                  name: "Non DX PR",
                  color: "#dc2626",
                  stackId: "a",
                },
              ]}
            />
            <SimpleBarChart
              title="DX Members Commits on Non-DX Repositories"
              data={data.dxCommits}
              xKey="committer_date"
              bars={[
                {
                  key: "repository_commits",
                  name: "Commits",
                  color: "#2563eb",
                },
              ]}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <DataTable
              title="Pull Requests on IO-Infra"
              columns={[
                { key: "author", label: "Author" },
                { key: "created_at", label: "Created At" },
              ]}
              data={data.ioInfraPrTable}
            />
            <DataTable
              title="DX Members Commit by Repository"
              columns={[
                { key: "member_name", label: "Member" },
                { key: "full_name", label: "Repository" },
                { key: "repository_commits", label: "Commits" },
              ]}
              data={data.commitsByRepo}
            />
          </div>

          <div className="mt-4">
            <DataTable
              title="Projects that adopt DX tooling"
              columns={[{ key: "repository", label: "Repository" }]}
              data={data.dxAdoptingProjects}
            />
          </div>
        </>
      )}
    </div>
  );
}
