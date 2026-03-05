"use client";

import { REPOSITORIES, TIME_INTERVALS } from "@/lib/config";

interface DashboardFiltersProps {
  repository?: string;
  timeInterval?: number;
  onRepositoryChange?: (repo: string) => void;
  onTimeIntervalChange?: (days: number) => void;
  showRepository?: boolean;
  showTimeInterval?: boolean;
}

export function DashboardFilters({
  repository,
  timeInterval,
  onRepositoryChange,
  onTimeIntervalChange,
  showRepository = true,
  showTimeInterval = true,
}: DashboardFiltersProps) {
  return (
    <div className="mb-6 flex flex-wrap gap-4">
      {showRepository && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Repository
          </label>
          <select
            value={repository}
            onChange={(e) => onRepositoryChange?.(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {REPOSITORIES.map((repo) => (
              <option key={repo} value={repo}>
                {repo}
              </option>
            ))}
          </select>
        </div>
      )}
      {showTimeInterval && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Time Interval
          </label>
          <select
            value={timeInterval}
            onChange={(e) => onTimeIntervalChange?.(Number(e.target.value))}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {TIME_INTERVALS.map((ti) => (
              <option key={ti.value} value={ti.value}>
                {ti.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
