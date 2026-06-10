import { env } from "../config/env.js";

const rateStores = new Map();

function isLoopbackOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin) {
  if (!origin) return true;

  if (isLoopbackOrigin(origin)) {
    return env.nodeEnv !== "production";
  }

  if (env.nodeEnv !== "production" && env.clientUrls.length === 0) return true;
  const allowedOrigins = env.nodeEnv === "production" ? env.clientUrls : [...env.clientUrls, ...env.devClientUrls];
  return allowedOrigins.includes(origin);
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
    const principal = req.user?.id ? `user:${req.user.id}` : "";
    const key = `${principal || `ip:${req.ip || req.socket?.remoteAddress || "unknown"}`}:${req.method}:${req.baseUrl || req.path}`;
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

export const paymentRateLimiter = rateLimit({
  name: "payment",
  windowMs: 15 * 60 * 1000,
  max: 40,
});

export const bookingRateLimiter = rateLimit({
  name: "booking",
  windowMs: 15 * 60 * 1000,
  max: 80,
});

export const walletTopupRateLimiter = rateLimit({
  name: "wallet-topup",
  windowMs: 15 * 60 * 1000,
  max: 10,
});

export const otpRateLimiter = rateLimit({
  name: "otp",
  windowMs: 10 * 60 * 1000,
  max: 5,
});

export const reviewRateLimiter = rateLimit({
  name: "review",
  windowMs: 15 * 60 * 1000,
  max: 12,
});

export const smartMatchRateLimiter = rateLimit({
  name: "smart-match",
  windowMs: 15 * 60 * 1000,
  max: 20,
});

export const aiCoachRateLimiter = rateLimit({
  name: "ai-coach",
  windowMs: 60 * 1000,
  max: 8,
});

export const supportRateLimiter = rateLimit({
  name: "support",
  windowMs: 15 * 60 * 1000,
  max: 10,
});

export const providerRegistrationRateLimiter = rateLimit({
  name: "provider-registration",
  windowMs: 60 * 60 * 1000,
  max: 5,
});

export const imageUploadRateLimiter = rateLimit({
  name: "image-upload",
  windowMs: 15 * 60 * 1000,
  max: 30,
});

export const smsSendRateLimiter = rateLimit({
  name: "sms-send",
  windowMs: 15 * 60 * 1000,
  max: 20,
});

export const smsWebhookRateLimiter = rateLimit({
  name: "sms-webhook",
  windowMs: 15 * 60 * 1000,
  max: 300,
});
