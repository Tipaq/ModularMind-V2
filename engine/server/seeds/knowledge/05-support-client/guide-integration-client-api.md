# Guide d'intégration client — API REST

## Introduction

Ce guide explique comment intégrer ModularMind dans vos applications via l'API REST. Que vous développiez un chatbot, une application interne, ou un système automatisé, l'API vous donne accès à toutes les fonctionnalités de la plateforme.

## Authentification

### Obtenir un token

```bash
curl -X POST https://api.modularmind.io/auth/login   -H "Content-Type: application/json"   -d '{"email": "votre@email.com", "password": "votre_mot_de_passe"}'
```

La réponse contient un cookie `access_token` à inclure dans les requêtes suivantes.

### Utiliser un API Key (M2M)

Pour les intégrations machine-to-machine, utilisez une clé API :

```bash
curl -H "Authorization: Bearer mm_api_VOTRE_CLE" https://api.modularmind.io/agents
```

Les clés API sont créées dans la console Ops : **Paramètres > API Keys**.

## Exemples d'intégration

### Python

```python
import httpx

client = httpx.Client(
    base_url="https://api.modularmind.io",
    headers={"Authorization": "Bearer mm_api_VOTRE_CLE"}
)

# Créer une conversation
conv = client.post("/conversations", json={
    "agent_id": "agt_support01",
    "title": "Support automatisé"
}).json()

# Envoyer un message
response = client.post(
    f"/conversations/{conv['id']}/messages",
    json={"content": "Bonjour, j'ai besoin d'aide"}
).json()

print(response["assistant_message"]["content"])
```

### JavaScript / Node.js

```javascript
const API_BASE = 'https://api.modularmind.io';
const API_KEY = 'mm_api_VOTRE_CLE';

// Envoyer un message avec streaming SSE
const response = await fetch(
  `${API_BASE}/conversations/${convId}/messages/stream?content=${encodeURIComponent(message)}`,
  { headers: { 'Authorization': `Bearer ${API_KEY}` } }
);

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value);
  process.stdout.write(text);
}
```

## Rate Limits

| Plan | Requêtes/min | Messages/heure | Documents/jour |
|------|-------------|---------------|----------------|
| Starter | 60 | 500 | 50 |
| Pro | 300 | 5000 | 500 |
| Enterprise | Illimité | Illimité | Illimité |

Les headers de rate limit sont inclus dans chaque réponse :
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1709280060
```

## Gestion des erreurs

Toutes les erreurs suivent le format :
```json
{
  "detail": "Message lisible",
  "code": "error_code",
  "status": 400
}
```

| Code | Status | Action recommandée |
|------|--------|-------------------|
| `rate_limited` | 429 | Attendez le délai indiqué dans `X-RateLimit-Reset` |
| `model_unavailable` | 503 | Réessayez après 30 secondes |
| `invalid_credentials` | 401 | Vérifiez votre clé API |
| `insufficient_permissions` | 403 | Contactez votre administrateur |

## Webhooks

Pour être notifié des événements en temps réel, configurez un webhook :

```bash
curl -X POST https://api.modularmind.io/webhooks   -H "Authorization: Bearer mm_api_VOTRE_CLE"   -H "Content-Type: application/json"   -d '{
    "url": "https://votre-app.com/webhook",
    "events": ["message.responded"],
    "secret": "votre_secret_hmac"
  }'
```