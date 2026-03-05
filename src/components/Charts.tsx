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
      <div className="w-full" style={{ height: "288px", overflow: "hidden" }}>
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
        <LineChart
          data={data}
          margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11 }} stroke="#6b7280" />
          <YAxis tick={{ fontSize: 11 }} stroke="#6b7280" />
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
  const isVertical = layout === "vertical";

  return (
    <ChartWrapper title={title} className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={isVertical ? "vertical" : "horizontal"}
          margin={{
            top: 10,
            right: 30,
            left: 10,
            bottom: isVertical ? 10 : 20,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey={isVertical ? undefined : xKey}
            type={isVertical ? "number" : "category"}
            tick={{ fontSize: isVertical ? 11 : 9 }}
            stroke="#6b7280"
            {...(!isVertical && {
              interval: Math.max(0, Math.floor(data.length / 8) - 1),
              angle: data.length > 8 ? -45 : 0,
              textAnchor: data.length > 8 ? "end" : "middle",
              height: data.length > 8 ? 60 : 30,
            })}
          />
          <YAxis
            dataKey={isVertical ? xKey : undefined}
            type={isVertical ? "category" : undefined}
            tick={{ fontSize: 11 }}
            stroke="#6b7280"
            {...(isVertical && { width: 120 })}
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

export function SimplePieChart({
  title,
  data,
  className,
}: SimplePieChartProps) {
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
          <Tooltip
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
            }}
          />
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

export function DataTable({
  title,
  columns,
  data,
  className = "",
}: DataTableProps) {
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
