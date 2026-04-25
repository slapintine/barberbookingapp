import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  name: "barber-booking-backend",
  level: env.logLevel,
  base: {
    service: "barber-booking-backend",
    env: env.nodeEnv,
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "headers.authorization",
      "token",
      "apiKey",
      "apiSecret",
      "credentials.apiKey",
      "credentials.apiSecret",
      "password",
      "payload.token",
      "payload.password",
      "response.token",
    ],
    censor: "[REDACTED]",
  },
  transport:
    env.nodeEnv !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            singleLine: true,
          },
        }
      : undefined,
});

export function createRequestLogger(req) {
  return logger.child({
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
  });
}
