/**
 * API Gateway Backend - Type definitions
 * Fully typed with no `any` - strict mode enforced
 */

/**
 * Inbound inference request structure
 */
export interface InferRequest {
  prompt: string;
  max_tokens?: number;
  temperature?: number;
}

/**
 * Response from worker inference chain
 */
export interface InferResponse {
  result: string;
  tokens_used: number;
  latency_ms: number;
  worker_chain: string[];
}

/**
 * Health check response showing worker reachability
 */
export interface HealthResponse {
  status: "ok" | "degraded" | "error";
  workers: {
    python: "reachable" | "unreachable";
    typescript: "reachable" | "unreachable";
  };
  uptime_seconds: number;
}

/**
 * Metrics endpoint response
 */
export interface MetricsResponse {
  total_requests: number;
  average_latency_ms: number;
  error_count: number;
  uptime_seconds: number;
  last_update_ts: number;
}

/**
 * Status of a worker health check
 */
export type WorkerStatus = "reachable" | "unreachable";

/**
 * Standardized error response structure
 */
export interface ErrorResponse {
  error: string;
  code: string;
  request_id: string;
  timestamp: string;
}

/**
 * RPC error types - used for worker communication failures
 */
export class WorkerTimeoutError extends Error {
  constructor(
    public workerName: string,
    public timeoutMs: number,
    public requestId?: string
  ) {
    super(`Worker ${workerName} timed out after ${timeoutMs}ms`);
    this.name = "WorkerTimeoutError";
  }
}

export class WorkerUnreachableError extends Error {
  constructor(
    public workerName: string,
    public url: string,
    public originalError: Error,
    public requestId?: string
  ) {
    super(`Worker ${workerName} at ${url} is unreachable: ${originalError.message}`);
    this.name = "WorkerUnreachableError";
  }
}

export class WorkerResponseError extends Error {
  constructor(
    public workerName: string,
    public statusCode: number,
    public response: unknown,
    public requestId?: string
  ) {
    super(`Worker ${workerName} returned error status ${statusCode}`);
    this.name = "WorkerResponseError";
  }
}

export class ValidationError extends Error {
  constructor(
    public field: string,
    public message: string,
    public requestId?: string
  ) {
    super(`Validation error on field ${field}: ${message}`);
    this.name = "ValidationError";
  }
}

/**
 * Internal RPC payload sent to workers
 */
export interface RpcPayload {
  prompt: string;
  max_tokens?: number;
  temperature?: number;
  request_id: string;
}

/**
 * Worker health check endpoint response
 */
export interface WorkerHealthResponse {
  status: "ok" | "error";
  timestamp: number;
}

/**
 * Metrics tracked in memory for the /metrics endpoint
 */
export interface GatewayMetrics {
  total_requests: number;
  total_errors: number;
  total_latency_ms: number;
  request_count_for_avg: number;
  startup_time: number;
}

/**
 * JSON log structure for all logging
 */
export interface JsonLog {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  request_id?: string;
  message: string;
  meta?: Record<string, unknown>;
}
