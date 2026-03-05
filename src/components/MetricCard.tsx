"use client";

interface MetricCardProps {
  label: string;
  value: string | number | null;
  suffix?: string;
}

export function MetricCard({ label, value, suffix }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">
        {value ?? "—"}
        {suffix && <span className="ml-1 text-sm text-gray-500">{suffix}</span>}
      </p>
    </div>
  );
}
