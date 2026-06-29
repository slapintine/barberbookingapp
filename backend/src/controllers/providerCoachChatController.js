import { createProviderCoachChatReply } from "../services/providerCoachChatService.js";

export async function postProviderCoachChat(req, res, next) {
  try {
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
