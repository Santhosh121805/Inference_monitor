/**
 * JSON Logger Module
 * All logs in JSON format for cloud log aggregation compatibility
 */

import { JsonLog } from "./types.js";
import { config } from "./config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Log levels with numeric values for filtering
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Is this log level enabled based on config?
 */
function isLevelEnabled(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[config.logLevel];
}

/**
 * Format and output JSON log
 */
function outputLog(log: JsonLog): void {
  console.log(JSON.stringify(log));
}

/**
 * Create and output a JSON log entry
 */
function log(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
  requestId?: string
): void {
  if (!isLevelEnabled(level)) {
    return;
  }

  const logEntry: JsonLog = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(requestId && { request_id: requestId }),
    ...(meta && { meta }),
  };

  outputLog(logEntry);
}

export const logger = {
  /**
   * Debug level - for RPC calls, internal state, etc.
   */
  debug: (message: string, meta?: Record<string, unknown>, requestId?: string): void => {
    log("debug", message, meta, requestId);
  },

  /**
   * Info level - for important events
   */
  info: (message: string, meta?: Record<string, unknown>, requestId?: string): void => {
    log("info", message, meta, requestId);
  },

  /**
   * Warn level - for potentially problematic situations
   */
  warn: (message: string, meta?: Record<string, unknown>, requestId?: string): void => {
    log("warn", message, meta, requestId);
  },

  /**
   * Error level - for error conditions
   */
  error: (message: string, meta?: Record<string, unknown>, requestId?: string): void => {
    log("error", message, meta, requestId);
  },

  /**
   * Log HTTP request
   */
  logHttpRequest: (
    method: string,
    path: string,
    requestId: string
  ): void => {
    log("info", `${method} ${path}`, { method, path }, requestId);
  },

  /**
   * Log HTTP response
   */
  logHttpResponse: (
    method: string,
    path: string,
    status: number,
    latencyMs: number,
    requestId: string
  ): void => {
    log(
      status >= 400 ? "warn" : "info",
      `${method} ${path} ${status}`,
      {
        method,
        path,
        status,
        latency_ms: latencyMs,
      },
      requestId
    );
  },
};
