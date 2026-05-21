import { RefreshCw, Cpu } from "lucide-react";
import { Badge } from "./Badge";
import { StatusDot } from "./StatusDot";

interface Props {
  name: string;
  reachable: boolean | null;
  lastChecked: number | null;
  onPing?: () => void;
  loading?: boolean;
}

function fmt(ts: number | null) {
  if (!ts) return "never";
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  return `${m}m ago`;
}

export function WorkerCard({ name, reachable, lastChecked, onPing, loading }: Props) {
  const status = reachable === null ? "yellow" : reachable ? "green" : "red";
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 shadow-sm transition-all duration-150">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-100">{name}</h3>
        </div>
        <button
          onClick={onPing}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-300 transition-all duration-150 hover:bg-slate-700/60 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Ping
        </button>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <StatusDot status={status} pulse={reachable === true} />
        {reachable === null ? (
          <Badge tone="warning">Unknown</Badge>
        ) : reachable ? (
          <Badge tone="success">Reachable</Badge>
        ) : (
          <Badge tone="error">Unreachable</Badge>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">Last checked {fmt(lastChecked)}</p>
    </div>
  );
}
