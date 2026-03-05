"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

export function useDashboardFilters({
  defaultRepository = "dx",
  defaultDays = 120,
}: {
  defaultRepository?: string;
  defaultDays?: number;
} = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const repository = searchParams.get("repository") || defaultRepository;
  const days = Number(searchParams.get("days")) || defaultDays;

  const updateFilters = useCallback(
    (newParams: { repository?: string; days?: number }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newParams.repository !== undefined) {
        params.set("repository", newParams.repository);
      }
      if (newParams.days !== undefined) {
        params.set("days", newParams.days.toString());
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const setRepository = (repo: string) => updateFilters({ repository: repo });
  const setDays = (d: number) => updateFilters({ days: d });

  return {
    repository,
    days,
    setRepository,
    setDays,
  };
}
