import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

import { env } from "./config/env.js";
import { buildCorsOptions, securityHeaders, apiRateLimiter, authRateLimiter } from "./middleware/securityMiddleware.js";
import healthRoutes from "./routes/healthRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import barberRoutes from "./routes/barberRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import favouriteRoutes from "./routes/favouriteRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import pushRoutes from "./routes/pushRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import marketplaceRoutes from "./routes/marketplaceRoutes.js";
import { notFoundHandler, errorHandler } from "./middleware/errorMiddleware.js";
import { createRequestLogger } from "./config/logger.js";
import db from "./config/db.js";

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(securityHeaders);
if (env.nodeEnv !== "production") {
  app.use(cors(buildCorsOptions()));
}
app.use("/api", apiRateLimiter);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  req.id = req.get("x-request-id") || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  res.setHeader("X-Request-Id", req.id);
  req.log = createRequestLogger(req);
  const start = Date.now();

  res.on("finish", () => {
    req.log.info({
      statusCode: res.statusCode,
      duration_ms: Date.now() - start,
      ip: req.ip,
      forwardedFor: req.get("x-forwarded-for") || "",
      protocol: req.protocol,
    }, "request completed");
  });

  next();
});

app.use("/api/health", healthRoutes);
app.get("/api/health/ready", async (req, res, next) => {
  try {
    if (db.client === "postgres") {
      await db.pool.query("SELECT 1");
    } else {
      await new Promise((resolve, reject) => {
        db.get("SELECT 1 AS ok", [], (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    res.json({
      success: true,
      status: "ready",
      timestamp: new Date().toISOString(),
      database: db.client,
    });
  } catch (error) {
    next(error);
  }
});
app.get("/api/ready", (req, res) => {
  res.redirect(307, "/api/health/ready");
});
app.use("/api/auth", authRateLimiter, authRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/barbers", barberRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/favorites", favouriteRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", marketplaceRoutes);

app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "Service marketplace API is live",
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
