import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Activity,
  AlertOctagon,
  ChevronRight,
  Clock,
  History,
  Settings as SettingsIcon,
  Timer,
  Zap,
} from "lucide-react";
import { Navbar, type Tab } from "../components/Navbar";
import { StatCard } from "../components/StatCard";
import { WorkerCard } from "../components/WorkerCard";
import { LatencyChart } from "../components/LatencyChart";
import { RequestTable } from "../components/RequestTable";
import { InferenceForm } from "../components/InferenceForm";
import { ResponsePanel } from "../components/ResponsePanel";
import { ErrorState } from "../components/ErrorState";
import { SettingsPanel } from "../components/SettingsPanel";
import { Skeleton } from "../components/Skeleton";
import { useSettings } from "../hooks/useSettings";
import { useHealth } from "../hooks/useHealth";
import { useMetrics } from "../hooks/useMetrics";
import { useInfer } from "../hooks/useInfer";
import { formatUptime } from "../lib/api";
import type { InferPayload } from "../types";

export const Route = createFileRoute("/")({
  component: App,
});

function App() {
  const {
    gatewayUrl,
    setGatewayUrl,
    autoRefresh,
    setAutoRefresh,
    theme,
    setTheme,
  } = useSettings();
  const [tab, setTab] = useState<Tab>("dashboard");

  // If gateway is not configured, show full-page prompt.
  if (!gatewayUrl) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-xl items-center px-6">
          <ConfigurePrompt onSave={setGatewayUrl} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <ShellWithGateway
        gatewayUrl={gatewayUrl}
        autoRefresh={autoRefresh}
        setAutoRefresh={setAutoRefresh}
        setGatewayUrl={setGatewayUrl}
        theme={theme}
        setTheme={setTheme}
        tab={tab}
        setTab={setTab}
      />
    </div>
  );
}

