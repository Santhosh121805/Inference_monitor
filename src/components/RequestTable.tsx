import { Badge } from "./Badge";
import type { InferLogEntry } from "../types";

interface Props {
  rows: InferLogEntry[];
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour12: false });
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export function RequestTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
        No requests yet. Run an inference from the Tester tab.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-slate-700">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-800/80 text-xs uppercase tracking-wider text-slate-400">
          <tr>
            <th className="px-4 py-2 font-medium">Time</th>
            <th className="px-4 py-2 font-medium">Prompt</th>
            <th className="px-4 py-2 font-medium text-right">Latency</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Worker chain</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.slice(0, 10).map((r) => (
            <tr key={r.id} className="bg-slate-900/40 transition-colors duration-150 hover:bg-slate-800/60">
              <td className="px-4 py-2 font-mono text-xs text-slate-400 tabular-nums">{fmtTime(r.time)}</td>
              <td className="px-4 py-2 font-mono text-xs text-slate-200">{truncate(r.prompt, 40)}</td>
              <td className="px-4 py-2 text-right font-mono text-xs text-slate-200 tabular-nums">
                {r.latency} ms
              </td>
              <td className="px-4 py-2">
                {r.status === "success" ? (
                  <Badge tone="success">Success</Badge>
                ) : (
                  <Badge tone="error">Error</Badge>
                )}
              </td>
              <td className="px-4 py-2 font-mono text-xs text-slate-400">
                {r.workerChain.length ? r.workerChain.join(" → ") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
