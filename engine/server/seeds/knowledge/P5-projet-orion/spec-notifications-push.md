# Spécification — Notifications Push (Projet Orion)

## Vue d'ensemble

Le système de notifications push permet d'alerter les utilisateurs mobiles en temps réel des événements importants (réponses d'agents, erreurs, documents prêts).

## Architecture

```
Engine (event) ──→ Redis Stream (notifications:push) ──→ Worker
                                                           │
                                                           ↓
                                                    Push Service
                                                           │
                                              ┌────────────┼────────────┐
                                              ↓            ↓            ↓
                                           Expo Push   FCM (Android)  APNs (iOS)
                                           Service     (fallback)     (fallback)
                                              │
                                              ↓
                                         Mobile App
```

### Flow Détaillé

1. L'Engine émet un event sur le stream `notifications:push` (ex: `message.responded`)
2. Le Worker consumer récupère l'event
3. Le Push Service vérifie les préférences de notification de l'utilisateur
4. Si activé, envoie via **Expo Push Service** (qui route vers FCM/APNs)
5. En cas d'échec Expo, fallback direct vers FCM/APNs

## Modèle de Données

### Table `push_tokens`

```sql
CREATE TABLE push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    token TEXT NOT NULL,                    -- Expo push token
    platform VARCHAR(10) NOT NULL,          -- 'ios' | 'android'
    device_name VARCHAR(100),               -- "iPhone 15 Pro"
    app_version VARCHAR(20),                -- "1.0.0"
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, token)
);
```

### Table `notification_preferences`

```sql
CREATE TABLE notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    enabled BOOLEAN DEFAULT true,
    -- Par type d'event
    message_responded BOOLEAN DEFAULT true,
    agent_error BOOLEAN DEFAULT true,
    document_processed BOOLEAN DEFAULT false,
    system_alerts BOOLEAN DEFAULT true,
    -- Horaires (quiet hours)
    quiet_start TIME,                       -- ex: 22:00
    quiet_end TIME,                         -- ex: 07:00
    timezone VARCHAR(50) DEFAULT 'Europe/Paris',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table `notification_log`

```sql
CREATE TABLE notification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    title VARCHAR(200),
    body TEXT,
    data JSONB,
    status VARCHAR(20) NOT NULL,            -- 'sent' | 'failed' | 'suppressed'
    error_message TEXT,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Events et Notifications

### Mapping Event → Notification

| Event Type | Titre | Corps (template) | Data | Priorité |
|------------|-------|-------------------|------|----------|
| `message.responded` | `{agent_name}` | `{content_preview}` (max 100 chars) | `{conversation_id, message_id}` | Normal |
| `agent.error` | "Erreur - {agent_name}" | "L'agent n'a pas pu traiter votre message" | `{conversation_id, error_code}` | High |
| `agent.fallback` | `{agent_name}` | "Réponse via modèle alternatif" | `{conversation_id}` | Normal |
| `document.processed` | "Document prêt" | "{filename} a été indexé ({chunk_count} chunks)" | `{document_id, collection_id}` | Low |
| `document.failed` | "Erreur document" | "Echec du traitement de {filename}" | `{document_id, error}` | Normal |
| `system.maintenance` | "Maintenance planifiée" | "{message}" | `{maintenance_id}` | High |

### Exemple de Payload Expo

```json
{
  "to": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "title": "Agent Support",
  "body": "Voici comment configurer le rate limiting dans ModularMind. Vous devez d'abord...",
  "data": {
    "type": "message.responded",
    "conversation_id": "conv_abc123",
    "message_id": "msg_004"
  },
  "sound": "default",
  "badge": 1,
  "categoryId": "message",
  "priority": "default",
  "channelId": "messages"
}
```

## Push Service (Backend)

```python
# src/notifications/push_service.py
from httpx import AsyncClient

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

class PushService:
    def __init__(self, db_session):
        self.db = db_session
        self.client = AsyncClient()

    async def send_notification(
        self,
        user_id: str,
        event_type: str,
        title: str,
        body: str,
        data: dict = None,
    ):
        # 1. Vérifier les préférences
        prefs = await self._get_preferences(user_id)
        if not prefs.enabled:
            return await self._log("suppressed", "notifications disabled")

        if not getattr(prefs, event_type.replace(".", "_"), True):
            return await self._log("suppressed", f"{event_type} disabled")

        if self._is_quiet_hours(prefs):
            return await self._log("suppressed", "quiet hours")

        # 2. Récupérer les tokens actifs
        tokens = await self._get_active_tokens(user_id)
        if not tokens:
            return await self._log("suppressed", "no active tokens")

        # 3. Envoyer via Expo
        messages = [
            {
                "to": token.token,
                "title": title,
                "body": body[:200],  # Truncate for push
                "data": data or {},
                "sound": "default",
                "badge": await self._get_badge_count(user_id),
            }
            for token in tokens
        ]

        response = await self.client.post(
            EXPO_PUSH_URL,
            json=messages,
            headers={"Accept": "application/json"},
        )

        # 4. Traiter les résultats
        results = response.json().get("data", [])
        for i, result in enumerate(results):
            if result.get("status") == "error":
                error = result.get("message", "Unknown error")
                if "DeviceNotRegistered" in error:
                    await self._deactivate_token(tokens[i].id)
                await self._log("failed", error)
            else:
                await self._log("sent")
```

## Android Notification Channels

```typescript
// Configuration des channels Android (dans app.json)
{
  "expo": {
    "android": {
      "notificationChannels": [
        {
          "channelId": "messages",
          "name": "Messages",
          "description": "Réponses des agents",
          "importance": 3,
          "vibrationPattern": [0, 250, 250, 250],
          "sound": "default"
        },
        {
          "channelId": "errors",
          "name": "Erreurs",
          "description": "Erreurs des agents et du système",
          "importance": 4,
          "sound": "alert"
        },
        {
          "channelId": "documents",
          "name": "Documents",
          "description": "Statut de traitement des documents",
          "importance": 2,
          "sound": null
        }
      ]
    }
  }
}
```

## Gestion du Badge Count

```python
async def _get_badge_count(self, user_id: str) -> int:
    """Retourne le nombre de conversations avec des messages non lus."""
    result = await self.db.execute(
        text("""
            SELECT COUNT(DISTINCT c.id)
            FROM conversations c
            JOIN messages m ON m.conversation_id = c.id
            WHERE c.user_id = :user_id
            AND m.role = 'assistant'
            AND m.created_at > c.last_read_at
        """),
        {"user_id": user_id}
    )
    return result.scalar() or 0
```

## Rate Limiting des Notifications

Pour éviter le spam de notifications :

| Règle | Limite |
|-------|--------|
| Max notifications par user par minute | 5 |
| Max notifications par user par heure | 30 |
| Max notifications par user par jour | 100 |
| Cooldown entre 2 notifs du même type | 30 secondes |
| Batch streaming (regrouper les tokens) | Si > 3 tokens en 5s → 1 seule notif |

## Métriques

| Métrique | Description |
|----------|-------------|
| `push_sent_total` | Nombre total de notifications envoyées |
| `push_failed_total` | Nombre de notifications échouées |
| `push_suppressed_total` | Nombre supprimées (prefs, quiet hours) |
| `push_delivery_latency_ms` | Latence de livraison (Expo → device) |
| `push_open_rate` | % de notifications ouvertes par l'utilisateur |
