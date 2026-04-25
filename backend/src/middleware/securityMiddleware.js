import { env } from "../config/env.js";

const rateStores = new Map();

function isAllowedOrigin(origin) {
  if (!origin) return true;

  if (env.nodeEnv !== "production") {
    try {
      const parsed = new URL(origin);
      if (["localhost", "127.0.0.1"].includes(parsed.hostname)) return true;
    } catch {
      return false;
    }
  }

  if (env.nodeEnv !== "production" && env.clientUrls.length === 0) return true;
  return env.clientUrls.includes(origin);
}

export function buildCorsOptions() {
  return {
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin is not allowed by CORS."));
    },
    credentials: true,
  };
}

export function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(self), geolocation=(self), microphone=()");

  if (env.nodeEnv === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }

  next();
}

export function rateLimit({ name, windowMs, max }) {
  if (!rateStores.has(name)) {
    rateStores.set(name, new Map());
  }

  const store = rateStores.get(name);

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || "unknown";
    const record = store.get(key);

    if (!record || record.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    record.count += 1;

    if (record.count > max) {
      const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        message: "Too many requests. Please wait and try again.",
      });
    }

    next();
  };
}

export const apiRateLimiter = rateLimit({
  name: "api",
  windowMs: 15 * 60 * 1000,
  max: 500,
});

export const authRateLimiter = rateLimit({
  name: "auth",
  windowMs: 15 * 60 * 1000,
  max: 30,
});