function ConfigurePrompt({ onSave }: { onSave: (v: string) => void }) {
  const [v, setV] = useState("");
  const valid = (() => {
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  })();
  return (
    <div className="w-full rounded-xl border border-slate-700 bg-slate-900/60 p-8 shadow-lg">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-500/15 text-indigo-400">
        <Activity className="h-5 w-5" />
      </div>
      <h1 className="mt-4 text-lg font-semibold">Connect your gateway</h1>
      <p className="mt-1 text-sm text-slate-400">
        Enter the base URL of the Inference Mesh API gateway to get started.
      </p>
      <div className="mt-5 flex gap-2">
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="https://gateway.example.com"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
        />
        <button
          onClick={() => valid && onSave(v)}
          disabled={!valid}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:bg-indigo-400 disabled:bg-slate-700 disabled:text-slate-400"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

interface ShellProps {
  gatewayUrl: string;
  setGatewayUrl: (v: string) => void;
  autoRefresh: boolean;
  setAutoRefresh: (v: boolean) => void;
  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;
  tab: Tab;
  setTab: (t: Tab) => void;
}

function ShellWithGateway({
  gatewayUrl,
  setGatewayUrl,
  autoRefresh,
  setAutoRefresh,
  theme,
  setTheme,
  tab,
  setTab,
}: ShellProps) {
  // Hooks pinned to the configured gateway. Re-mount on URL change is handled via key in <App/>.
  const health = useHealth(gatewayUrl, 15_000, autoRefresh);
  const metrics = useMetrics(gatewayUrl, 30_000);
  const infer = useInfer(gatewayUrl);

  const connected =
    health.data === null && health.error === null ? null : health.error ? false : true;

  return (
    <>
      <Navbar
        tab={tab}
        onTab={setTab}
        connected={connected}
        gatewayUrl={gatewayUrl}
        theme={theme}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
      />
      <main className="mx-auto max-w-[1400px] px-6 py-6">
        {tab === "dashboard" && (
          <DashboardView
            health={health}
            metrics={metrics}
            history={infer.history}
          />
        )}
        {tab === "infer" && (
          <InferView
            loading={infer.loading}
            result={infer.result}
            error={infer.error}
            history={infer.history}
            run={infer.run}
            reset={infer.reset}
          />
        )}
        {tab === "settings" && (
          <SettingsPanel
            gatewayUrl={gatewayUrl}
            setGatewayUrl={setGatewayUrl}
            autoRefresh={autoRefresh}
            setAutoRefresh={setAutoRefresh}
            theme={theme}
            setTheme={setTheme}
            onClearHistory={infer.clearHistory}
          />
        )}
      </main>
    </>
  );
}

function DashboardView({
  health,
  metrics,
  history,
}: {
  health: ReturnType<typeof useHealth>;
  metrics: ReturnType<typeof useMetrics>;
  history: ReturnType<typeof useInfer>["history"];
}) {
  const m = metrics.data;
  const errorRate =
    m && m.total_requests > 0 ? (m.error_count / m.total_requests) * 100 : 0;
  const errorTone: "neutral" | "good" | "bad" =
    errorRate === 0 ? "good" : errorRate > 5 ? "bad" : "neutral";

  // Latency series sourced from local infer history (last 20, chronological).
  const series = useMemo(
    () =>
      history
        .slice()
        .reverse()
        .map((h, i) => ({ request: i + 1, latency: h.latency })),
    [history],
  );

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total requests"
          value={m ? m.total_requests.toLocaleString() : "—"}
          icon={Zap}
          tone="neutral"
          loading={metrics.loading && !m}
        />
        <StatCard
          label="Avg latency"
          value={m ? `${Math.round(m.avg_latency_ms)} ms` : "—"}
          icon={Timer}
          tone="neutral"
          loading={metrics.loading && !m}
        />
        <StatCard
          label="Error rate"
          value={m ? `${errorRate.toFixed(2)}%` : "—"}
          icon={AlertOctagon}
          tone={errorTone}
          loading={metrics.loading && !m}
        />
        <StatCard
          label="Uptime"
          value={m ? formatUptime(m.uptime) : "—"}
          icon={Clock}
          tone="good"
          loading={metrics.loading && !m}
        />
      </section>

      {metrics.error && (
        <ErrorState message={`/metrics — ${metrics.error}`} onRetry={metrics.refresh} />
      )}

      {/* Workers + Chart */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Worker mesh
          </h2>
          {health.error && !health.data ? (
            <ErrorState message={`/health — ${health.error}`} onRetry={health.refresh} />
          ) : !health.data ? (
            <>
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </>
          ) : (
            <>
              <WorkerCard
                name="Python Worker"
                reachable={health.data.workers?.python?.reachable ?? false}
                lastChecked={health.lastChecked}
                onPing={health.refresh}
                loading={health.loading}
              />
              <WorkerCard
                name="TypeScript Worker"
                reachable={health.data.workers?.typescript?.reachable ?? false}
                lastChecked={health.lastChecked}
                onPing={health.refresh}
                loading={health.loading}
              />
            </>
          )}
        </div>
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Latency · last {series.length || 0} requests
              </h2>
              <span className="font-mono text-[11px] text-slate-500">live</span>
            </div>
            <LatencyChart data={series} />
          </div>
        </div>
      </section>

      {/* Recent requests */}
      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-400">
          Recent requests
        </h2>
        <RequestTable rows={history} />
      </section>
    </div>
  );
}

function InferView({
  loading,
  result,
  error,
  history,
  run,
  reset,
}: {
  loading: boolean;
  result: ReturnType<typeof useInfer>["result"];
  error: ReturnType<typeof useInfer>["error"];
  history: ReturnType<typeof useInfer>["history"];
  run: (p: InferPayload) => void;
  reset: () => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(true);
  const [formKey, setFormKey] = useState(0);
  const [initial, setInitial] = useState<Partial<InferPayload> | undefined>();

  const handleRestore = (entry: (typeof history)[number]) => {
    setInitial(entry.payload);
    setFormKey((k) => k + 1);
    reset();
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-5">
        <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-5 shadow-lg">
          <div className="mb-4 flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-indigo-500/15 text-indigo-400">
              <SettingsIcon className="h-3.5 w-3.5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Inference Tester</h2>
              <p className="font-mono text-[10px] text-slate-500">POST /infer</p>
            </div>
          </div>
          <InferenceForm key={formKey} loading={loading} onSubmit={run} initial={initial} />
        </div>

        {loading && (
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-3 h-32 w-full" />
            <div className="mt-3 flex gap-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-sm font-medium text-red-200">Inference failed</p>
            <p className="mt-1 font-mono text-xs text-red-300/80">
              {error.code ? `[${error.code}] ` : ""}
              {error.message}
            </p>
          </div>
        )}

        {!loading && result && <ResponsePanel result={result} onRunAgain={reset} />}
      </div>

      {/* History sidebar */}
      <aside className="rounded-xl border border-slate-700 bg-slate-800/40">
        <button
          onClick={() => setHistoryOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-300">
            <History className="h-3.5 w-3.5" />
            Recent prompts
          </span>
          <ChevronRight
            className={`h-3.5 w-3.5 text-slate-500 transition-transform duration-150 ${
              historyOpen ? "rotate-90" : ""
            }`}
          />
        </button>
        {historyOpen && (
          <div className="border-t border-slate-700/60 p-2">
            {history.length === 0 ? (
              <p className="px-2 py-4 text-xs text-slate-500">No prompts yet.</p>
            ) : (
              <ul className="space-y-1">
                {history.slice(0, 5).map((h) => (
                  <li key={h.id}>
                    <button
                      onClick={() => handleRestore(h)}
                      className="block w-full rounded-md px-2 py-2 text-left transition-colors duration-150 hover:bg-slate-800"
                    >
                      <p className="line-clamp-2 font-mono text-xs text-slate-200">
                        {h.prompt}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-slate-500">
                        {h.status} · {h.latency} ms · t={h.payload.temperature.toFixed(1)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
