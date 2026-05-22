/**
 * RPC Client Module
 * Handles worker communication with retry logic, timeouts, and error handling
 */

import axios, { AxiosError } from "axios";
import {
  WorkerUnreachableError,
  WorkerTimeoutError,
  WorkerResponseError,
  RpcPayload,
  InferResponse,
} from "./types.js";
import { logger } from "./logger.js";

/**
 * Exponential backoff retry configuration
 */
const RETRY_CONFIG = {
  maxAttempts: 3,
  backoffMs: [100, 200, 400],
};

/**
 * Call a worker RPC endpoint with retry logic and timeout handling
 *
 * @param workerName - Name of worker for logging (e.g., "TypeScript", "Python")
 * @param workerUrl - Full URL of worker endpoint
 * @param payload - RPC payload to send
 * @param timeoutMs - Request timeout in milliseconds
 * @returns Worker response
 * @throws WorkerTimeoutError, WorkerUnreachableError, WorkerResponseError
 */
export async function callWorker(
  workerName: string,
  workerUrl: string,
  payload: RpcPayload,
  timeoutMs: number
): Promise<InferResponse> {
  let lastError: Error = new Error("Unknown error");
  const startTime = Date.now();

  for (let attempt = 0; attempt < RETRY_CONFIG.maxAttempts; attempt++) {
    try {
      logger.debug(
        `RPC call to ${workerName}`,
        {
          worker: workerName,
          url: workerUrl,
          attempt: attempt + 1,
          requestId: payload.request_id,
        },
        payload.request_id
      );

      const response = await axios.post<InferResponse>(
        `${workerUrl}/infer`,
        payload,
        {
          timeout: timeoutMs,
          validateStatus: (status) => status < 500, // Don't throw on 4xx/5xx
        }
      );

      if (response.status >= 400) {
        lastError = new WorkerResponseError(
          workerName,
          response.status,
          response.data,
          payload.request_id
        );

        logger.error(
          `${workerName} returned error status`,
          {
            worker: workerName,
            status: response.status,
            attempt: attempt + 1,
            requestId: payload.request_id,
          },
          payload.request_id
        );

        throw lastError;
      }

      const latency = Date.now() - startTime;
      logger.debug(
        `RPC call succeeded`,
        {
          worker: workerName,
          latency_ms: latency,
          attempt: attempt + 1,
          requestId: payload.request_id,
        },
        payload.request_id
      );

      return response.data;
    } catch (error) {
      const isAxiosError = axios.isAxiosError(error);
      const axiosError = error as AxiosError;

      if (axiosError.code === "ECONNABORTED" || axiosError.message.includes("timeout")) {
        lastError = new WorkerTimeoutError(
          workerName,
          timeoutMs,
          payload.request_id
        );
        logger.debug(
          `${workerName} request timed out`,
          {
            worker: workerName,
            timeout_ms: timeoutMs,
            attempt: attempt + 1,
            requestId: payload.request_id,
          },
          payload.request_id
        );
      } else if (isAxiosError && !axiosError.response) {
        // Network error - unreachable
        lastError = new WorkerUnreachableError(
          workerName,
          workerUrl,
          error as Error,
          payload.request_id
        );
        logger.debug(
          `${workerName} is unreachable`,
          {
            worker: workerName,
            url: workerUrl,
            attempt: attempt + 1,
            error: (error as Error).message,
            requestId: payload.request_id,
          },
          payload.request_id
        );
      } else if (error instanceof WorkerResponseError) {
        // Already typed error
        lastError = error;
        throw error; // Don't retry on response errors
      } else {
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      // Retry with exponential backoff
      if (attempt < RETRY_CONFIG.maxAttempts - 1) {
        const backoffTime = RETRY_CONFIG.backoffMs[attempt];
        await new Promise((resolve) => setTimeout(resolve, backoffTime));
      }
    }
  }

  // All retries exhausted
  throw lastError;
}

/**
 * Check if a worker is reachable via health endpoint
 *
 * @param workerName - Name of worker for logging
 * @param workerUrl - Full URL of worker
 * @returns true if worker is reachable, false otherwise
 */
export async function isWorkerHealthy(
  workerName: string,
  workerUrl: string,
  requestId?: string
): Promise<boolean> {
  try {
    logger.debug(
      `Health check for ${workerName}`,
      {
        worker: workerName,
        url: workerUrl,
        requestId,
      },
      requestId
    );

    const response = await axios.get(`${workerUrl}/health`, {
      timeout: 5000, // Health checks have shorter timeout
      validateStatus: (status) => status < 500,
    });

    const isHealthy = response.status === 200;

    logger.debug(
      `${workerName} health check result`,
      {
        worker: workerName,
        status: response.status,
        healthy: isHealthy,
        requestId,
      },
      requestId
    );

    return isHealthy;
  } catch (error) {
    logger.debug(
      `${workerName} health check failed`,
      {
        worker: workerName,
        error: error instanceof Error ? error.message : "Unknown error",
        requestId,
      },
      requestId
    );
    return false;
  }
}
