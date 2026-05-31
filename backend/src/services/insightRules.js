const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function makeInsight(headline, recommendation, why, benefit, actionLabel = "", actionTarget = "") {
  return { headline, recommendation, why, benefit, actionLabel, actionTarget };
}

function countBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item);
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function topEntry(counts) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || null;
}

function parsePortfolio(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getBookingDate(booking) {
  const date = new Date(booking.booking_date || booking.created_at || "");
  return Number.isFinite(date.getTime()) ? date : null;
}

function getTimeBucket(timeValue) {
  const hour = Number(String(timeValue || "00:00").split(":")[0]);
  if (!Number.isFinite(hour)) return "";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return amount > 0 ? `UGX ${amount.toLocaleString("en-UG")}` : "";
}

function getServicePriceLabel(service) {
  const pricingType = String(service?.pricing_type || "fixed").toLowerCase();
  const fixed = Number(service?.price_extra || 0);
  const min = Number(service?.min_price || 0);
  const max = Number(service?.max_price || 0);
  const starting = Number(service?.starting_price || 0);
  if (pricingType === "quote") return "Quote required";
  if (min > 0 && max >= min) return `${formatMoney(min)} - ${formatMoney(max)}`;
  if (starting > 0) return `From ${formatMoney(starting)}`;
  if (fixed > 0) return formatMoney(fixed);
  return "";
}

function buildSetupChecklist({ business, services, schedule, portfolio }) {
  return [
    { label: "Add business photo", complete: Boolean(business.image) },
    { label: "Add service prices", complete: services.some((service) => Boolean(getServicePriceLabel(service))) },
    { label: "Add opening hours", complete: schedule.some((day) => Number(day.is_open) === 1) },
    { label: "Add location", complete: Boolean(business.location && business.latitude && business.longitude) },
    { label: "Add at least 3 services", complete: services.length >= 3 },
    { label: "Add service photos", complete: services.some((service) => Boolean(service.image)) || portfolio.length >= 3 },
  ];
}

function reviewSignals(reviews, terms) {
  const text = reviews.map((review) => String(review.review_text || "")).join(" ").toLowerCase();
  return terms
    .map((item) => ({
      label: item.label,
      count: item.terms.reduce((sum, term) => sum + (text.split(term).length - 1), 0),
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function buildRuleBasedInsights({ business, services = [], schedule = [], bookings = [], reviews = [] }) {
  const completedBookings = bookings.filter((item) => String(item.status || "").toLowerCase() === "completed");
  const dayCounts = countBy(bookings, (booking) => {
    const date = getBookingDate(booking);
    return date ? DAY_NAMES[date.getDay()] : "";
  });
  const timeCounts = countBy(bookings, (booking) => getTimeBucket(booking.booking_time));
  const serviceCounts = countBy(bookings, (booking) => booking.service_name || "Service");
  const busiestDay = topEntry(dayCounts);
  const busiestTime = topEntry(timeCounts);
  const topService = topEntry(serviceCounts);
  const bookedServiceNames = new Set(Object.keys(serviceCounts).map((item) => item.toLowerCase()));
  const underBookedService = services.find((service) => !bookedServiceNames.has(String(service.service_name || "").toLowerCase()));
  const averageRating = reviews.length
    ? Number((reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length).toFixed(1))
    : 0;
  const setupChecklist = buildSetupChecklist({
    business,
    services,
    schedule,
    portfolio: parsePortfolio(business.portfolio_json),
  });

  const weeklyInsight = busiestDay
    ? makeInsight(
        `${busiestDay[0]} is your strongest booking day`,
        `Do this next: keep extra availability open on ${busiestDay[0]}${busiestTime ? ` ${busiestTime[0]}s` : ""}.`,
        `Why it matters: ${busiestDay[1]} booking${busiestDay[1] === 1 ? "" : "s"} happened on this day.`,
        "Expected benefit: fewer missed customers during your strongest demand window.",
        "Add Availability",
        "schedule"
      )
    : makeInsight(
        "Your coach is waiting for booking signals",
        "Do this next: complete your services, prices, photos, and weekly hours.",
        "Why it matters: stronger profile data helps customers book with confidence.",
        "Expected benefit: better conversion once customers start viewing your business.",
        "Edit Profile",
        "profile"
      );

  const now = Date.now();
  const last30 = bookings.filter((booking) => {
    const date = getBookingDate(booking);
    return date && now - date.getTime() <= 30 * 24 * 60 * 60 * 1000;
  }).length;
  const previous30 = bookings.filter((booking) => {
    const date = getBookingDate(booking);
    const age = date ? now - date.getTime() : 0;
    return date && age > 30 * 24 * 60 * 60 * 1000 && age <= 60 * 24 * 60 * 60 * 1000;
  }).length;

  const bookingOpportunities = [
    topService ? makeInsight(
      `${topService[0]} leads your bookings`,
      `Do this next: feature ${topService[0]} in your profile and availability.`,
      `Why it matters: it already has ${topService[1]} booking${topService[1] === 1 ? "" : "s"}.`,
      "Expected benefit: promoting a proven service can increase repeat bookings.",
      "View Reports",
      "reports"
    ) : null,
    underBookedService ? makeInsight(
      `${underBookedService.service_name} needs attention`,
      "Do this next: improve the description, photo, price clarity, or time slots for this service.",
      "Why it matters: it has not appeared in recent bookings.",
      "Expected benefit: clearer service positioning can unlock new demand.",
      "Edit Service",
      "services"
    ) : null,
    bookings.length >= 2 ? makeInsight(
      last30 >= previous30 ? "Bookings are holding steady" : "Bookings dropped in the last 30 days",
      last30 >= previous30 ? "Do this next: protect your best time slots and ask happy customers for reviews." : "Do this next: refresh your profile, prices, and availability this week.",
      `Why it matters: last 30 days had ${last30} booking${last30 === 1 ? "" : "s"} versus ${previous30} before that.`,
      "Expected benefit: a quick profile refresh can recover customer confidence.",
      "Edit Profile",
      "profile"
    ) : null,
  ].filter(Boolean);

  const missingPriceServices = services.filter((service) => !getServicePriceLabel(service));
  const veryLowFixed = services.find((service) => Number(service.price_extra || 0) > 0 && Number(service.price_extra || 0) < 5000);
  const pricingSuggestions = [
    missingPriceServices.length ? makeInsight(
      `${missingPriceServices.length} service${missingPriceServices.length === 1 ? "" : "s"} need price clarity`,
      "Do this next: add a fixed price, price range, starting price, or mark the service as quote required.",
      "Why it matters: customers are less likely to book when price is unclear.",
      "Expected benefit: fewer abandoned bookings before confirmation.",
      "Update Prices",
      "prices"
    ) : null,
    veryLowFixed ? makeInsight(
      `${veryLowFixed.service_name} may be underpriced`,
      `Do this next: test a clearer range above ${formatMoney(veryLowFixed.price_extra)} if your costs allow it.`,
      "Why it matters: very low prices can reduce profit and make quality look uncertain.",
      "Expected benefit: healthier earnings without needing more bookings.",
      "Update Prices",
      "prices"
    ) : null,
    services.length && !missingPriceServices.length ? makeInsight(
      "Your service prices are visible",
      "Do this next: keep price ranges accurate and use quote-required only for custom work.",
      "Why it matters: transparent prices reduce hesitation at checkout.",
      "Expected benefit: customers can choose and confirm faster.",
      "View Services",
      "services"
    ) : null,
  ].filter(Boolean);

  const positives = reviewSignals(reviews, [
    { label: "friendly service", terms: ["friendly", "kind", "welcoming", "nice", "respectful"] },
    { label: "fast service", terms: ["fast", "quick", "speed", "on time"] },
    { label: "clean work", terms: ["clean", "neat", "fresh", "hygienic"] },
  ]);
  const complaints = reviewSignals(reviews, [
    { label: "waiting time", terms: ["wait", "late", "delay", "slow"] },
    { label: "pricing concern", terms: ["price", "expensive", "cost", "overcharged"] },
    { label: "communication", terms: ["reply", "respond", "communication", "rude"] },
  ]);

  const reviewSummary = makeInsight(
    reviews.length ? `${averageRating.toFixed(1)} average rating from ${reviews.length} review${reviews.length === 1 ? "" : "s"}` : "No review pattern yet",
    complaints.length ? `Do this next: address ${complaints[0].label} in your next few bookings.` : "Do this next: ask completed customers for honest reviews.",
    positives.length ? `Why it matters: customers already mention ${positives.map((item) => item.label).join(", ")}.` : "Why it matters: reviews help new customers trust your business.",
    complaints.length ? "Expected benefit: fixing repeated complaints can protect your rating." : "Expected benefit: more reviews can improve trust and ranking.",
    "View Reviews",
    "reviews"
  );

  const profileFixes = setupChecklist
    .filter((item) => !item.complete)
    .slice(0, 5)
    .map((item) => makeInsight(
      item.label,
      `Do this next: ${item.label.toLowerCase()} before promoting your profile.`,
      "Why it matters: complete profiles feel safer and more professional to customers.",
      "Expected benefit: a stronger profile can convert more views into bookings.",
      "Edit Profile",
      "profile"
    ));

  const customerCounts = countBy(completedBookings, (booking) => String(booking.customer_user_id || ""));
  const repeatCustomers = Object.values(customerCounts).filter((count) => count > 1).length;
  const oneTimeCustomers = Object.values(customerCounts).filter((count) => count === 1).length;
  const customerRetentionIdeas = [
    oneTimeCustomers ? makeInsight(
      `${oneTimeCustomers} customer${oneTimeCustomers === 1 ? "" : "s"} booked once`,
      "Do this next: send a friendly welcome-back message or small returning-customer offer.",
      "Why it matters: one-time customers are the easiest group to bring back.",
      "Expected benefit: more repeat bookings without relying only on new customers.",
      "Message Customers",
      "customers"
    ) : null,
    repeatCustomers ? makeInsight(
      `${repeatCustomers} repeat customer${repeatCustomers === 1 ? "" : "s"} found`,
      "Do this next: protect availability for your returning customers and offer loyalty perks.",
      "Why it matters: repeat customers are a strong signal that your service is working.",
      "Expected benefit: steadier weekly income.",
      "Create Offer",
      "offers"
    ) : null,
    !completedBookings.length ? makeInsight(
      "Retention starts after completed bookings",
      "Do this next: confirm bookings quickly and follow up after each completed service.",
      "Why it matters: good follow-up builds the habit of rebooking.",
      "Expected benefit: customers remember you when they need the service again.",
      "View Bookings",
      "bookings"
    ) : null,
  ].filter(Boolean);

  return {
    weeklyInsight,
    bookingOpportunities,
    pricingSuggestions,
    reviewSummary,
    profileFixes,
    customerRetentionIdeas,
    setupChecklist,
    dataQuality: {
      bookingsCount: bookings.length,
      completedBookingsCount: completedBookings.length,
      reviewsCount: reviews.length,
      servicesCount: services.length,
      enoughData: bookings.length >= 3 || reviews.length >= 2,
    },
  };
}
