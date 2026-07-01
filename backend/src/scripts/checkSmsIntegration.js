// Self-contained SMS diagnostic — imports only env.js (no DB, no sqlite3).
// smsService.js pulls in db/query.js at module init, which loads the sqlite3
// native addon and crashes on servers with older glibc. All helpers are inlined.
import { env } from "../config/env.js";

const SEND_FLAG = "--send";
// Pass --no-sender-id alongside --send to skip the AFRICASTALKING_SHORTCODE
// "from" field. Useful when isolating whether an unapproved sender ID (AT
// statusCode 402 / InvalidSenderId) is the reason delivery failed.
const NO_SENDER_ID_FLAG = "--no-sender-id";
const TEST_MESSAGE = "Queless SMS test. Please ignore.";

// Africa's Talking statusCode reference (printed next to each recipient result)
const AT_STATUS_CODES = {
  100: "Processed",
  101: "Sent",
  102: "Queued",
  401: "RiskHold",
  402: "InvalidSenderId",
  403: "InvalidPhoneNumber",
  404: "UnsupportedNumberType",
  405: "InsufficientBalance",
  406: "UserInBlacklist",
  407: "CouldNotRoute",
  409: "DuplicateRequest",
  500: "InternalServerError",
  501: "GatewayError",
  502: "RejectedByGateway",
};

function isSet(value) {
  return String(value || "").trim() ? "SET" : "MISSING";
}

function maskPhone(value) {
  const phone = String(value || "").trim();
  if (!phone || phone.length <= 5) return "***";
  return `${phone.slice(0, 5)}***${phone.slice(-2)}`;
}

