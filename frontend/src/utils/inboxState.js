export function normalizeConversations(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.conversations)) return payload.conversations;
  return [];
}

export function classifyInboxError(error) {
  const status = Number(error?.status || 0);
  if (status === 404) return "empty";
  if ([401, 403].includes(status) || error?.isAuthError) return "unauthenticated";
  return "error";
}
