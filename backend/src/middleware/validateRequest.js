import Joi from "joi";

// Centralized request validation.
//
// Design choices that keep this safe to roll out incrementally:
//  - It is a GATE, not a transformer: req.body/params/query are never mutated,
//    so controllers receive exactly what they did before for any valid request.
//    The existing controller normalization (diff-merge, normalize* helpers) stays
//    the precise validator; this layer only rejects clearly-invalid payloads early.
//  - allowUnknown + no stripUnknown: unexpected fields are never stripped or
//    rejected, so partial/diff-only payloads (e.g. stand draft save) are untouched.
//  - convert: true only so string-encoded numbers/booleans validate; values are
//    not written back.
//  - Error responses are generic and safe: Joi messages contain no stack traces,
//    SQL, table names, or file paths. We strip the quotes Joi wraps labels in for
//    a cleaner form message.

const DEFAULT_OPTIONS = Object.freeze({
  abortEarly: false,
  allowUnknown: true,
  stripUnknown: false,
  convert: true,
});

function friendlyMessage(detail) {
  return String(detail?.message || "Invalid input.").replace(/"/g, "").trim();
}

export function validateRequest(schema = {}, options = {}) {
  const parts = ["params", "query", "body"].filter((part) => schema[part]);
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return function validate(req, res, next) {
    for (const part of parts) {
      const { error } = schema[part].validate(req[part] ?? {}, opts);
      if (error) {
        const errors = error.details.map((detail) => ({
          field: detail.path.join("."),
          message: friendlyMessage(detail),
        }));
        return res.status(400).json({
          success: false,
          code: "VALIDATION_ERROR",
          message: errors[0]?.message || "Please check the highlighted fields and try again.",
          errors,
        });
      }
    }
    return next();
  };
}

export { Joi };
