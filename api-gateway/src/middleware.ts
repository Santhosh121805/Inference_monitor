/**
 * Middleware functions for the API Gateway
 * Request ID injection, logging, error handling, rate limiting
 */

import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import rateLimit from "express-rate-limit";
import { logger } from "./logger.js";
import { config } from "./config.js";
import {
  ErrorResponse,
  WorkerTimeoutError,
  WorkerUnreachableError,
  WorkerResponseError,
  ValidationError,
} from "./types.js";

/**
 * Extend Express Request to include custom properties
 */
declare global {
  namespace Express {
    interface Request {
      id: string;
      startTime: number;
      rateLimit?: {
        current: number;
        limit: number;
      };
    }
  }
}

/**
 * Middleware: Inject request ID into every request
 * Attaches UUID to X-Request-ID header
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  req.id = req.get("X-Request-ID") || uuidv4();
  res.setHeader("X-Request-ID", req.id);
  req.startTime = Date.now();
  next();
}

/**
 * Middleware: Log all HTTP requests and responses
 * JSON format with method, path, status, latency, request ID
 */
export function loggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.logHttpRequest(req.method, req.path, req.id);

  // Capture the response
  const originalSend = res.send;
  res.send = function (data: unknown) {
    const latency = Date.now() - req.startTime;
    logger.logHttpResponse(req.method, req.path, res.statusCode, latency, req.id);
    return originalSend.call(this, data);
  };

  next();
}

/**
 * Middleware: Global error handler
 * Catches all errors and returns structured JSON response
 */
export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.id || "unknown";
  const timestamp = new Date().toISOString();

  let statusCode = 500;
  let errorCode = "INTERNAL_SERVER_ERROR";
  let message = "An unexpected error occurred";

  if (err instanceof ValidationError) {
    statusCode = 400;
    errorCode = "VALIDATION_ERROR";
    message = err.message;
    logger.warn(
      `Validation error: ${err.field}`,
      {
        field: err.field,
        message: err.message,
      },
      requestId
    );
  } else if (err instanceof WorkerTimeoutError) {
    statusCode = 504;
    errorCode = "WORKER_TIMEOUT";
    message = `Worker ${err.workerName} timed out after ${err.timeoutMs}ms`;
    logger.error(
      `Worker timeout`,
      {
        worker: err.workerName,
        timeout_ms: err.timeoutMs,
      },
      requestId
    );
  } else if (err instanceof WorkerUnreachableError) {
    statusCode = 502;
    errorCode = "WORKER_UNREACHABLE";
    message = `Worker ${err.workerName} is unreachable`;
    logger.error(
      `Worker unreachable`,
      {
        worker: err.workerName,
        url: err.url,
        error: err.originalError.message,
      },
      requestId
    );
  } else if (err instanceof WorkerResponseError) {
    statusCode = 502;
    errorCode = "WORKER_ERROR";
    message = `Worker ${err.workerName} returned error status ${err.statusCode}`;
    logger.error(
      `Worker error response`,
      {
        worker: err.workerName,
        status: err.statusCode,
      },
      requestId
    );
  } else if (err instanceof SyntaxError && "status" in err && err.status === 400) {
    // JSON parsing error
    statusCode = 400;
    errorCode = "INVALID_JSON";
    message = "Request body must be valid JSON";
  } else if (err instanceof Error) {
    statusCode = 500;
    errorCode = "UNHANDLED_ERROR";
    message = err.message;
    logger.error(
      `Unhandled error: ${err.message}`,
      { stack: err.stack },
      requestId
    );
  } else {
    logger.error(
      `Unknown error type`,
      { error: String(err) },
      requestId
    );
  }

  const errorResponse: ErrorResponse = {
    error: message,
    code: errorCode,
    request_id: requestId,
    timestamp,
  };

  res.status(statusCode).json(errorResponse);
}

/**
 * Create and return rate limiter middleware
 * Max X requests per minute per IP
 */
export function createRateLimiter(): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMaxRequests,
    message: {
      error: "Too many requests, please try again later",
      code: "RATE_LIMITED",
    },
    standardHeaders: false, // Return rate limit info in RateLimit-* headers
    legacyHeaders: false, // Disable X-RateLimit-* headers
    skip: (req) => {
      // Log rate limit events at debug level (not INFO to avoid spam)
      if (req.rateLimit && req.rateLimit.limit && req.rateLimit.current > config.rateLimitMaxRequests * 0.8) {
        logger.debug(
          `Rate limit approaching`,
          {
            current: req.rateLimit.current,
            limit: req.rateLimit.limit,
            ip: req.ip,
          },
          req.id
        );
      }
      return false;
    },
  });
}

/**
 * Validation helper: validate input request
 */
export function validateInferRequest(data: unknown): { prompt: string; max_tokens?: number; temperature?: number } {
  if (typeof data !== "object" || data === null) {
    throw new ValidationError("body", "Request body must be a JSON object");
  }

  const body = data as Record<string, unknown>;

  // Validate prompt
  if (!("prompt" in body) || typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
    throw new ValidationError("prompt", "prompt is required and must be a non-empty string");
  }

  // Validate max_tokens (optional)
  if ("max_tokens" in body) {
    if (typeof body.max_tokens !== "number" || body.max_tokens < 1 || body.max_tokens > 512) {
      throw new ValidationError("max_tokens", "max_tokens must be between 1 and 512");
    }
  }

  // Validate temperature (optional)
  if ("temperature" in body) {
    if (typeof body.temperature !== "number" || body.temperature < 0 || body.temperature > 1) {
      throw new ValidationError("temperature", "temperature must be between 0 and 1");
    }
  }

  return {
    prompt: body.prompt as string,
    max_tokens: body.max_tokens as number | undefined,
    temperature: body.temperature as number | undefined,
  };
}
