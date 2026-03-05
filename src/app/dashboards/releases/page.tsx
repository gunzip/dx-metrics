"use client";

import { SimpleLineChart, DataTable } from "@/components/Charts";
import { useDashboardData } from "@/lib/useDashboardData";

interface ReleaseStats {
  totalModules: number;
  totalMajorVersions: number;
  totalReleases: number;
  oldestRelease: string | null;
  newestRelease: string | null;
}

interface ModuleSummary {
  module_name: string;
  provider: string;
  major_versions_count: string;
  total_releases: string;
  first_release_date: string;
  last_release_date: string;
  latest_major: string;
  versions_detail: string;
}

interface ReleasesTimeline {
  month: string;
  major_versions_introduced: string;
  total_releases: string;
}

interface ReleasesDashboardData {
  stats: ReleaseStats;
  modulesSummary: ModuleSummary[];
  releasesTimeline: ReleasesTimeline[];
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value ?? "—"}</p>
    </div>
  );
}

export default function ReleasesDashboard() {
  const { data, loading } = useDashboardData<ReleasesDashboardData>(
    "releases",
    {},
  );

  const releasesTimelineChartData = (data?.releasesTimeline ?? []).map((r) => ({
    month: r.month,
    major_versions: Number(r.major_versions_introduced),
    total_releases: Number(r.total_releases),
  }));

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold text-gray-900">
        Terraform Registry Releases
      </h2>

      {loading && <p className="text-gray-500">Loading...</p>}

      {data && (
        <>
          {/* Stats cards */}
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard label="Modules" value={data.stats.totalModules} />
            <StatCard
              label="Major Versions"
              value={data.stats.totalMajorVersions}
            />
            <StatCard label="Total Releases" value={data.stats.totalReleases} />
          </div>

          {/* Timeline chart */}
          <div className="mb-6">
            <SimpleLineChart
              title="New Major Versions per Month"
              data={releasesTimelineChartData}
              xKey="month"
              lines={[
                {
                  key: "major_versions",
                  name: "New Major Versions",
                  color: "#7c3aed",
                },
              ]}
            />
          </div>

          {/* Detail table */}
          <div className="mt-4">
            <DataTable
              title="Module Details"
              columns={[
                {
                  key: "module_name",
                  label: "Module",
                  renderCell: (value, row) => (
                    <a
                      href={`https://registry.terraform.io/modules/pagopa-dx/${value}/${row.provider}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {String(value)}
                    </a>
                  ),
                },
                { key: "provider", label: "Provider" },
                { key: "major_versions_count", label: "Major Versions" },
                { key: "latest_major", label: "Latest Major" },
                { key: "total_releases", label: "Total Releases" },
                { key: "first_release_date", label: "First Released" },
                { key: "last_release_date", label: "Last Released" },
                { key: "versions_detail", label: "Versions" },
              ]}
              data={data.modulesSummary as unknown as Record<string, unknown>[]}
            />
          </div>
        </>
      )}
    </div>
  );
}
