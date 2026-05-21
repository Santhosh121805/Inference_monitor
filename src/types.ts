export type WorkerName = "python" | "typescript";

export interface WorkerStatus {
  name: string;
  reachable: boolean;
  lastChecked: number;
}

export interface HealthResponse {
  uptime: number;
  workers: {
    python: { reachable: boolean };
    typescript: { reachable: boolean };
  };
}

export interface MetricsResponse {
  total_requests: number;
  avg_latency_ms: number;
  error_count: number;
  uptime: number;
}

export interface InferPayload {
  prompt: string;
  max_tokens: number;
  temperature: number;
}

export interface InferResponse {
  result: string;
  tokens_used: number;
  worker_chain: string[];
}

export interface InferLogEntry {
  id: string;
  time: number;
  prompt: string;
  payload: InferPayload;
  latency: number;
  status: "success" | "error";
  workerChain: string[];
  result?: string;
  tokensUsed?: number;
  error?: string;
}

export interface ApiError {
  message: string;
  code?: string | number;
}

export type Theme = "dark" | "light";

export interface SettingsState {
  gatewayUrl: string;
  autoRefresh: boolean;
  theme: Theme;
}