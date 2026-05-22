/**
 * API Gateway Server
 * Express.js backend for distributed worker mesh
 * Handles inference requests, health checks, and metrics
 */

import express, { Request, Response, NextFunction } from "express";
import {
  requestIdMiddleware,
  loggingMiddleware,
  errorHandlerMiddleware,
  createRateLimiter,
  validateInferRequest,
} from "./middleware.js";
import { config, logConfigInfo } from "./config.js";
import { logger } from "./logger.js";
import { callWorker, isWorkerHealthy } from "./rpc.js";
import {
  InferResponse,
  HealthResponse,
  MetricsResponse,
  GatewayMetrics,
  RpcPayload,
} from "./types.js";

const app = express();

// Global metrics tracker
const metrics: GatewayMetrics = {
  total_requests: 0,
  total_errors: 0,
  total_latency_ms: 0,
  request_count_for_avg: 0,
  startup_time: Date.now(),
};

/**
 * Middleware stack
 */
app.use(express.json());

// Enable CORS for frontend dashboard access
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Request-ID, Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }
  next();
});

app.use(requestIdMiddleware);
app.use(loggingMiddleware);
app.use(createRateLimiter());

/**
 * POST /infer
 * Accept inference request and forward to worker chain
 * Worker 2 (TS) chains to Worker 1 (Python) internally
 */
app.post("/infer", async (req: Request, res: Response, next: NextFunction) => {
  try {
    metrics.total_requests += 1;
    const startTime = Date.now();

    // Validate input
    const validatedInput = validateInferRequest(req.body);

    logger.debug(
      "Processing inference request",
      {
        prompt_length: validatedInput.prompt.length,
        max_tokens: validatedInput.max_tokens,
        temperature: validatedInput.temperature,
      },
      req.id
    );

    // Build RPC payload
    const rpcPayload: RpcPayload = {
      prompt: validatedInput.prompt,
      max_tokens: validatedInput.max_tokens,
      temperature: validatedInput.temperature,
      request_id: req.id,
    };

    // Call TypeScript worker (it chains to Python worker internally)
    const workerResponse = await callWorker(
      "TypeScript",
      config.typescriptWorkerUrl,
      rpcPayload,
      config.requestTimeoutMs
    );

    const latency = Date.now() - startTime;
    metrics.total_latency_ms += latency;
    metrics.request_count_for_avg += 1;

    // Ensure result is a string (should be from worker)
    if (typeof workerResponse.result !== "string") {
      throw new Error("Worker returned invalid result format");
    }

    const response: InferResponse = {
      result: workerResponse.result,
      tokens_used: workerResponse.tokens_used || 0,
      latency_ms: latency,
      worker_chain: workerResponse.worker_chain || ["typescript", "python"],
    };

    logger.info(
      "Inference request completed",
      {
        latency_ms: latency,
        tokens_used: response.tokens_used,
        worker_chain: response.worker_chain,
      },
      req.id
    );

    res.status(200).json(response);
  } catch (error) {
    metrics.total_errors += 1;
    next(error);
  }
});

/**
 * GET /health
 * Health check endpoint
 * Returns status of both workers by pinging their /health endpoints
 */
app.get("/health", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Ping both workers in parallel
    const [pythonHealthy, typescriptHealthy] = await Promise.all([
      isWorkerHealthy("Python", config.pythonWorkerUrl, req.id),
      isWorkerHealthy("TypeScript", config.typescriptWorkerUrl, req.id),
    ]);

    // Determine overall status
    const allHealthy = pythonHealthy && typescriptHealthy;
    const uptime = Math.floor((Date.now() - metrics.startup_time) / 1000);

    const healthResponse: HealthResponse = {
      status: allHealthy ? "ok" : pythonHealthy || typescriptHealthy ? "degraded" : "error",
      workers: {
        python: pythonHealthy ? "reachable" : "unreachable",
        typescript: typescriptHealthy ? "reachable" : "unreachable",
      },
      uptime_seconds: uptime,
    };

    logger.debug(
      "Health check",
      {
        python: healthResponse.workers.python,
        typescript: healthResponse.workers.typescript,
        status: healthResponse.status,
      },
      req.id
    );

    const statusCode = allHealthy ? 200 : pythonHealthy || typescriptHealthy ? 503 : 503;
    res.status(statusCode).json(healthResponse);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /metrics
 * Returns basic statistics about gateway and requests
 */
app.get("/metrics", (req: Request, res: Response) => {
  const uptime = Math.floor((Date.now() - metrics.startup_time) / 1000);
  const averageLatency =
    metrics.request_count_for_avg > 0 ? metrics.total_latency_ms / metrics.request_count_for_avg : 0;

  const metricsResponse: MetricsResponse = {
    total_requests: metrics.total_requests,
    average_latency_ms: Math.round(averageLatency),
    error_count: metrics.total_errors,
    uptime_seconds: uptime,
    last_update_ts: Date.now(),
  };

  logger.debug(
    "Metrics endpoint",
    {
      total_requests: metrics.total_requests,
      average_latency_ms: metricsResponse.average_latency_ms,
      error_count: metrics.total_errors,
      uptime_seconds: uptime,
    },
    req.id
  );

  res.status(200).json(metricsResponse);
});

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: "Not found",
    code: "NOT_FOUND",
    request_id: req.id,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Global error handler (must be last)
 */
app.use(errorHandlerMiddleware);

/**
 * Graceful shutdown handler
 * Handle SIGTERM signal from systemd or container orchestration
 */
function setupGracefulShutdown(): void {
  process.on("SIGTERM", () => {
    logger.info("SIGTERM received, shutting down gracefully...");

    // Stop accepting new requests
    server.close(() => {
      logger.info("Server closed");
      process.exit(0);
    });

    // Force exit after 30 seconds
    setTimeout(() => {
      logger.error("Forced shutdown timeout reached");
      process.exit(1);
    }, 30000);
  });

  process.on("SIGINT", () => {
    logger.info("SIGINT received, shutting down...");
    process.exit(0);
  });
}

/**
 * Start the server
 */
const server = app.listen(config.port, () => {
  logConfigInfo();
  logger.info(`Gateway server started`, {
    port: config.port,
    environment: config.nodeEnv,
  });
});

/**
 * Setup graceful shutdown handlers
 */
setupGracefulShutdown();

/**
 * Handle uncaught exceptions
 */
process.on("uncaughtException", (error) => {
  logger.error(
    `Uncaught exception: ${error.message}`,
    { stack: error.stack }
  );
  process.exit(1);
});

/**
 * Handle unhandled promise rejections
 */
process.on("unhandledRejection", (reason, promise) => {
  logger.error(
    `Unhandled promise rejection`,
    {
      reason: String(reason),
      promise: String(promise),
    }
  );
  process.exit(1);
});

export default app;
