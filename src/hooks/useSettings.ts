import { useCallback, useEffect, useState } from "react";
import type { Theme } from "../types";

const KEY = "inference-mesh.settings.v1";

interface Stored {
  gatewayUrl: string;
  autoRefresh: boolean;
  theme: Theme;
}

const DEFAULTS: Stored = {
  gatewayUrl: "",
  autoRefresh: true,
  theme: "dark",
};

function read(): Stored {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Stored>) };
  } catch {
    return DEFAULTS;
  }
}

export function useSettings() {
  const [state, setState] = useState<Stored>(DEFAULTS);

  // Hydrate from localStorage on client to avoid SSR mismatch.
  useEffect(() => {
    setState(read());
  }, []);

  // Persist + sync theme class to <html>.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(KEY, JSON.stringify(state));
    const root = document.documentElement;
    if (state.theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [state]);

  const setGatewayUrl = useCallback(
    (gatewayUrl: string) => setState((s) => ({ ...s, gatewayUrl })),
    [],
  );
  const setAutoRefresh = useCallback(
    (autoRefresh: boolean) => setState((s) => ({ ...s, autoRefresh })),
    [],
  );
  const setTheme = useCallback((theme: Theme) => setState((s) => ({ ...s, theme })), []);

  return {
    gatewayUrl: state.gatewayUrl,
    autoRefresh: state.autoRefresh,
    theme: state.theme,
    setGatewayUrl,
    setAutoRefresh,
    setTheme,
  };
}