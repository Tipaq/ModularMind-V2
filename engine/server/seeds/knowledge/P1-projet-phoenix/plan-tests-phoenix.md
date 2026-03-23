# Plan de Tests — Projet Phoenix

## Stratégie de Test

Le projet Phoenix adopte une pyramide de tests classique avec un focus sur les tests E2E Playwright pour valider les parcours utilisateur critiques.

```
        ╱ E2E (Playwright) ╲         ~30 tests
       ╱  Integration (Vitest) ╲      ~80 tests
      ╱   Unit (Vitest)          ╲    ~200 tests
```

## 1. Tests Unitaires (Vitest)

### Couverture Cible : 80%

| Module | Fichiers | Tests | Status |
|--------|----------|-------|--------|
| Design tokens parser | 3 | 15 | ✅ Done |
| ThemeProvider logic | 2 | 12 | ✅ Done |
| Zustand stores (auth, chat) | 4 | 25 | ✅ Done |
| Message formatting (markdown) | 3 | 20 | ✅ Done |
| SSE parser / reconnection | 2 | 18 | ✅ Done |
| Search & filter logic | 3 | 15 | 🔄 In Progress |
| Form validation schemas | 5 | 22 | 🔄 In Progress |
| API client interceptors | 2 | 10 | ⬜ Planned |
| Date/time utilities | 1 | 8 | ⬜ Planned |
| Accessibility helpers | 2 | 12 | ⬜ Planned |

### Conventions

```typescript
// Nommage: [module].test.ts
// Structure: describe > it > expect
describe('ThemeProvider', () => {
  it('should default to system mode', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.mode).toBe('system');
  });

  it('should persist accent color to localStorage', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setAccentColor(220, 80));
    expect(localStorage.getItem('mm-theme-accent-h')).toBe('220');
  });
});
```

## 2. Tests d'Intégration (Vitest + Testing Library)

### Couverture Cible : 60%

| Composant | Tests | Status |
|-----------|-------|--------|
| MessageBubble (rendering markdown, code, streaming) | 15 | ✅ Done |
| ConversationList (filtres, recherche, pagination) | 10 | ✅ Done |
| InputBar (envoi, upload, raccourcis clavier) | 12 | 🔄 In Progress |
| Sidebar (navigation, responsive, collapse) | 8 | ⬜ Planned |
| AgentConfigForm (validation, preview) | 10 | ⬜ Planned |
| KnowledgeManager (upload, progress, status) | 8 | ⬜ Planned |
| Dashboard (stat cards, charts, refresh) | 6 | ⬜ Planned |

### Pattern

```typescript
describe('MessageBubble', () => {
  it('should render markdown with syntax highlighting', async () => {
    render(<MessageBubble content="```python\nprint('hello')\n```" />);
    await waitFor(() => {
      expect(screen.getByRole('code')).toBeInTheDocument();
      expect(screen.getByText('hello')).toHaveClass('shiki');
    });
  });

  it('should be keyboard accessible', () => {
    render(<MessageBubble content="Hello" />);
    const bubble = screen.getByRole('article');
    bubble.focus();
    fireEvent.keyDown(bubble, { key: 'Enter' });
    expect(screen.getByRole('button', { name: /copy/i })).toBeVisible();
  });
});
```

## 3. Tests E2E (Playwright)

### Parcours Critiques

| # | Parcours | Priorité | Status |
|---|----------|----------|--------|
| E01 | Créer une conversation et envoyer un message | P0 | ✅ Done |
| E02 | Recevoir une réponse streaming complète | P0 | ✅ Done |
| E03 | Rechercher dans les conversations | P0 | ✅ Done |
| E04 | Basculer entre mode clair et sombre | P1 | ✅ Done |
| E05 | Upload un fichier dans une conversation (RAG) | P0 | 🔄 In Progress |
| E06 | Naviguer sidebar sur mobile (responsive) | P1 | ⬜ Planned |
| E07 | Configurer un agent (Ops) | P0 | ⬜ Planned |
| E08 | Parcours complet Knowledge Base (upload → search) | P0 | ⬜ Planned |
| E09 | Dashboard Ops — vérifier les stats | P1 | ⬜ Planned |
| E10 | Accessibilité — navigation clavier complète | P0 | ⬜ Planned |

### Configuration Playwright

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:5173',
    storageState: './e2e/auth-state.json',  // Session pré-authentifiée
  },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'mobile', use: devices['Pixel 5'] },
    { name: 'dark-mode', use: { colorScheme: 'dark', ...devices['Desktop Chrome'] } },
  ],
});
```

## 4. Tests de Performance

| Test | Outil | Seuil | Fréquence |
|------|-------|-------|-----------|
| Lighthouse CI | @lhci/cli | Performance > 90 | Chaque PR |
| Bundle size | bundlesize | < 250 KB (initial) | Chaque PR |
| Core Web Vitals | web-vitals | LCP < 2.5s, CLS < 0.1 | Hebdomadaire |
| Stress test SSE (200 messages) | Script custom | < 5% dropped frames | Par sprint |

## 5. Tests d'Accessibilité

| Test | Outil | Seuil |
|------|-------|-------|
| Automated axe scan | @axe-core/playwright | 0 violations |
| Contrast ratio | axe-core | WCAG AA (4.5:1) |
| Keyboard navigation | Manuel + Playwright | Tous éléments focusables |
| Screen reader | NVDA (Windows) | Lecture cohérente |

## Environnements de Test

| Environnement | URL | Données |
|---------------|-----|---------|
| Local | localhost:5173 | Mock API (MSW) |
| CI | GitHub Actions | Mock API |
| Staging | staging.modularmind.io | Données de test |
| Pre-prod | preprod.modularmind.io | Copie anonymisée prod |

## Critères d'Acceptance

Un composant est considéré "done" quand :

1. ✅ Tests unitaires passent (couverture > 80%)
2. ✅ Tests d'intégration passent
3. ✅ Aucune violation axe-core
4. ✅ Navigation clavier fonctionnelle
5. ✅ Responsive (mobile + desktop)
6. ✅ Mode clair et sombre validés
7. ✅ Review code approuvée par 1 dev + 1 QA
