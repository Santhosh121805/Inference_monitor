import { useCallback, useEffect, useRef, useState } from "react";
import { getHealth } from "../lib/api";
import type { HealthResponse } from "../types";

interface State {
  data: HealthResponse | null;
  loading: boolean;
  error: string | null;
  lastChecked: number | null;
}

export function useHealth(baseUrl: string, intervalMs: number, enabled: boolean) {
  const [state, setState] = useState<State>({
    data: null,
    loading: false,
    error: null,
    lastChecked: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const fetchOnce = useCallback(async () => {
    if (!baseUrl) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await getHealth(baseUrl, ctrl.signal);
      setState({ data, loading: false, error: null, lastChecked: Date.now() });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setState({
        data: null,
        loading: false,
        error: (e as Error).message,
        lastChecked: Date.now(),
      });
    }
  }, [baseUrl]);

  useEffect(() => {
    if (!baseUrl) return;
    fetchOnce();
    if (!enabled) return;
    const id = window.setInterval(fetchOnce, intervalMs);
    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
    };
  }, [baseUrl, enabled, intervalMs, fetchOnce]);

  return { ...state, refresh: fetchOnce };
}