function sanitizeSmsLogText(value) {
  return String(value || "")
    .replace(/(?:\+?256|0)[37]\d{8}/g, (m) => maskPhone(m))
    .replace(/(bearer\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/((?:api[_ -]?key|authorization|token|password)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function normalizePhoneNumber(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("256") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+256${digits.slice(1)}`;
  if (digits.length === 9 && /^[37]/.test(digits)) return `+256${digits}`;
  if (String(phone || "").trim().startsWith("+") && digits.length >= 8) return `+${digits}`;
  return "";
}

function rawAtEnvDisplay() {
  const raw = String(
    process.env.AFRICASTALKING_ENV || process.env.AFRICAS_TALKING_ENV || ""
  )
    .trim()
    .toLowerCase();
  if (!raw) return "MISSING";
  if (raw === "production") return "PRODUCTION";
  if (raw === "sandbox") return "SANDBOX";
  return raw.toUpperCase();
}

function getSmsConfig() {
  const username = env.africasTalkingUsername;
  const apiKey = env.africasTalkingApiKey;
  const shortcode = env.africasTalkingShortcode;
  const smsEnv = env.africasTalkingEnv || "sandbox";
  const configured = Boolean(username && apiKey);
  const usingSandbox = smsEnv === "sandbox" || username === "sandbox";
  const devLiveSendAllowed =
    String(process.env.AFRICASTALKING_ALLOW_LIVE_SEND || "").trim().toLowerCase() === "true";
  const mock =
    env.nodeEnv !== "production" && configured && !usingSandbox && !devLiveSendAllowed;
  return {
    username,
    shortcode,
    env: smsEnv,
    configured,
    mock,
    lifecycleSmsEnabled: Boolean(env.africasTalkingLifecycleSmsEnabled),
    autoReplyEnabled: Boolean(env.africasTalkingSmsAutoReplyEnabled),
  };
}

function smsMode(config) {
  if (!config.configured) return "MISCONFIGURED";
  if (config.mock) return "MOCK";
  if (
    config.env === "sandbox" ||
    String(config.username || "").toLowerCase() === "sandbox"
  )
    return "SANDBOX";
  if (env.nodeEnv === "production" && config.env === "production") return "LIVE_PRODUCTION";
  return "MISCONFIGURED";
}

function printRecipientResult(r, prefix) {
  const statusCode = r.statusCode ?? r.status_code;
  const statusCodeLabel =
    statusCode != null
      ? `${statusCode} (${AT_STATUS_CODES[statusCode] || "Unknown"})`
      : "NOT_RETURNED";
  const messageId = String(r.messageId || r.message_id || "").trim();
  const errorMsg = String(r.errorMessage || r.error_message || "").trim();

  if (r.number || r.msisdn) {
    console.log(`${prefix}NUMBER=${maskPhone(String(r.number || r.msisdn))}`);
  }
  console.log(`${prefix}STATUS=${r.status || "unknown"}`);
  console.log(`${prefix}STATUS_CODE=${statusCodeLabel}`);
  console.log(`${prefix}MESSAGE_ID=${messageId || "NOT_RETURNED"}`);
  console.log(`${prefix}COST=${r.cost || "NOT_RETURNED"}`);
  if (errorMsg) {
    console.log(`${prefix}ERROR=${sanitizeSmsLogText(errorMsg)}`);
  }
}

async function main() {
  const config = getSmsConfig();
  const testPhone = String(process.env.SMS_TEST_PHONE || "").trim();
  const sendRequested = process.argv.includes(SEND_FLAG);
  const noSenderId = process.argv.includes(NO_SENDER_ID_FLAG);
  const atEnvDisplay = rawAtEnvDisplay();
  const mode = smsMode(config);

  // ── Status output — no secrets printed ──────────────────────────────────
  console.log("SMS_PROVIDER=africastalking");
  console.log(`NODE_ENV=${env.nodeEnv === "production" ? "PRODUCTION" : "NON_PRODUCTION"}`);
  console.log(`AFRICASTALKING_USERNAME=${isSet(env.africasTalkingUsername)}`);
  console.log(`AFRICASTALKING_API_KEY=${isSet(env.africasTalkingApiKey)}`);
  console.log(`AFRICASTALKING_SHORTCODE=${isSet(env.africasTalkingShortcode)}`);
  console.log(`AFRICASTALKING_ENV=${atEnvDisplay}`);
  console.log(
    `AFRICASTALKING_LIFECYCLE_SMS_ENABLED=${config.lifecycleSmsEnabled ? "ENABLED" : "DISABLED"}`
  );
  console.log(
    `AFRICASTALKING_SMS_AUTO_REPLY_ENABLED=${config.autoReplyEnabled ? "ENABLED" : "DISABLED"}`
  );
  console.log(`SMS_TEST_PHONE=${isSet(testPhone)}`);
  console.log(`SMS_MODE=${mode}`);

  if (!sendRequested) {
    console.log(
      `TEST_SMS=SKIPPED (run with ${SEND_FLAG} only after SMS_TEST_PHONE is set on the production VPS)`
    );
    return;
  }

  // ── --send guards — all conditions must be met ───────────────────────────
  const refused = [];
  if (env.nodeEnv !== "production")
    refused.push("NODE_ENV must be production");
  if (!env.africasTalkingUsername)
    refused.push("AFRICASTALKING_USERNAME is missing");
  if (!env.africasTalkingApiKey)
    refused.push("AFRICASTALKING_API_KEY is missing");
  if (String(env.africasTalkingUsername || "").toLowerCase() === "sandbox")
    refused.push("AFRICASTALKING_USERNAME must not be 'sandbox'");
  if (config.env !== "production")
    refused.push("AFRICASTALKING_ENV must be production");
  if (!testPhone)
    refused.push("SMS_TEST_PHONE is missing");

  if (refused.length) {
    for (const reason of refused) console.error(`SMS_SEND_REFUSED=${reason}`);
    process.exitCode = 1;
    return;
  }

  const normalizedPhone = normalizePhoneNumber(testPhone);
  if (!normalizedPhone) {
    console.error("SMS_SEND_REFUSED=SMS_TEST_PHONE is not a valid phone number");
    process.exitCode = 1;
    return;
  }

  // Build send options. The AT SDK uses "from" for the sender ID; "senderId"
  // is not a valid SDK field. Pass --no-sender-id to omit "from" entirely —
  // useful when diagnosing AT statusCode 402 (InvalidSenderId / unapproved shortcode).
  const smsOptions = { to: [normalizedPhone], message: TEST_MESSAGE, enqueue: true };
  const senderIdUsed = Boolean(config.shortcode && !noSenderId);
  if (senderIdUsed) {
    smsOptions.from = config.shortcode;
  }

  console.log(`TEST_RECIPIENT=${maskPhone(normalizedPhone)}`);
  console.log(`SENDER_ID_USED=${senderIdUsed ? "YES" : "NO (omitted via --no-sender-id)"}`);

  // Dynamic import: only loads africastalking when --send is actually used.
  const AfricasTalking = (await import("africastalking")).default;
  const at = AfricasTalking({
    apiKey: env.africasTalkingApiKey,
    username: env.africasTalkingUsername,
  });

  const response = await at.SMS.send(smsOptions);

  // ── Full sanitized provider response ─────────────────────────────────────
  const msgData = response?.SMSMessageData || response || {};
  const atSummary = String(msgData.Message || "").trim();
  if (atSummary) {
    console.log(`AT_SUMMARY=${sanitizeSmsLogText(atSummary)}`);
  }

  const recipients = Array.isArray(msgData.Recipients)
    ? msgData.Recipients
    : Array.isArray(msgData.recipients)
    ? msgData.recipients
    : [];

  console.log(`AT_RECIPIENT_COUNT=${recipients.length}`);

  if (recipients.length === 0) {
    // Unexpected response shape — print sanitized raw JSON for debugging.
    console.log(
      `AT_RAW_RESPONSE=${sanitizeSmsLogText(JSON.stringify(response ?? {}))}`
    );
  } else {
    recipients.forEach((r, i) => {
      const prefix =
        recipients.length === 1 ? "AT_R_" : `AT_R${i + 1}_`;
      printRecipientResult(r, prefix);
    });
  }
}

main().catch((error) => {
  console.error(
    `SMS_CHECK_FAILED=${sanitizeSmsLogText(error?.message || "Unknown SMS diagnostic error")}`
  );
  process.exitCode = 1;
});
