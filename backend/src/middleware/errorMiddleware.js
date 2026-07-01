import { logger } from "../config/logger.js";

export function notFoundHandler(req, res, next) {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

// Low-level disk/permission failures that mean "the server could not write a
// file right now" — surfaced as a retry-able 503 instead of an opaque 500.
const STORAGE_FAILURE_CODES = new Set([
  "EACCES",
  "EROFS",
  "ENOSPC",
  "EDQUOT",
  "EPERM",
  "EMFILE",
  "ENFILE",
]);

export function errorHandler(err, req, res, next) {
  const errCode = String(err?.code || "");
  const isSqliteConstraint = errCode.startsWith("SQLITE_CONSTRAINT");
  // Postgres integrity-constraint violation class (23xxx): 23502 not-null,
  // 23503 foreign key, 23505 unique, 23514 check. Treat as a recoverable 400
  // with a safe message — never surface the raw column/table name.
  const isPostgresConstraint = /^23\d{3}$/.test(errCode);
  // Postgres "invalid text representation" (22P02) — a malformed id such as a
  // dash-form conversation id "5-3", "NaN", or a non-numeric booking/stand/user
  // id reaching an integer/uuid column. That is bad client input, not a server
  // fault, so answer a clean 400 with a friendly message — never a 500, and
  // never the raw "invalid input syntax for integer" SQL text.
  const isPostgresInvalidInput = errCode === "22P02";
  const isConstraintViolation = isSqliteConstraint || isPostgresConstraint;
  const isStorageFailure = !err?.statusCode && STORAGE_FAILURE_CODES.has(errCode);
  const statusCode =
    err.statusCode ||
    (isConstraintViolation || isPostgresInvalidInput ? 400 : isStorageFailure ? 503 : 500);
  const safeMessage = isSqliteConstraint
    ? "We couldn't activate this plan. Please try again."
    : isPostgresConstraint
    ? "We couldn't save your changes. Some required details may be missing or invalid. Please review and try again."
    : isPostgresInvalidInput
    ? "Some details in your request weren't valid. Please check and try again."
    : err.message;
  const publicMessage =
    envSafeProduction() && statusCode >= 500
      ? err.publicMessage ||
        (isStorageFailure
          ? "We couldn't store your upload just now. Your other details are safe — please try again shortly."
          : "Something went wrong on our side. Please try again shortly.")
      : safeMessage || "Internal server error";

  const requestLogger = req?.log || logger;
  requestLogger.error(
    {
      err,
      statusCode,
    },
    "request failed"
  );

  const responseBody = {
    success: false,
    message: publicMessage,
    requestId: req?.id,
  };

  // Forward only intentional app-level codes (UPPER_SNAKE_CASE) so the client can
  // map them to specific guidance. Never leak DB/driver/OS codes (e.g. SQLITE_*,
  // Node errno codes like EACCES/ENOSPC). App codes must contain an underscore,
  // which the single-word OS errno codes never do.
  if (
    typeof err.code === "string" &&
    /^[A-Z][A-Z0-9_]+$/.test(err.code) &&
    err.code.includes("_") &&
    !err.code.startsWith("SQLITE") &&
    !STORAGE_FAILURE_CODES.has(err.code)
  ) {
    responseBody.code = err.code;
  }

  if (statusCode < 500 && err.details && typeof err.details === "object" && !Array.isArray(err.details)) {
    responseBody.details = err.details;
  }

  res.status(statusCode).json(responseBody);
}

function envSafeProduction() {
  return process.env.NODE_ENV === "production";
}
