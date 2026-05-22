/**
 * Configuration management for the API Gateway
 * Loads all config from environment variables with validation
 * Fails fast at startup if required vars are missing
 */

import { z } from "zod";

/**
 * Configuration schema - validated at startup
 */
const ConfigSchema = z.object({
  pythonWorkerUrl: z
    .string()
    .url("PYTHON_WORKER_URL must be a valid URL")
    .describe("Private IP:port of Python worker"),
  typescriptWorkerUrl: z
    .string()
    .url("TYPESCRIPT_WORKER_URL must be a valid URL")
    .describe("Private IP:port of TypeScript worker"),
  port: z
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(3000)
    .describe("Server port"),
  requestTimeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(300000)
    .default(30000)
    .describe("RPC request timeout in milliseconds"),
  logLevel: z
    .enum(["debug", "info", "warn", "error"])
    .default("info")
    .describe("Log level"),
  nodeEnv: z
    .enum(["development", "production", "test"])
    .default("production")
    .describe("Node environment"),
  rateLimitWindowMs: z
    .number()
    .int()
    .min(1000)
    .default(60000)
    .describe("Rate limit window (1 minute default)"),
  rateLimitMaxRequests: z
    .number()
    .int()
    .min(1)
    .default(60)
    .describe("Max requests per window per IP"),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Load and validate configuration from environment variables
 * Throws at startup if validation fails
 */
export function loadConfig(): Config {
  const rawConfig = {
    pythonWorkerUrl: process.env.PYTHON_WORKER_URL,
    typescriptWorkerUrl: process.env.TYPESCRIPT_WORKER_URL,
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
    requestTimeoutMs: process.env.REQUEST_TIMEOUT_MS
      ? parseInt(process.env.REQUEST_TIMEOUT_MS, 10)
      : undefined,
    logLevel: process.env.LOG_LEVEL,
    nodeEnv: process.env.NODE_ENV,
    rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS
      ? parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10)
      : undefined,
    rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS
      ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10)
      : undefined,
  };

  try {
    return ConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Configuration validation failed:");
      error.errors.forEach((err) => {
        console.error(`  ${err.path.join(".")}: ${err.message}`);
      });
    }
    process.exit(1);
  }
}

// Load and export config singleton
export const config = loadConfig();

/**
 * Print startup config info to logs
 * (excluding sensitive values)
 */
export function logConfigInfo(): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      message: "Gateway configuration loaded",
      meta: {
        port: config.port,
        environment: config.nodeEnv,
        logLevel: config.logLevel,
        requestTimeoutMs: config.requestTimeoutMs,
        rateLimitMaxRequests: config.rateLimitMaxRequests,
        pythonWorkerUrl: config.pythonWorkerUrl.replace(
          /:\d+$/,
          ":***"
        ),
        typescriptWorkerUrl: config.typescriptWorkerUrl.replace(
          /:\d+$/,
          ":***"
        ),
      },
    })
  );
}
