# Architecture Frontend v4 — Projet Phoenix

## Vue d'ensemble

L'architecture frontend v4 repose sur un monorepo pnpm avec trois applications (Chat, Ops, Platform) partageant un design system unifié via le package `@modularmind/ui`.

```
apps/
├── chat/          # Vite + React 19 — SPA utilisateur
├── ops/           # Vite + React 19 — SPA administration
packages/
├── ui/            # Design system partagé (shadcn/ui + tokens)
├── api-client/    # Client HTTP typé
platform/          # Next.js 16 — App Router
```

## Stack Technique

| Couche | Technologie | Justification |
|--------|------------|---------------|
| Framework | React 19 | Concurrent features, server components ready |
| Bundler | Vite 6 | HMR rapide, build optimisé, ESM natif |
| Styling | Tailwind CSS v4 | Tokens CSS natifs, pas de config JS |
| Composants | shadcn/ui | Composants accessibles, personnalisables, non-opinionated |
| State | Zustand | Léger (1.1 KB), simple, pas de boilerplate |
| Routing | React Router v7 | Loader/action pattern, lazy loading natif |
| Forms | React Hook Form + Zod | Validation schema-first, performant |
| Tests | Vitest + Playwright | Unit + E2E, compatible Vite |

## Design System (`@modularmind/ui`)

### Architecture des Tokens

```css
/* packages/ui/src/styles/theme.css */
:root {
  /* Primitives (HSL) */
  --primary: 222 47% 31%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96%;
  --muted: 210 40% 96%;
  --accent: 210 40% 96%;
  --destructive: 0 84% 60%;
  --success: 142 71% 45%;
  --warning: 38 92% 50%;
  --info: 199 89% 48%;

  /* Layout */
  --radius: 0.5rem;
  --sidebar-width: 280px;
}

.dark {
  --primary: 217 91% 60%;
  --primary-foreground: 222 47% 11%;
  /* ... dark overrides */
}
```

### Composants Partagés

Trois niveaux de composants :

1. **Primitives** (shadcn/ui) : Button, Input, Dialog, Sheet, Tooltip, etc.
2. **Composants métier** : StatusBadge, ChannelBadge, UserButton, PageHeader
3. **Layouts** : AppShell, SidebarLayout, PageContainer

### ThemeProvider

```tsx
// Gère mode (light/dark/system), accent color (hue/saturation), presets
<ThemeProvider defaultMode="system" storagePrefix="mm-theme">
  <App />
</ThemeProvider>
```

Le ThemeProvider persiste dans localStorage et applique les variables CSS sur `:root`. Un script inline dans `<head>` empêche le FOUC.

## Architecture par Application

### Chat App

```
apps/chat/src/
├── components/
│   ├── chat/          # ConversationView, MessageBubble, InputBar
│   ├── sidebar/       # ConversationList, SearchPanel
│   └── layout/        # ChatLayout, MobileNav
├── hooks/
│   ├── useChat.ts     # Logique conversation + SSE streaming
│   ├── useMemory.ts   # Affichage mémoires contextuelles
│   └── useSearch.ts   # Recherche RAG inline
├── stores/
│   ├── auth.ts        # Session utilisateur (Zustand)
│   └── chat.ts        # Etat conversations (Zustand)
├── pages/
│   ├── ChatPage.tsx   # Route principale
│   └── SettingsPage.tsx
└── lib/
    └── sse.ts         # EventSource wrapper avec reconnection
```

**Pattern SSE Streaming :**
```tsx
const eventSource = new EventSource(
  `${API_URL}/conversations/${id}/stream`,
  { withCredentials: true }
);
eventSource.onmessage = (e) => {
  const chunk = JSON.parse(e.data);
  appendToMessage(chunk.content);
};
```

### Ops App

```
apps/ops/src/
├── components/
│   ├── dashboard/     # StatCards, ActivityFeed, HealthGrid
│   ├── agents/        # AgentConfigForm, AgentTestPanel
│   ├── knowledge/     # CollectionManager, DocumentUploader
│   ├── monitoring/    # MetricsCharts, LogViewer
│   └── layout/        # OpsLayout, Sidebar
├── stores/
│   └── auth.ts
├── pages/
│   ├── DashboardPage.tsx
│   ├── AgentsPage.tsx
│   ├── KnowledgePage.tsx
│   ├── MonitoringPage.tsx
│   └── SettingsPage.tsx
└── lib/
    └── charts.ts      # Recharts config
```

## Performance Budget

| Métrique | Budget |
|----------|--------|
| First Contentful Paint | < 1.2s |
| Time to Interactive | < 2.0s |
| Total Bundle (gzip) | < 250 KB (initial) |
| Largest Contentful Paint | < 2.5s |
| Cumulative Layout Shift | < 0.1 |

### Stratégies d'Optimisation

1. **Code splitting** : chaque page en lazy import (`React.lazy`)
2. **Tree shaking** : imports nommés depuis `@modularmind/ui`
3. **Preload** : `<link rel="preload">` pour la font Inter et le CSS critique
4. **Image optimization** : WebP + lazy loading natif
5. **Service Worker** : cache des assets statiques (Workbox)

## Accessibilité (WCAG 2.1 AA)

### Principes Appliqués

- **Navigation clavier** : tous les éléments interactifs sont focusables
- **Focus visible** : ring `2px` avec couleur primaire sur `:focus-visible`
- **ARIA** : labels sur tous les boutons icon-only, `aria-live` pour le streaming
- **Contraste** : ratio minimum 4.5:1 (texte) et 3:1 (UI)
- **Réduction de mouvement** : `prefers-reduced-motion` respecté
- **Screen reader** : structure sémantique (headings, landmarks, lists)

### Tests Automatisés

```bash
# axe-core intégré dans Playwright
test('chat page is accessible', async ({ page }) => {
  await page.goto('/chat');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```

## Migration v3 → v4

La migration sera progressive via feature flags :

1. **Dual render** : composants v3 et v4 coexistent
2. **Feature flag** : `ENABLE_V4_UI=true` dans le profil utilisateur
3. **Rollback** : flag désactivable sans déploiement
4. **Metrics** : A/B testing automatique (50/50) pendant 2 semaines
