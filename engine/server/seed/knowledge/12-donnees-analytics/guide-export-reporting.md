# Data Export & Reporting Guide

## Export Capabilities

ModularMind provides several data export mechanisms for reporting and compliance purposes.

## Conversation Export

### Single Conversation (UI)

From the Chat interface, users can export individual conversations:

- **Markdown** (.md): Human-readable format with timestamps and metadata
- **PDF**: Formatted document suitable for printing or archiving
- **JSON**: Machine-readable format for integration

### Bulk Export (API)

Administrators can export conversations in bulk:

```bash
# Export all conversations for a date range
curl -X GET "https://api.modularmind.io/admin/export/conversations?from=2026-01-01&to=2026-03-01&format=json"   -H "Cookie: access_token=ADMIN_TOKEN"   -o conversations_export.json
```

**Export Format (JSON):**
```json
{
  "exported_at": "2026-03-01T10:00:00Z",
  "total": 1250,
  "conversations": [
    {
      "id": "conv_abc123",
      "user_email": "user@company.com",
      "agent_name": "Support Agent",
      "title": "SSO Configuration Help",
      "message_count": 8,
      "created_at": "2026-02-15T10:00:00Z",
      "messages": [...]
    }
  ]
}
```

### Filters Available

| Filter | Parameter | Example |
|--------|-----------|---------|
| Date range | `from`, `to` | `2026-01-01`, `2026-03-01` |
| Agent | `agent_id` | `agt_support01` |
| User | `user_id` | `usr_jean01` |
| Status | `status` | `active`, `archived` |
| Format | `format` | `json`, `csv` |

## Analytics Export

### Usage Reports

Monthly usage reports are generated automatically and sent to administrators:

```
ModularMind Usage Report — February 2026

Conversations: 1,250 (+15% vs January)
Messages: 8,430 (+12%)
Unique Users: 156 (+8%)
Average Messages/Conversation: 6.7

Top Agents:
1. Support Agent — 450 conversations
2. Code Review Agent — 280 conversations
3. Documentation Agent — 190 conversations

LLM Token Usage:
- OpenAI (gpt-4o-mini): 2.4M tokens ($360)
- Ollama (llama3.1:8b): 1.8M tokens ($0)
- Anthropic (claude-sonnet-4-6): 800K tokens ($120)

Total Estimated Cost: $480
```

### Custom Reports

Create custom reports via the Ops console:

1. Navigate to **Analytics > Reports**
2. Select metrics and dimensions
3. Choose date range and granularity (hourly, daily, weekly, monthly)
4. Export as CSV, JSON, or PDF
5. Optionally schedule for periodic delivery (email or Slack)

## RGPD Data Export

### User Data Export (Right of Access)

Export all data related to a specific user:

```bash
curl -X GET "https://api.modularmind.io/admin/export/user-data?user_id=usr_jean01"   -H "Cookie: access_token=ADMIN_TOKEN"   -o user_data_export.json
```

**Includes:**
- User profile (email, name, role, groups)
- All conversations and messages
- All memory entries
- All document uploads
- Access logs (last 90 days)

**Excludes:**
- Hashed passwords
- Internal system metadata
- Other users' data

### Data Deletion (Right to Erasure)

```bash
curl -X DELETE "https://api.modularmind.io/admin/users/usr_jean01/data"   -H "Cookie: access_token=ADMIN_TOKEN"
```

This triggers:
1. Soft-delete all conversations (archived with anonymized user reference)
2. Hard-delete all memory entries
3. Remove user from RAG collection ownership
4. Anonymize access logs
5. Deactivate user account

## Scheduled Reports

Configure automated reports in **Ops > Analytics > Scheduled Reports**:

| Report | Frequency | Recipients | Format |
|--------|-----------|------------|--------|
| Usage summary | Weekly (Monday 9AM) | management@modularmind.io | PDF |
| Cost report | Monthly (1st, 9AM) | finance@modularmind.io | CSV |
| Security audit | Monthly (1st, 9AM) | security@modularmind.io | JSON |
| SLO dashboard | Daily (8AM) | devops@modularmind.io | Slack webhook |