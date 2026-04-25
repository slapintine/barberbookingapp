import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function generateToken(payload) {
  const secret = env.jwtSecret;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured.");
  }

  return jwt.sign(payload, secret, { expiresIn: env.jwtExpiresIn || "7d" });
}
