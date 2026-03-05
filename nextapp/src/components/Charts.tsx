"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
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

export function ChartWrapper({ title, children, className = "" }: ChartWrapperProps) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${className}`}>
      <h3 className="mb-4 text-sm font-medium text-gray-700">{title}</h3>
      <div className="h-72">{children}</div>
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
}

export function SimpleLineChart({
  title,
  data,
  xKey,
  lines,
  className,
}: SimpleLineChartProps) {
  return (
    <ChartWrapper title={title} className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
          <Tooltip />
          <Legend />
          {lines.map((line, i) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              name={line.name}
              stroke={line.color || COLORS[i % COLORS.length]}
              dot={false}
              strokeWidth={2}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
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
}

export function SimpleBarChart({
  title,
  data,
  xKey,
  bars,
  className,
  layout = "horizontal",
}: SimpleBarChartProps) {
  return (
    <ChartWrapper title={title} className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={layout === "vertical" ? "vertical" : "horizontal"}>
          <CartesianGrid strokeDasharray="3 3" />
          {layout === "vertical" ? (
            <>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey={xKey} type="category" tick={{ fontSize: 11 }} width={120} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
            </>
          )}
          <Tooltip />
          <Legend />
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
      </ResponsiveContainer>
    </ChartWrapper>
  );
}

// --- Pie Chart ---
interface SimplePieChartProps {
  title: string;
  data: { name: string; value: number }[];
  className?: string;
}

export function SimplePieChart({ title, data, className }: SimplePieChartProps) {
  return (
    <ChartWrapper title={title} className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine
            label={({ name, percent }) =>
              `${name} (${(percent * 100).toFixed(0)}%)`
            }
            outerRadius={80}
            dataKey="value"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}

// --- Data Table ---
interface DataTableProps {
  title: string;
  columns: { key: string; label: string }[];
  data: Record<string, unknown>[];
  className?: string;
}

export function DataTable({ title, columns, data, className = "" }: DataTableProps) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${className}`}>
      <h3 className="mb-4 text-sm font-medium text-gray-700">{title}</h3>
      <div className="max-h-96 overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-3 py-2 text-left font-medium text-gray-600"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-gray-100">
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2 text-gray-800">
                    {String(row[col.key] ?? "")}
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
