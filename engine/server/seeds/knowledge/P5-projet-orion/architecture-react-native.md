# Architecture React Native — Projet Orion

## Structure du Projet

```
apps/mobile/
├── app/                    # Expo Router (file-based routing)
│   ├── (auth)/
│   │   ├── login.tsx
│   │   └── _layout.tsx
│   ├── (main)/
│   │   ├── index.tsx       # Conversations list
│   │   ├── chat/[id].tsx   # Chat screen
│   │   ├── settings.tsx
│   │   └── _layout.tsx     # Tab navigator
│   └── _layout.tsx         # Root layout (auth check)
├── components/
│   ├── chat/
│   │   ├── MessageBubble.tsx
│   │   ├── MessageInput.tsx
│   │   ├── StreamingText.tsx
│   │   └── TypingIndicator.tsx
│   ├── conversations/
│   │   ├── ConversationCard.tsx
│   │   └── ConversationList.tsx
│   └── common/
│       ├── Avatar.tsx
│       ├── Badge.tsx
│       └── LoadingScreen.tsx
├── hooks/
│   ├── useChat.ts          # Streaming + message state
│   ├── useOffline.ts       # Offline detection + sync
│   ├── usePushNotif.ts     # Push notification registration
│   └── useBiometric.ts     # Face ID / Touch ID
├── stores/
│   ├── auth.ts             # Zustand + MMKV persistence
│   ├── conversations.ts
│   └── settings.ts
├── services/
│   ├── api.ts              # @modularmind/api-client wrapper
│   ├── sse.ts              # React Native SSE implementation
│   ├── offline.ts          # SQLite sync manager
│   └── notifications.ts   # Expo Notifications
├── utils/
│   └── storage.ts          # MMKV wrapper
├── app.json                # Expo config
├── eas.json                # EAS Build config
└── package.json
```

## Navigation

```
Root Layout (auth check)
├── (auth) - Stack Navigator
│   └── LoginScreen
└── (main) - Tab Navigator
    ├── Conversations Tab
    │   ├── ConversationsScreen (list)
    │   └── ChatScreen (conversation detail)
    ├── Search Tab
    │   └── SearchScreen (RAG search - v1.1)
    └── Settings Tab
        └── SettingsScreen
```

## SSE Streaming sur React Native

React Native ne supporte pas `EventSource` nativement. On utilise un polyfill basé sur `fetch` + `ReadableStream` :

```typescript
// services/sse.ts
class MobileSSEClient {
  private controller: AbortController | null = null;

  async connect(url: string, options: SSEOptions) {
    this.controller = new AbortController();

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cookie': await getSessionCookie(),
      },
      signal: this.controller.signal,
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const events = this.parseEvents(buffer);
      buffer = events.remaining;

      for (const event of events.parsed) {
        options.onMessage?.(event);
      }
    }
  }

  disconnect() {
    this.controller?.abort();
    this.controller = null;
  }

  private parseEvents(buffer: string) {
    const events: SSEEvent[] = [];
    const lines = buffer.split('\n');
    let remaining = '';
    let currentEvent: Partial<SSEEvent> = {};

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        currentEvent.data = line.slice(6);
      } else if (line === '') {
        if (currentEvent.data) {
          events.push(currentEvent as SSEEvent);
          currentEvent = {};
        }
      } else {
        remaining += line + '\n';
      }
    }

    return { parsed: events, remaining };
  }
}
```

### Gestion de la Connectivité

```typescript
// hooks/useChat.ts
function useChat(conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const netInfo = useNetInfo();

  useEffect(() => {
    if (!netInfo.isConnected) {
      // Charger depuis SQLite offline
      loadOfflineMessages(conversationId).then(setMessages);
      return;
    }

    // Charger depuis l'API
    fetchMessages(conversationId).then(setMessages);
  }, [conversationId, netInfo.isConnected]);

  const sendMessage = async (content: string) => {
    if (!netInfo.isConnected) {
      // Sauvegarder en brouillon offline
      await saveOfflineDraft(conversationId, content);
      return;
    }

    setIsStreaming(true);
    const sse = new MobileSSEClient();
    await sse.connect(
      `${API_URL}/conversations/${conversationId}/stream`,
      {
        onMessage: (event) => {
          const chunk = JSON.parse(event.data);
          setMessages(prev => appendChunk(prev, chunk));
        },
        onDone: () => setIsStreaming(false),
      }
    );
  };

  return { messages, sendMessage, isStreaming };
}
```

