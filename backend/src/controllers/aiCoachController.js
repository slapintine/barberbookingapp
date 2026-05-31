import { getAiCoachInsightsForBusiness } from "../services/aiCoachService.js";

export async function getAiCoachInsights(req, res, next) {
  try {
    const business = req.business;
    const result = await getAiCoachInsightsForBusiness(business);

    res.json({
      success: true,
      businessId: business.id,
      plan: "PLATINUM",
      mode: result.mode,
      generatedAt: new Date().toISOString(),
      insights: result.insights,
    });
  } catch (error) {
    next(error);
  }
}
