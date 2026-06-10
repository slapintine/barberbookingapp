import {
  createProviderCoachAdvice,
  getAiCoachInsightsForBusiness,
  getOwnedAiCoachBusiness,
  getProviderCoachAccess,
  getProviderCoachQuestions,
} from "../services/aiCoachService.js";
import { getProviderCoachPlan, getLatestProviderSubscription } from "../services/providerSubscriptionAccess.js";

export async function getAiCoachInsights(req, res, next) {
  try {
    const business = req.business;
    const result = await getAiCoachInsightsForBusiness(business);
    const { access } = await getProviderCoachAccess(business);

    res.json({
      success: true,
      businessId: business.id,
      plan: access.plan,
      mode: result.mode,
      generatedAt: new Date().toISOString(),
      weeklyGrowthFocus: result.weeklyGrowthFocus,
      insights: result.insights,
    });
  } catch (error) {
    next(error);
  }
}

// Owner-based insights: no businessId param required — looks up by req.user.id
export async function getMyCoachInsights(req, res, next) {
  try {
    let business;
    try {
      business = await getOwnedAiCoachBusiness(req.user?.id, null);
    } catch (err) {
      if (err.statusCode === 404) {
        return res.json({
          success: true,
          businessFound: false,
          plan: "free",
          access: "locked",
          message: "Create your business stand first to unlock Provider Coach.",
        });
      }
      throw err;
    }

    const subscription = await getLatestProviderSubscription(business.id);
    const access = getProviderCoachPlan(business, subscription);
    const result = await getAiCoachInsightsForBusiness(business);

    res.json({
      success: true,
      businessFound: true,
      businessId: business.id,
      plan: access.plan,
      access: access.active ? (access.unlimited ? "unlimited" : "limited") : "locked",
      mode: result.mode,
      generatedAt: new Date().toISOString(),
      weeklyGrowthFocus: result.weeklyGrowthFocus,
      insights: result.insights,
    });
  } catch (error) {
    next(error);
  }
}

export async function getProviderCoachQuestionList(req, res, next) {
  try {
    let business;
    try {
      business = await getOwnedAiCoachBusiness(req.user?.id, req.query?.businessId || req.params?.businessId);
    } catch (err) {
      if (err.statusCode === 404) {
        // No business yet — return a locked state instead of a 404 error
        return res.json({
          success: true,
          businessFound: false,
          questions: [],
          categories: [],
          access: { allowed: false, upgradeRequired: false, noBusinessYet: true },
          usage: { plan: "free", limit: 0, usedThisMonth: 0, remainingThisMonth: 0, unlimited: false },
        });
      }
      throw err;
    }

    const result = await getProviderCoachQuestions({ business });

    res.json({
      success: true,
      businessFound: true,
      businessId: business.id,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function postProviderCoachAdvice(req, res, next) {
  try {
    const business = await getOwnedAiCoachBusiness(req.user?.id, req.body?.businessId || req.params?.businessId);
    const result = await createProviderCoachAdvice({
      business,
      questionId: req.body?.questionId,
    });

    res.json({
      success: true,
      businessId: business.id,
      ...result,
    });
  } catch (error) {
    if (error?.code === "UPGRADE_REQUIRED" || error?.code === "DAILY_LIMIT_REACHED" || error?.code === "MONTHLY_LIMIT_REACHED") {
      return res.status(error.statusCode || 403).json({
        success: false,
        code: error.code,
        message: error.message,
        usage: error.usage,
      });
    }
    return next(error);
  }
}