## Offline Storage (SQLite)

```typescript
// services/offline.ts
import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('modularmind.db');

// Schema
db.execSync(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    agent_id TEXT,
    last_message TEXT,
    updated_at TEXT,
    synced INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    role TEXT,
    content TEXT,
    created_at TEXT,
    synced INTEGER DEFAULT 1,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );

  CREATE TABLE IF NOT EXISTS drafts (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    content TEXT,
    created_at TEXT
  );
`);

class OfflineSyncManager {
  // Sync strategy: last-write-wins based on updated_at
  async syncConversations() {
    const unsynced = db.getAllSync<Message>(
      'SELECT * FROM messages WHERE synced = 0'
    );

    for (const msg of unsynced) {
      try {
        await api.post(`/conversations/${msg.conversation_id}/messages`, {
          content: msg.content,
        });
        db.runSync('UPDATE messages SET synced = 1 WHERE id = ?', [msg.id]);
      } catch (e) {
        console.warn('Sync failed, will retry:', e);
      }
    }
  }

  // Cache conversations for offline access
  async cacheConversations(conversations: Conversation[]) {
    for (const conv of conversations) {
      db.runSync(
        `INSERT OR REPLACE INTO conversations (id, title, agent_id, last_message, updated_at, synced)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [conv.id, conv.title, conv.agent_id, conv.last_message, conv.updated_at]
      );
    }
  }
}
```

## Push Notifications

### Architecture

```
Engine (event) → Redis → Worker → Push Service → FCM/APNs → Device
```

### Expo Notifications Setup

```typescript
// services/notifications.ts
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

async function registerPushToken() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;

  const token = await Notifications.getExpoPushTokenAsync({
    projectId: 'modularmind-orion',
  });

  // Envoyer le token au backend
  await api.post('/notifications/register', {
    token: token.data,
    platform: Platform.OS,
    device_name: Device.modelName,
  });

  return token;
}

// Notification handlers
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});
```

### Types de Notifications

| Event | Titre | Corps | Action |
|-------|-------|-------|--------|
| `message.responded` | Agent Support | "Voici comment configurer..." | Ouvre la conversation |
| `agent.error` | Erreur Agent | "L'agent n'a pas pu répondre" | Ouvre la conversation |
| `document.processed` | Document prêt | "guide.md a été indexé" | Ouvre le knowledge base |

## Authentification Biométrique

```typescript
// hooks/useBiometric.ts
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

async function authenticateWithBiometrics(): Promise<boolean> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) return false;

  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled) return false;

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Connectez-vous à ModularMind',
    cancelLabel: 'Utiliser le mot de passe',
    disableDeviceFallback: false,
  });

  if (result.success) {
    // Récupérer le token stocké de manière sécurisée
    const token = await SecureStore.getItemAsync('auth_token');
    if (token) {
      // Vérifier que le token est encore valide
      const valid = await api.verifyToken(token);
      return valid;
    }
  }

  return false;
}
```

## CI/CD (EAS Build)

```json
// eas.json
{
  "build": {
    "development": {
      "distribution": "internal",
      "ios": { "simulator": true },
      "android": { "buildType": "apk" }
    },
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": false },
      "channel": "preview"
    },
    "production": {
      "autoIncrement": true,
      "ios": { "simulator": false },
      "android": { "buildType": "app-bundle" },
      "channel": "production"
    }
  },
  "submit": {
    "production": {
      "ios": { "appleId": "dev@modularmind.io" },
      "android": { "serviceAccountKeyPath": "./google-services.json" }
    }
  }
}
```

### Pipeline GitHub Actions

```yaml
# .github/workflows/mobile.yml
on:
  push:
    branches: [main]
    paths: ['apps/mobile/**']

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd apps/mobile && pnpm test

  build-preview:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: expo/expo-github-action@v8
      - run: eas build --platform all --profile preview --non-interactive

  submit-production:
    if: github.ref == 'refs/tags/mobile-v*'
    needs: test
    runs-on: ubuntu-latest
    steps:
      - run: eas build --platform all --profile production --non-interactive
      - run: eas submit --platform all --profile production --non-interactive
```
