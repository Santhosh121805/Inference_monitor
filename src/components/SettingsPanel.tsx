import { CheckCircle2, Loader2, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { getHealth, isValidUrl } from "../lib/api";
import type { Theme } from "../types";

interface Props {
  gatewayUrl: string;
  setGatewayUrl: (v: string) => void;
  autoRefresh: boolean;
  setAutoRefresh: (v: boolean) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  onClearHistory: () => void;
}

type TestState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; ms: number }
  | { kind: "fail"; message: string };

export function SettingsPanel({
  gatewayUrl,
  setGatewayUrl,
  autoRefresh,
  setAutoRefresh,
  theme,
  setTheme,
  onClearHistory,
}: Props) {
  const [draftUrl, setDraftUrl] = useState(gatewayUrl);
  const [test, setTest] = useState<TestState>({ kind: "idle" });

  const valid = draftUrl === "" || isValidUrl(draftUrl);

  const runTest = async () => {
    if (!isValidUrl(draftUrl)) {
      setTest({ kind: "fail", message: "Invalid URL" });
      return;
    }
    setTest({ kind: "loading" });
    const start = Date.now();
    try {
      await getHealth(draftUrl);
      setTest({ kind: "ok", ms: Date.now() - start });
    } catch (e) {
      setTest({ kind: "fail", message: (e as Error).message });
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-5">
        <h2 className="text-sm font-semibold text-slate-100">Gateway</h2>
        <p className="mt-1 text-xs text-slate-400">Base URL of the API gateway. Saved locally.</p>
        <div className="mt-4 flex gap-2">
          <input
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            placeholder="https://api.example.com"
            className={`flex-1 rounded-lg border bg-slate-950/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none transition-all duration-150 focus:ring-2 focus:ring-indigo-500/30 ${
              valid ? "border-slate-700 focus:border-indigo-500" : "border-red-500/50 focus:border-red-500"
            }`}
          />
          <button
            onClick={() => isValidUrl(draftUrl) && setGatewayUrl(draftUrl)}
            disabled={!isValidUrl(draftUrl)}
            className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white transition-all duration-150 hover:bg-indigo-400 disabled:bg-slate-700 disabled:text-slate-400"
          >
            Save
          </button>
        </div>
        {!valid && <p className="mt-2 text-xs text-red-400">Must be a valid http(s) URL</p>}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={runTest}
            disabled={test.kind === "loading"}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-200 transition-all duration-150 hover:bg-slate-700 disabled:opacity-50"
          >
            {test.kind === "loading" && <Loader2 className="h-3 w-3 animate-spin" />}
            Test connection
          </button>
          {test.kind === "ok" && (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> OK · {test.ms} ms
            </span>
          )}
          {test.kind === "fail" && (
            <span className="inline-flex items-center gap-1.5 font-mono text-xs text-red-400">
              <XCircle className="h-3 w-3" /> {test.message}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-5">
        <h2 className="text-sm font-semibold text-slate-100">Preferences</h2>
        <div className="mt-4 space-y-4">
          <Toggle
            label="Auto-refresh health (15s)"
            description="Polls /health on an interval."
            value={autoRefresh}
            onChange={setAutoRefresh}
          />
          <Toggle
            label="Dark theme"
            description="Use the dark color scheme."
            value={theme === "dark"}
            onChange={(v) => setTheme(v ? "dark" : "light")}
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-5">
        <h2 className="text-sm font-semibold text-slate-100">Maintenance</h2>
        <p className="mt-1 text-xs text-slate-400">
          Wipes in-memory request history (stat cards and metrics stay).
        </p>
        <button
          onClick={onClearHistory}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 transition-all duration-150 hover:bg-red-500/20"
        >
          <Trash2 className="h-3 w-3" /> Clear history
        </button>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>v0.1.0</span>
        <span className="font-mono">{import.meta.env.MODE}</span>
      </div>
    </div>
  );
}

function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-slate-100">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-150 ${
          value ? "bg-indigo-500" : "bg-slate-700"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-150 ${
            value ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}