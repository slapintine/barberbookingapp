import { env } from "../config/env.js";
import { buildRuleBasedInsights } from "./insightRules.js";

export async function generateAiCoachInsights(input) {
  const mode = String(env.aiCoachMode || "rules").toLowerCase();

  if (mode === "openai") {
    // Backend-only provider hook. Until OPENAI integration is configured,
    // return rule-based insights without claiming external AI analysis.
    return {
      mode: "rules",
      insights: buildRuleBasedInsights(input),
    };
  }

  return {
    mode: "rules",
    insights: buildRuleBasedInsights(input),
  };
}
