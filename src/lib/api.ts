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

export const getHealth = (baseUrl: string, signal?: AbortSignal) =>
  request<HealthResponse>(baseUrl, "/health", { signal });

export const getMetrics = (baseUrl: string, signal?: AbortSignal) =>
  request<MetricsResponse>(baseUrl, "/metrics", { signal });

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