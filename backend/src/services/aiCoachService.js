import { all } from "../db/query.js";
import { generateAiCoachInsights } from "./aiProvider.js";

export async function getAiCoachInsightsForBusiness(business) {
  const businessId = Number(business?.id || 0);
  const [services, schedule, bookings, reviews] = await Promise.all([
    all(`SELECT * FROM barber_services WHERE barber_id = ? ORDER BY category ASC, service_name ASC`, [businessId]),
    all(`SELECT * FROM barber_schedule WHERE barber_id = ? ORDER BY day_of_week ASC`, [businessId]),
    all(`SELECT * FROM bookings WHERE barber_id = ? ORDER BY booking_date DESC, booking_time DESC, id DESC LIMIT 250`, [businessId]),
    all(`SELECT * FROM reviews WHERE barber_id = ? AND COALESCE(blocked_from_public, 0) = 0 ORDER BY created_at DESC, id DESC LIMIT 100`, [businessId]),
  ]);

  return generateAiCoachInsights({ business, services, schedule, bookings, reviews });
}
