import { Resend } from "resend";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { env } from "../config/env.js";

let resend = null;

function captureEmailForTest(payload) {
  const captureDir = process.env.NODE_ENV === "test" ? String(process.env.EMAIL_CAPTURE_DIR || "").trim() : "";
  if (!captureDir) return null;

  fs.mkdirSync(captureDir, { recursive: true });
  const id = `captured-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  fs.writeFileSync(
    path.join(captureDir, `${id}.json`),
    JSON.stringify(
      {
        id,
        createdAt: new Date().toISOString(),
        from: env.emailFrom || "Queless <info@queless.org>",
        ...payload,
      },
      null,
      2
    )
  );
  return { id, captured: true };
}

function getResendClient() {
  if (!env.resendApiKey) {
    const error = new Error("Email sending failed. Please contact support.");
    error.statusCode = 503;
    throw error;
  }
  if (!resend) resend = new Resend(env.resendApiKey);
  return resend;
}

export async function sendEmail({ to, subject, html, text }) {
  const captured = captureEmailForTest({ to, subject, html, text });
  if (captured) return captured;

  try {
    const result = await getResendClient().emails.send({
      from: env.emailFrom || "Queless <info@queless.org>",
      to,
      subject,
      html,
      text,
    });
    if (result?.error) {
      const statusCode = Number(result.error.statusCode || result.error.status || 502);
      const error = new Error("Email sending failed. Please try again later.");
      error.statusCode = statusCode;
      error.providerCode = result.error.name || result.error.code || "";
      throw error;
    }
    return result;
  } catch (caught) {
    const statusCode = Number(caught?.statusCode || caught?.status || caught?.response?.status || 502);
    const error = new Error("Email sending failed. Please try again later.");
    error.statusCode = statusCode;
    error.providerCode = caught?.providerCode || caught?.name || caught?.code || "";
    throw error;
  }
}
