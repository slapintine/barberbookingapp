const BASE_URL = String(process.env.QA_API_URL || "http://127.0.0.1:5000").replace(/\/+$/, "");
const PASSWORD = "PlanQa123";

if (process.env.NODE_ENV !== "development" || process.env.ALLOW_QA_SEED !== "true") {
  console.error("Refusing to verify QA fixtures outside an explicitly enabled local development QA run.");
  process.exit(1);
}

const ACCOUNTS = [
  {
    username: "qa_plus_provider",
    tier: "PLUS",
    serviceCount: 5,
    photoCount: 5,
    aiBusinessCoach: false,
    verifiedBadge: false,
    homepageFeature: false,
  },
  {
    username: "qa_premium_provider",
    tier: "PREMIUM",
    serviceCount: 20,
    photoCount: 20,
    aiBusinessCoach: false,
    verifiedBadge: false,
    homepageFeature: false,
  },
  {
    username: "qa_platinum_provider",
    tier: "PLATINUM",
    serviceCount: 25,
    photoCount: 25,
    aiBusinessCoach: true,
    verifiedBadge: true,
    homepageFeature: true,
  },
];

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed with ${response.status}: ${text}`);
  }
  return data;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

async function verifyAccount(account) {
  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: account.username, password: PASSWORD }),
  });
  const headers = { Authorization: `Bearer ${login.token}` };

  const [barberData, subscriptionData, bookingsData] = await Promise.all([
    request("/api/barbers/me", { headers }),
    request("/api/subscriptions/me", { headers }),
    request("/api/bookings/me", { headers }),
  ]);

  const barber = barberData.barber;
  const subscription = subscriptionData.subscription;
  const reviewsData = await request(`/api/reviews/barber/${barber.id}`);
  const features = subscription.features || {};

  assertEqual(subscription.tier, account.tier, `${account.username} tier`);
  assertEqual((barber.services || []).length, account.serviceCount, `${account.username} service count`);
  assertEqual((barber.portfolio || []).length, account.photoCount, `${account.username} photo count`);
  assertEqual(Boolean(features.aiBusinessCoach), account.aiBusinessCoach, `${account.username} AI Business Coach`);
  assertEqual(Boolean(features.verifiedBadge), account.verifiedBadge, `${account.username} verified badge`);
  assertEqual(Boolean(features.homepageFeature), account.homepageFeature, `${account.username} homepage feature`);

  return {
    username: account.username,
    tier: subscription.tier,
    services: (barber.services || []).length,
    photos: (barber.portfolio || []).length,
    bookings: (bookingsData.bookings || []).length,
    reviews: (reviewsData.reviews || []).length,
    aiBusinessCoach: Boolean(features.aiBusinessCoach),
    verifiedBadge: Boolean(features.verifiedBadge),
    homepageFeature: Boolean(features.homepageFeature),
  };
}

async function main() {
  const results = [];
  for (const account of ACCOUNTS) {
    results.push(await verifyAccount(account));
  }

  console.log(`Verified Queless plan QA fixtures against ${BASE_URL}`);
  console.table(results);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
