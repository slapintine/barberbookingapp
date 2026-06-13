import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";

import { env, validateEnv } from "./config/env.js";
import {
  buildCorsOptions,
  securityHeaders,
  apiRateLimiter,
  authRateLimiter,
  paymentRateLimiter,
  bookingRateLimiter,
} from "./middleware/securityMiddleware.js";
import healthRoutes from "./routes/healthRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import barberRoutes from "./routes/barberRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import favouriteRoutes from "./routes/favouriteRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import customerSubscriptionRoutes from "./routes/customerSubscriptionRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import marketplaceRoutes from "./routes/marketplaceRoutes.js";
import aiCoachRoutes from "./routes/aiCoachRoutes.js";
import smsRoutes from "./routes/smsRoutes.js";
import { notFoundHandler, errorHandler } from "./middleware/errorMiddleware.js";
import { createRequestLogger, logger } from "./config/logger.js";
import db from "./config/db.js";
import { initDb } from "./db/initDb.js";
import { runExpiryReminderJob, runPendingPaymentCheck } from "./services/subscriptionReminderService.js";
import { providerImageStorageRoot } from "./services/providerImageStorage.js";

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(helmet({
  crossOriginResourcePolicy: { policy: "same-origin" },
  contentSecurityPolicy: false,
}));
app.use(securityHeaders);
app.use(cors(buildCorsOptions()));
app.use("/api", apiRateLimiter);

app.use(express.json({ limit: "150mb" }));
app.use(express.urlencoded({ extended: true, limit: "150mb" }));
app.use("/api/uploads", express.static(providerImageStorageRoot, {
  immutable: true,
  maxAge: "1y",
}));

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
app.use("/api/bookings", bookingRateLimiter, bookingRoutes);
app.use("/api/favorites", favouriteRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/customer-subscriptions", customerSubscriptionRoutes);
app.use("/api/ai-coach", aiCoachRoutes);
app.use("/api/provider/coach", aiCoachRoutes);
app.use("/api/payments", paymentRateLimiter, paymentRoutes);
app.use("/api/sms", smsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/marketplace", marketplaceRoutes);
app.use("/api", marketplaceRoutes);

app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "Service marketplace API is live",
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

function findUserById(userId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, username, role FROM users WHERE id = ?`,
      [userId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });
}

function attachSocketServer(server) {
  const io =
    env.nodeEnv === "production"
      ? new Server(server, {
          path: "/socket.io",
          cors: {
            origin: env.clientUrls,
            credentials: true,
          },
        })
      : new Server(server, {
          path: "/socket.io",
          cors: {
            origin: env.clientUrls.length ? env.clientUrls : true,
            credentials: true,
          },
        });

  const onlineUsers = new Map();
  const userStatus = new Map();

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Unauthorized"));
      }

      const decoded = jwt.verify(token, env.jwtSecret);
      const user = await findUserById(decoded.userId);

      if (!user) {
        return next(new Error("Unauthorized"));
      }

      socket.user = user;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id, userId: socket.user?.id }, "Socket connected");

    socket.on("join", () => {
      const username = socket.user?.username;
      if (!username) return;

      onlineUsers.set(username, socket.id);
      userStatus.set(username, "online");
      socket.data.username = username;

      io.emit("user_status", {
        username,
        status: "online",
      });

      logger.info({ socketId: socket.id, username }, "Socket user joined");
    });

    socket.on("send_message", ({ to, message }) => {
      if (!to || !message) return;

      const receiverSocket = onlineUsers.get(to);

      if (receiverSocket) {
        io.to(receiverSocket).emit("receive_message", message);
      }
    });

    socket.on("message_seen", ({ to, messageId }) => {
      if (!to || !messageId) return;

      const receiverSocket = onlineUsers.get(to);

      if (receiverSocket) {
        io.to(receiverSocket).emit("message_seen", {
          messageId,
        });
      }
    });

    socket.on("send_notification", ({ to, notification }) => {
      if (!to || !notification) return;

      const receiverSocket = onlineUsers.get(to);

      if (receiverSocket) {
        io.to(receiverSocket).emit("receive_notification", notification);
      }
    });

    socket.on("booking_updated", ({ to, booking }) => {
      if (!to || !booking) return;

      const receiverSocket = onlineUsers.get(to);

      if (receiverSocket) {
        io.to(receiverSocket).emit("booking_updated", booking);
      }
    });

    socket.on("typing", ({ to, payload }) => {
      if (!to || !payload) return;

      const receiverSocket = onlineUsers.get(to);

      if (receiverSocket) {
        io.to(receiverSocket).emit("typing", payload);
      }
    });

    socket.on("stop_typing", ({ to, payload }) => {
      if (!to) return;

      const receiverSocket = onlineUsers.get(to);

      if (receiverSocket) {
        io.to(receiverSocket).emit("stop_typing", payload || {});
      }
    });

    socket.on("disconnect", () => {
      const username = socket.data.username;

      if (username) {
        onlineUsers.delete(username);
        userStatus.set(username, "offline");

        io.emit("user_status", {
          username,
          status: "offline",
        });
      }

      logger.info({ socketId: socket.id, username: username || "" }, "Socket disconnected");
    });
  });

  return io;
}

export async function startServer() {
  validateEnv();

  try {
    await initDb();
  } catch (error) {
    logger.fatal({ err: error }, "Failed to initialize database before server startup");
    process.exit(1);
  }

  const server = http.createServer(app);
  attachSocketServer(server);

  server.on("error", (error) => {
    if (error?.code === "EADDRINUSE") {
      logger.fatal({ err: error, port: env.port }, "Port is already in use");
      process.exit(1);
    }

    logger.fatal({ err: error }, "Server startup failed");
    process.exit(1);
  });

  server.listen(env.port, env.host || "127.0.0.1", () => {
    logger.info(
      {
        port: env.port,
        host: env.host || "127.0.0.1",
        socketPath: "/socket.io",
        apiBase: "/api",
      },
      "Server running"
    );
  });

  // Subscription expiry reminder job — runs every 4 hours.
  // First run is deferred 2 minutes after startup to let DB settle.
  const REMINDER_INTERVAL_MS = 4 * 60 * 60 * 1000;
  setTimeout(() => {
    runExpiryReminderJob().catch((error) => logger.error({ err: error }, "Reminder job error"));
    runPendingPaymentCheck().catch((error) => logger.error({ err: error }, "Pending payment check error"));
    setInterval(() => {
      runExpiryReminderJob().catch((error) => logger.error({ err: error }, "Reminder job error"));
      runPendingPaymentCheck().catch((error) => logger.error({ err: error }, "Pending payment check error"));
    }, REMINDER_INTERVAL_MS);
  }, 2 * 60 * 1000);

  return server;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  await startServer();
}

export default app;
