import { Activity, Moon, Sun, Terminal, Settings as SettingsIcon } from "lucide-react";
import { StatusDot } from "./StatusDot";
import type { Theme } from "../types";

export type Tab = "dashboard" | "infer" | "settings";

interface Props {
  tab: Tab;
  onTab: (t: Tab) => void;
  connected: boolean | null;
  gatewayUrl: string;
  theme: Theme;
  onToggleTheme: () => void;
}

const TABS: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: "dashboard", label: "Dashboard", icon: Activity },
  { id: "infer", label: "Inference Tester", icon: Terminal },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export function Navbar({ tab, onTab, connected, gatewayUrl, theme, onToggleTheme }: Props) {
  const status = connected === null ? "yellow" : connected ? "green" : "red";
  const label = connected === null ? "Connecting" : connected ? "Connected" : "Offline";
  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500/15 text-indigo-400">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-100">Inference Mesh</h1>
            <p className="font-mono text-[10px] text-slate-500">ops console</p>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          {TABS.map((t) => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => onTab(t.id)}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-all duration-150 ${
                  active
                    ? "bg-slate-800 text-slate-100"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/60 px-3 py-1.5">
            <StatusDot status={status} pulse={status === "green"} size="sm" />
            <span className="text-xs text-slate-300">{label}</span>
            <span className="hidden font-mono text-[11px] text-slate-500 md:inline">
              {gatewayUrl || "no gateway"}
            </span>
          </div>
          <button
            onClick={onToggleTheme}
            className="inline-flex items-center justify-center rounded-md border border-slate-800 bg-slate-900/60 p-2 text-slate-300 transition-all duration-150 hover:bg-slate-800"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </header>
  );
}
