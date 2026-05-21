import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";
import { Skeleton } from "./Skeleton";

type Tone = "neutral" | "good" | "bad";

const BORDERS: Record<Tone, string> = {
  neutral: "border-l-indigo-500",
  good: "border-l-emerald-500",
  bad: "border-l-red-500",
};

const ICON_TONES: Record<Tone, string> = {
  neutral: "text-indigo-400 bg-indigo-500/10",
  good: "text-emerald-400 bg-emerald-500/10",
  bad: "text-red-400 bg-red-500/10",
};

interface Props {
  label: string;
  value: ReactNode;
  icon: ComponentType<LucideProps>;
  tone?: Tone;
  delta?: { value: string; positive?: boolean };
  loading?: boolean;
}

export function StatCard({ label, value, icon: Icon, tone = "neutral", delta, loading }: Props) {
  return (
    <div
      className={`rounded-xl border border-slate-700 bg-slate-800/60 border-l-4 ${BORDERS[tone]} p-4 shadow-sm transition-all duration-150 hover:bg-slate-800`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
          <div className="mt-2 text-2xl font-semibold text-slate-50 tabular-nums">
            {loading ? <Skeleton className="h-7 w-20" /> : value}
          </div>
          {delta && !loading && (
            <p
              className={`mt-1 text-xs ${delta.positive ? "text-emerald-400" : "text-red-400"}`}
            >
              {delta.value}
            </p>
          )}
        </div>
        <div className={`rounded-lg p-2 ${ICON_TONES[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
