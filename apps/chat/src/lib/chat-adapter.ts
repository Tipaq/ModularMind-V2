export { chatAdapter, conversationAdapter } from "@modularmind/api-client";
import { createChatConfigAdapter } from "@modularmind/api-client";

export const chatConfigAdapter = createChatConfigAdapter({
  includeUserPreferences: true,
  includeSupervisorWrite: true,
});
