import { formatServicePrice, getServiceBookingAmount } from "./serviceCatalog.js";

function formatMoneyParts(value) {
  return Number(value || 0).toLocaleString("en-UG");
}

export function getBookingPriceCardParts(service, bookingTotal = null) {
  const pricingType = String(service?.pricing_type || service?.pricingType || "fixed").toLowerCase();
  const label = formatServicePrice(service);
  const serviceAmount = getServiceBookingAmount(service);
  const totalAmount = Number(bookingTotal || 0);
  const displayAmount = totalAmount > 0 ? totalAmount : serviceAmount;
  const hasDirectPrice = serviceAmount > 0 || ["range", "starting_from"].includes(pricingType);
  const quoteOnly = pricingType === "quote" || label === "Price unavailable" || (!hasDirectPrice && label !== "Price on consultation");

  if (pricingType === "quote" || quoteOnly) {
    return { top: "Quote", bottom: "required", quote: true };
  }
  if (pricingType === "range" || pricingType === "starting_from") {
    return { top: "From", bottom: `UGX ${formatMoneyParts(displayAmount)}`, small: true };
  }
  return { top: "UGX", bottom: formatMoneyParts(displayAmount) };
}
