"use client";

interface MetricCardProps {
  label: string;
  value: string | number | null;
  suffix?: string;
}

export function MetricCard({ label, value, suffix }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-[#30363d] bg-[#0d1117] p-6 shadow-sm transition-all hover:border-[#8b949e]">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <div className="mt-2 flex items-baseline">
        <p className="text-3xl font-bold text-[#e6edf3] tracking-tighter">
          {value ?? "—"}
        </p>
        {suffix && (
          <span className="ml-1 text-sm font-medium text-gray-400">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
