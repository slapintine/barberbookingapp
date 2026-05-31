import { Resend } from "resend";
import { env } from "../config/env.js";

let resend = null;

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
