import http from "http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import app from "./app.js";
import { env, validateEnv } from "./config/env.js";
import { initDb } from "./db/initDb.js";
import db from "./config/db.js";
import { logger } from "./config/logger.js";

validateEnv();

const PORT = env.port;

try {
  await initDb();
} catch (error) {
  logger.fatal({ err: error }, "Failed to initialize database before server startup");
  process.exit(1);
}

const server = http.createServer(app);

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
  } catch (error) {
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

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    logger.fatal({ err: error, port: PORT }, "Port is already in use");
    process.exit(1);
  }

  logger.fatal({ err: error }, "Server startup failed");
  process.exit(1);
});

server.listen(PORT, env.host || "127.0.0.1", () => {
  logger.info(
    {
      port: PORT,
      host: env.host || "127.0.0.1",
      socketPath: "/socket.io",
      apiBase: "/api",
    },
    "Server running"
  );
});
