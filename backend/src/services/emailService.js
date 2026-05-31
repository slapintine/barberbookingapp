export { sendEmail } from "./sendEmail.js";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function otpEmail({ code, purpose = "account_verification" }) {
  const title = purpose === "password_reset" ? "Reset your Queless password" : "Verify your Queless account";
  const safeCode = escapeHtml(code);
  return {
    subject: title,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1b1029">
        <h2>${title}</h2>
        <p>Your verification code is:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:4px">${safeCode}</p>
        <p>This code expires in 10 minutes.</p>
      </div>
    `,
    text: `${title}. Your code is ${code}. It expires in 10 minutes.`,
  };
}

export function bookingConfirmationEmail({ recipientName, barberName, customerName, serviceName, bookingDate, bookingTime, paymentMethod, price, teamMemberName }) {
  const heading = "Booking confirmed";
  const rows = [
    ["Customer", customerName],
    ["Stand", barberName],
    teamMemberName ? ["Barber", teamMemberName] : null,
    ["Service", serviceName],
    ["Date", bookingDate],
    ["Time", bookingTime],
    ["Payment", paymentMethod === "wallet" ? "Wallet" : "Cash on arrival"],
    ["Total", `UGX ${Number(price || 0).toLocaleString()}`],
  ].filter(Boolean);

  const htmlRows = rows
    .map(([label, value]) => `<tr><td style="padding:6px 12px 6px 0;color:#6b5b7d">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:700">${escapeHtml(value)}</td></tr>`)
    .join("");

  return {
    subject: "Your Queless appointment is confirmed",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1b1029">
        <h2>${heading}</h2>
        <p>Hi ${escapeHtml(recipientName || "there")}, your appointment details are below.</p>
        <table>${htmlRows}</table>
      </div>
    `,
    text: rows.map(([label, value]) => `${label}: ${value}`).join("\n"),
  };
}

export function passwordResetEmail({ code }) {
  return otpEmail({ code, purpose: "password_reset" });
}
