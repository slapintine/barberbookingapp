import { env } from "../config/env.js";

export function requireProductMarketplaceEnabled(req, res, next) {
  if (env.productMarketplaceEnabled) return next();
  return res.status(404).json({
    success: false,
    code: "PRODUCT_MARKETPLACE_DISABLED",
    message: "Product marketplace features are not available yet.",
  });
}
