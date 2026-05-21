import { Check, ChevronRight, Copy, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { InferResponse } from "../types";

interface Props {
  result: InferResponse & { latency: number };
  onRunAgain: () => void;
}

export function ResponsePanel({ result, onRunAgain }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.result);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400">Response</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-2 py-1 text-xs text-slate-300 transition-all duration-150 hover:bg-slate-700"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={onRunAgain}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-2 py-1 text-xs text-slate-300 transition-all duration-150 hover:bg-slate-700"
          >
            <RefreshCw className="h-3 w-3" />
            Run again
          </button>
        </div>
      </div>
      <pre className="max-h-72 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-sm leading-relaxed text-slate-100 whitespace-pre-wrap">
        {result.result}
      </pre>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-400">
        <div>
          <span className="text-slate-500">Tokens used</span>{" "}
          <span className="font-mono text-slate-200">{result.tokens_used}</span>
        </div>
        <div>
          <span className="text-slate-500">Latency</span>{" "}
          <span className="font-mono text-slate-200">{result.latency} ms</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Chain</span>
          {(result.worker_chain ?? []).map((w, i, arr) => (
            <span key={`${w}-${i}`} className="flex items-center gap-1.5 font-mono text-slate-200">
              {w}
              {i < arr.length - 1 && <ChevronRight className="h-3 w-3 text-slate-600" />}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
