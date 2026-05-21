import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "error" | "warning" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-700/60 text-slate-200 border-slate-600",
  success: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  error: "bg-red-500/15 text-red-300 border-red-500/30",
  warning: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  info: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
};

interface Props {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = "neutral", children, className = "" }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider transition-all duration-150 ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
