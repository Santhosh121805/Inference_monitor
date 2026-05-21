import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Point {
  request: number;
  latency: number;
}

interface Props {
  data: Point[];
}

export function LatencyChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-500">
        No inference runs yet.
      </div>
    );
  }
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="request"
            stroke="#64748b"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            label={{ value: "request #", position: "insideBottom", offset: -2, fill: "#64748b", fontSize: 10 }}
          />
          <YAxis
            stroke="#64748b"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            width={40}
            unit="ms"
          />
          <Tooltip
            contentStyle={{
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 8,
              fontSize: 12,
              color: "#e2e8f0",
            }}
            labelStyle={{ color: "#94a3b8" }}
            formatter={(v: number) => [`${v} ms`, "latency"]}
          />
          <Line
            type="monotone"
            dataKey="latency"
            stroke="#6366f1"
            strokeWidth={2}
            dot={{ r: 2, fill: "#6366f1" }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
