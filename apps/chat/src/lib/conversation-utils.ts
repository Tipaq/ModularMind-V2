import type { Conversation } from "@modularmind/api-client";

interface ConversationGroup {
  label: string;
  conversations: Conversation[];
}

export function groupConversationsByTime(conversations: Conversation[]): ConversationGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
  const weekStart = new Date(todayStart.getTime() - 7 * 86_400_000);

  const today: Conversation[] = [];
  const yesterday: Conversation[] = [];
  const lastWeek: Conversation[] = [];
  const older: Conversation[] = [];

  for (const conv of conversations) {
    const updatedAt = new Date(conv.updated_at || conv.created_at);
    if (updatedAt >= todayStart) today.push(conv);
    else if (updatedAt >= yesterdayStart) yesterday.push(conv);
    else if (updatedAt >= weekStart) lastWeek.push(conv);
    else older.push(conv);
  }

  const groups: ConversationGroup[] = [];
  if (today.length > 0) groups.push({ label: "Today", conversations: today });
  if (yesterday.length > 0) groups.push({ label: "Yesterday", conversations: yesterday });
  if (lastWeek.length > 0) groups.push({ label: "Last 7 days", conversations: lastWeek });
  if (older.length > 0) groups.push({ label: "Older", conversations: older });
  return groups;
}
