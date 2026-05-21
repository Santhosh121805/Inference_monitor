import { useCallback, useState } from "react";
import { postInfer } from "../lib/api";
import type { InferLogEntry, InferPayload, InferResponse } from "../types";

const MAX_HISTORY = 20;

interface State {
  loading: boolean;
  result: (InferResponse & { latency: number }) | null;
  error: { message: string; code?: number } | null;
  history: InferLogEntry[];
}

export function useInfer(baseUrl: string) {
  const [state, setState] = useState<State>({
    loading: false,
    result: null,
    error: null,
    history: [],
  });

  const run = useCallback(
    async (payload: InferPayload) => {
      if (!baseUrl) {
        setState((s) => ({ ...s, error: { message: "Gateway URL is not set" } }));
        return;
      }
      setState((s) => ({ ...s, loading: true, error: null, result: null }));
      const start = Date.now();
      try {
        const data = await postInfer(baseUrl, payload);
        const latency = Date.now() - start;
        const entry: InferLogEntry = {
          id: `${start}-${Math.random().toString(36).slice(2, 8)}`,
          time: start,
          prompt: payload.prompt,
          payload,
          latency,
          status: "success",
          workerChain: data.worker_chain ?? [],
          result: data.result,
          tokensUsed: data.tokens_used,
        };
        setState((s) => ({
          loading: false,
          result: { ...data, latency },
          error: null,
          history: [entry, ...s.history].slice(0, MAX_HISTORY),
        }));
      } catch (e) {
        const err = e as Error & { code?: number };
        const latency = Date.now() - start;
        const entry: InferLogEntry = {
          id: `${start}-${Math.random().toString(36).slice(2, 8)}`,
          time: start,
          prompt: payload.prompt,
          payload,
          latency,
          status: "error",
          workerChain: [],
          error: err.message,
        };
        setState((s) => ({
          loading: false,
          result: null,
          error: { message: err.message, code: err.code },
          history: [entry, ...s.history].slice(0, MAX_HISTORY),
        }));
      }
    },
    [baseUrl],
  );

  const reset = useCallback(
    () => setState((s) => ({ ...s, result: null, error: null })),
    [],
  );

  const clearHistory = useCallback(
    () => setState((s) => ({ ...s, history: [] })),
    [],
  );

  return { run, reset, clearHistory, ...state };
}