import type { HealthResponse, InferPayload, InferResponse, MetricsResponse } from "../types";

async function request<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => "");
    }
    const message =
      (typeof body === "object" && body && "error" in body && String((body as { error: unknown }).error)) ||
      (typeof body === "object" && body && "message" in body && String((body as { message: unknown }).message)) ||
      `${res.status} ${res.statusText}`;
    const err = new Error(message) as Error & { code?: number };
    err.code = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

export const getHealth = async (baseUrl: string, signal?: AbortSignal): Promise<HealthResponse> => {
  const raw = await request<any>(baseUrl, "/health", { signal });
  
  const normalizeWorker = (w: any) => {
    if (typeof w === "string") {
      return { reachable: w === "reachable" };
    }
    if (w && typeof w === "object" && "reachable" in w) {
      return { reachable: !!w.reachable };
    }
    return { reachable: false };
  };

  return {
    uptime: raw.uptime_seconds ?? raw.uptime ?? 0,
    workers: {
      python: normalizeWorker(raw.workers?.python),
      typescript: normalizeWorker(raw.workers?.typescript),
    },
  };
};

export const getMetrics = async (baseUrl: string, signal?: AbortSignal): Promise<MetricsResponse> => {
  const raw = await request<any>(baseUrl, "/metrics", { signal });
  return {
    total_requests: raw.total_requests ?? 0,
    avg_latency_ms: raw.average_latency_ms ?? raw.avg_latency_ms ?? 0,
    error_count: raw.error_count ?? 0,
    uptime: raw.uptime_seconds ?? raw.uptime ?? 0,
  };
};

export const postInfer = (baseUrl: string, payload: InferPayload, signal?: AbortSignal) =>
  request<InferResponse>(baseUrl, "/infer", {
    method: "POST",
    body: JSON.stringify(payload),
    signal,
  });

export function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}