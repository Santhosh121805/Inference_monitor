import { useCallback, useEffect, useRef, useState } from "react";
import { getMetrics } from "../lib/api";
import type { MetricsResponse } from "../types";

interface State {
  data: MetricsResponse | null;
  loading: boolean;
  error: string | null;
}

export function useMetrics(baseUrl: string, intervalMs = 30_000) {
  const [state, setState] = useState<State>({ data: null, loading: false, error: null });
  const abortRef = useRef<AbortController | null>(null);

  const fetchOnce = useCallback(async () => {
    if (!baseUrl) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await getMetrics(baseUrl, ctrl.signal);
      setState({ data, loading: false, error: null });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setState({ data: null, loading: false, error: (e as Error).message });
    }
  }, [baseUrl]);

  useEffect(() => {
    if (!baseUrl) return;
    fetchOnce();
    const id = window.setInterval(fetchOnce, intervalMs);
    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
    };
  }, [baseUrl, intervalMs, fetchOnce]);

  return { ...state, refresh: fetchOnce };
}
