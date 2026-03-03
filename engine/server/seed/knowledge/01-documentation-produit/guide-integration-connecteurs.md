# Guide d'intégration — Connecteurs externes ModularMind

## Vue d'ensemble

ModularMind s'intègre avec des services tiers via le protocole MCP (Model Context Protocol) et des connecteurs REST natifs. Ce guide couvre la configuration et l'utilisation des connecteurs disponibles.

## Architecture des connecteurs

```
Agent ──→ Graph Engine ──→ Tool Node ──→ MCP Registry ──→ Connecteur
                                                              │
                                                    ┌─────────┼─────────┐
                                                    │         │         │
                                              ┌─────┴───┐ ┌──┴────┐ ┌──┴─────┐
                                              │  Slack   │ │ REST  │ │Database│
                                              │  Bot     │ │Webhook│ │Connector│
                                              └─────────┘ └───────┘ └────────┘
```

## Connecteurs MCP

### Qu'est-ce que MCP ?

Le Model Context Protocol est un protocole standardisé permettant aux agents IA d'interagir avec des outils externes de manière sécurisée et structurée. Chaque outil MCP expose :

- Un **schéma JSON** décrivant ses paramètres d'entrée
- Une **description** en langage naturel pour que l'agent comprenne quand l'utiliser
- Un **endpoint d'exécution** pour l'appel effectif

### Enregistrer un outil MCP

Dans la console Ops, naviguez vers **Configuration > Outils MCP** :

```yaml
# Exemple de configuration d'outil MCP
name: "search_jira"
description: "Recherche des tickets Jira par projet, statut ou assigné"
server:
  type: "sidecar"
  command: "npx"
  args: ["@modularmind/mcp-jira", "--base-url", "https://company.atlassian.net"]
  env:
    JIRA_TOKEN: "${JIRA_API_TOKEN}"
input_schema:
  type: object
  properties:
    query:
      type: string
      description: "Requête JQL"
    max_results:
      type: integer
      default: 10
  required: ["query"]
```

### Outils MCP disponibles

| Outil | Description | Fournisseur |
|-------|-------------|-------------|
| `search_web` | Recherche web via DuckDuckGo ou Google | Natif |
| `search_jira` | Recherche de tickets Jira | Sidecar |
| `create_jira_ticket` | Création de ticket Jira | Sidecar |
| `send_slack_message` | Envoi de message Slack | Sidecar |
| `query_database` | Requête SQL en lecture seule | Natif |
| `send_email` | Envoi d'email via SMTP | Natif |
| `http_request` | Requête HTTP générique | Natif |
| `file_reader` | Lecture de fichiers locaux | Natif |

## Intégration Slack

### Configuration

1. Créez une application Slack sur `api.slack.com/apps`
2. Activez les permissions : `chat:write`, `channels:read`, `users:read`
3. Installez l'application dans votre workspace
4. Récupérez le **Bot Token** (`xoxb-...`)
5. Configurez dans ModularMind :

```env
SLACK_BOT_TOKEN=xoxb-votre-token
SLACK_DEFAULT_CHANNEL=#support-ia
```

### Utilisation dans un graphe

Ajoutez un **Tool Node** avec l'outil `send_slack_message` :

```json
{
  "channel": "#alerts",
  "text": "Nouvelle demande de support reçue de {user_name}",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Demande :* {message_content}"
      }
    }
  ]
}
```

## Intégration Microsoft Teams

### Configuration

1. Enregistrez une application dans Azure Active Directory
2. Ajoutez les permissions Microsoft Graph : `ChannelMessage.Send`, `Chat.ReadWrite`
3. Configurez le secret client et le tenant ID dans ModularMind

```env
TEAMS_TENANT_ID=votre-tenant-id
TEAMS_CLIENT_ID=votre-client-id
TEAMS_CLIENT_SECRET=votre-secret
```

## Webhooks REST

### Webhooks sortants (ModularMind → Externe)

Configurez des webhooks pour notifier des systèmes externes lors d'événements :

```json
{
  "url": "https://votre-api.com/webhook",
  "events": ["conversation.created", "message.received", "agent.error"],
  "secret": "votre_secret_hmac",
  "headers": {
    "Authorization": "Bearer votre-token"
  },
  "retry_policy": {
    "max_retries": 3,
    "backoff_seconds": [5, 30, 300]
  }
}
```

### Webhooks entrants (Externe → ModularMind)

Recevez des événements externes pour déclencher des actions dans ModularMind :

```
POST /api/webhooks/inbound/{webhook_id}
Content-Type: application/json
X-Webhook-Signature: sha256=...

{
  "event": "ticket.created",
  "data": {
    "ticket_id": "JIRA-1234",
    "title": "Bug critique en production",
    "priority": "high"
  }
}
```

### Vérification de signature

Tous les webhooks entrants sont vérifiés par signature HMAC-SHA256 :

```python
import hmac
import hashlib

def verify_webhook(payload: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)
```

## Connecteurs base de données

### Bases supportées

- PostgreSQL (via asyncpg)
- MySQL (via aiomysql)
- SQLite (via aiosqlite)
- MongoDB (via motor)

### Configuration

```yaml
name: "query_crm_database"
description: "Interroge la base CRM pour obtenir des informations client"
connection:
  type: "postgresql"
  host: "crm-db.internal"
  port: 5432
  database: "crm_production"
  user: "readonly_user"
  password: "${CRM_DB_PASSWORD}"
security:
  read_only: true
  max_rows: 100
  allowed_tables: ["customers", "orders", "products"]
  blocked_columns: ["password_hash", "credit_card"]
```

## Bonnes pratiques de sécurité

1. **Principe du moindre privilège** : N'accordez que les permissions nécessaires
2. **Lecture seule** : Privilégiez les accès en lecture seule pour les connecteurs DB
3. **Rotation des secrets** : Changez les tokens API tous les 90 jours
4. **Logs d'audit** : Activez le logging de toutes les invocations d'outils
5. **Rate limiting** : Configurez des limites par outil pour éviter les abus
6. **Validation des entrées** : Les paramètres sont validés contre le schéma JSON avant exécution
