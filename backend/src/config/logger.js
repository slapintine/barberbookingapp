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
      "consumerSecret",
      "credentials.apiKey",
      "credentials.apiSecret",
      "credentials.consumerSecret",
      "password",
      "req.body.password",
      "req.body.currentPassword",
      "req.body.newPassword",
      "body.password",
      "body.currentPassword",
      "body.newPassword",
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
            translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
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
