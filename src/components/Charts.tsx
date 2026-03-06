"use client";

import React from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#ea580c",
  "#7c3aed",
  "#0891b2",
  "#ca8a04",
  "#be185d",
];

interface ChartWrapperProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function ChartWrapper({
  title,
  children,
  className = "",
}: ChartWrapperProps) {
  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${className}`}
    >
      <h3 className="mb-4 text-sm font-medium text-gray-700">{title}</h3>
      <div className="w-full" style={{ height: "288px" }}>
        {children}
      </div>
    </div>
  );
}

// --- Line Chart ---
interface SimpleLineChartProps {
  title: string;
  data: Record<string, unknown>[];
  xKey: string;
  lines: { key: string; name: string; color?: string }[];
  className?: string;
  xValueFormatter?: (value: any) => string;
}

export function SimpleLineChart({
  title,
  data,
  xKey,
  lines,
  className,
  xValueFormatter,
}: SimpleLineChartProps) {
  return (
    <ChartWrapper title={title} className={className}>
      <LineChart
        data={data}
        margin={{ top: 20, right: 30, left: 10, bottom: 5 }}
        width="100%"
        height={288}
        responsive
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey={xKey}
          tick={{
            fontSize: 10,
            textAnchor: data.length > 6 ? "end" : "middle",
          }}
          stroke="#6b7280"
          tickFormatter={
            xValueFormatter ??
            ((v: string) => {
              const d = new Date(v);
              return isNaN(d.getTime())
                ? v
                : d.toLocaleDateString("en", {
                    month: "short",
                    day: "numeric",
                  });
            })
          }
          interval={Math.max(0, Math.floor(data.length / 8) - 1)}
          angle={data.length > 6 ? -35 : 0}
          tickMargin={data.length > 6 ? 15 : 0}
          height={data.length > 6 ? 70 : 30}
        />
        <YAxis tick={{ fontSize: 11 }} stroke="#6b7280" domain={[0, "auto"]} />
        <Tooltip
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "6px",
          }}
        />
        <Legend wrapperStyle={{ paddingTop: "10px" }} />
        {lines.map((line, i) => (
          <Line
            key={line.key}
            type="linear"
            dataKey={line.key}
            name={line.name}
            stroke={line.color || COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ChartWrapper>
  );
}

// --- Bar Chart ---
interface SimpleBarChartProps {
  title: string;
  data: Record<string, unknown>[];
  xKey: string;
  bars: { key: string; name: string; color?: string; stackId?: string }[];
  className?: string;
  layout?: "horizontal" | "vertical";
  xValueFormatter?: (value: any) => string;
}

export function SimpleBarChart({
  title,
  data,
  xKey,
  bars,
  className,
  layout = "horizontal",
  xValueFormatter,
}: SimpleBarChartProps) {
  const isVertical = layout === "vertical";

  return (
    <ChartWrapper title={title} className={className}>
      <BarChart
        data={data}
        layout={isVertical ? "vertical" : "horizontal"}
        margin={{
          top: 10,
          right: 30,
          left: 10,
          bottom: isVertical ? 10 : 5,
        }}
        width="100%"
        height={288}
        responsive
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey={isVertical ? undefined : xKey}
          type={isVertical ? "number" : "category"}
          tick={{
            fontSize: isVertical ? 11 : 9,
            ...(isVertical
              ? {}
              : {
                  textAnchor: data.length > 4 ? "end" : "middle",
                }),
          }}
          stroke="#6b7280"
          tickFormatter={xValueFormatter}
          {...(isVertical
            ? { domain: [0, (max: number) => Math.ceil(max * 1.1)] }
            : {
                interval: Math.max(0, Math.floor(data.length / 8) - 1),
                angle: data.length > 4 ? -45 : 0,
                tickMargin: data.length > 4 ? 15 : 0,
                height: data.length > 4 ? 80 : 30,
              })}
        />
        <YAxis
          dataKey={isVertical ? xKey : undefined}
          type={isVertical ? "category" : "number"}
          tick={{ fontSize: 11 }}
          stroke="#6b7280"
          {...(isVertical
            ? { width: 120 }
            : { domain: [0, (max: number) => Math.ceil(max * 1.1)] })}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "6px",
          }}
        />
        <Legend wrapperStyle={{ paddingTop: "10px" }} />
        {bars.map((bar, i) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.name}
            fill={bar.color || COLORS[i % COLORS.length]}
            stackId={bar.stackId}
          />
        ))}
      </BarChart>
    </ChartWrapper>
  );
}

// --- Pie Chart ---
interface SimplePieChartProps {
  title: string;
  data: { name: string; value: number }[];
  className?: string;
}

export function SimplePieChart({
  title,
  data,
  className,
}: SimplePieChartProps) {
  return (
    <ChartWrapper title={title} className={className}>
      <ResponsiveContainer width="100%" height={288}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine
            label={({ name, percent }) =>
              `${name} (${((percent || 0) * 100).toFixed(0)}%)`
            }
            outerRadius={80}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}

// --- Data Table ---
interface DataTableColumn {
  key: string;
  label: string;
  renderCell?: (
    value: unknown,
    row: Record<string, unknown>,
  ) => React.ReactNode;
}

interface DataTableProps {
  title: string;
  columns: DataTableColumn[];
  data: Record<string, unknown>[];
  className?: string;
}

export function DataTable({
  title,
  columns,
  data,
  className = "",
}: DataTableProps) {
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = React.useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const an = Number(av);
      const bn = Number(bv);
      const cmp =
        !isNaN(an) && !isNaN(bn)
          ? an - bn
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${className}`}
    >
      <h3 className="mb-4 text-sm font-medium text-gray-700">{title}</h3>
      <div className="max-h-96 overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="cursor-pointer select-none px-3 py-2 text-left font-medium text-gray-600 hover:text-gray-900"
                >
                  {col.label}
                  {sortKey === col.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={i} className="border-b border-gray-100">
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2 text-gray-800">
                    {col.renderCell
                      ? col.renderCell(row[col.key], row)
                      : String(row[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { COLORS };
