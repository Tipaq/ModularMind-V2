import type { DLQMessage } from "@modularmind/api-client";

/**
 * Maps DLQ messages to business domains based on their `original_stream`.
 * This enables filtering DLQ views by domain (executions, memory, knowledge).
 */
export const DLQ_DOMAINS = {
  executions: ["tasks:executions", "tasks:models"],
  memory: ["memory:raw", "memory:extracted", "memory:scored"],
  knowledge: ["tasks:documents", "rag:extracted", "rag:embedded"],
} as const;

export type DLQDomain = keyof typeof DLQ_DOMAINS;

export const DLQ_DOMAIN_LABELS: Record<DLQDomain, string> = {
  executions: "Executions",
  memory: "Memory",
  knowledge: "Knowledge",
};

/** Filter DLQ messages to a specific business domain. */
export function filterDLQByDomain(messages: DLQMessage[], domain: DLQDomain): DLQMessage[] {
  const streams = DLQ_DOMAINS[domain];
  return messages.filter((msg) => (streams as readonly string[]).includes(msg.original_stream));
}

/** Count DLQ messages per domain. */
export function countDLQByDomain(
  messages: DLQMessage[],
): Record<DLQDomain, number> {
  const counts: Record<DLQDomain, number> = { executions: 0, memory: 0, knowledge: 0 };
  for (const msg of messages) {
    for (const [domain, streams] of Object.entries(DLQ_DOMAINS)) {
      if ((streams as readonly string[]).includes(msg.original_stream)) {
        counts[domain as DLQDomain]++;
        break;
      }
    }
  }
  return counts;
}
