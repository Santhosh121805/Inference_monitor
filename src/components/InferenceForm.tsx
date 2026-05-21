import { Loader2, Play } from "lucide-react";
import { useState } from "react";
import type { InferPayload } from "../types";

interface Props {
  loading: boolean;
  onSubmit: (payload: InferPayload) => void;
  initial?: Partial<InferPayload>;
}

export function InferenceForm({ loading, onSubmit, initial }: Props) {
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [maxTokens, setMaxTokens] = useState(initial?.max_tokens ?? 100);
  const [temperature, setTemperature] = useState(initial?.temperature ?? 0.7);

  // Re-hydrate when "restore from history" updates `initial`.
  // Using a key on the parent is simpler; we accept controlled re-init via props key.

  const charCount = prompt.length;
  const valid = charCount >= 1 && charCount <= 500;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || loading) return;
        onSubmit({ prompt, max_tokens: maxTokens, temperature });
      }}
      className="space-y-5"
    >
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-medium uppercase tracking-wider text-slate-400">Prompt</label>
          <span
            className={`text-xs tabular-nums ${charCount > 500 ? "text-red-400" : "text-slate-500"}`}
          >
            {charCount}/500
          </span>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={500}
          rows={5}
          placeholder="Enter a prompt to send through the worker chain..."
          className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none transition-all duration-150 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-slate-400">
            Max tokens
          </label>
          <input
            type="number"
            min={1}
            max={512}
            value={maxTokens}
            onChange={(e) => setMaxTokens(Math.max(1, Math.min(512, Number(e.target.value) || 1)))}
            className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none transition-all duration-150 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
          />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Temperature
            </label>
            <span className="font-mono text-xs text-slate-300 tabular-nums">{temperature.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-indigo-500"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={!valid || loading}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {loading ? "Running…" : "Run Inference"}
      </button>
    </form>
  );
}
