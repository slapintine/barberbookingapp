import { createProviderCoachChatReply } from "../services/providerCoachChatService.js";
import { canAccessBusinessCoach } from "../services/entitlementService.js";
import { get } from "../db/query.js";

export async function postProviderCoachChat(req, res, next) {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) {
      return res.status(400).json({
        success: false,
        code: "INVALID_MESSAGE",
        message: "Enter a question for Provider Coach.",
      });
    }

    const stand = await get(`SELECT id FROM barbers WHERE owner_user_id = ? LIMIT 1`, [req.user?.id]);
    if (!stand) {
      return res.status(404).json({
        success: false,
        code: "NO_STAND",
        message: "Create or save your stand first so Coach can give advice based on your business.",
      });
    }

    const coachAccess = await canAccessBusinessCoach(req.user?.id);
    if (!coachAccess) {
      return res.status(403).json({
        success: false,
        code: "PLATINUM_PROVIDER_REQUIRED",
        message: "Provider Coach is included with Platinum Provider.",
      });
    }

    const result = await createProviderCoachChatReply({
      userId: req.user?.id,
      message: req.body?.message,
      history: req.body?.history,
    });

    res.json({
      success: true,
      ...result,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error?.statusCode === 404) {
      return res.status(404).json({
        success: false,
        code: "NO_STAND",
        message: "Create or save your stand first so Coach can give advice based on your business.",
      });
    }
    return next(error);
  }
}
