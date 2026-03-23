# Standards d'accessibilité (a11y) — ModularMind

## Niveau de conformité

ModularMind vise la conformité **WCAG 2.1 niveau AA** pour toutes les interfaces utilisateur.

## Règles obligatoires

### Navigation au clavier

Tous les éléments interactifs doivent être accessibles au clavier :
- `Tab` pour naviguer entre les éléments
- `Enter` / `Space` pour activer les boutons et liens
- `Escape` pour fermer les modals et popovers
- `Arrow keys` pour naviguer dans les listes et menus
- Indicateur de focus visible (ring) sur tous les éléments focusables

```tsx
// Correct — focus visible ring (via Tailwind)
<Button className="focus-visible:ring-2 focus-visible:ring-ring">
  Action
</Button>

// Le ring est défini globalement dans theme.css, pas besoin de le répéter
// sauf pour les éléments custom
```

### Contraste des couleurs

| Élément | Ratio minimum | Outil de vérification |
|---------|---------------|----------------------|
| Texte normal (< 18px) | 4.5:1 | axe DevTools |
| Texte large (≥ 18px ou bold ≥ 14px) | 3:1 | axe DevTools |
| Éléments UI non-texte | 3:1 | axe DevTools |

Nos tokens de couleur sémantiques sont conçus pour respecter ces ratios en mode clair et sombre.

### Attributs ARIA

```tsx
// Bouton avec icône seule — DOIT avoir un label
<Button aria-label="Fermer la conversation" onClick={onClose}>
  <X className="h-4 w-4" />
</Button>

// Zone de chargement
<div aria-busy={isLoading} aria-live="polite">
  {isLoading ? <Spinner /> : <Content />}
</div>

// Liste de conversations
<nav aria-label="Liste des conversations">
  <ul role="list">
    {conversations.map(conv => (
      <li key={conv.id} role="listitem">
        <a href={`/chat/${conv.id}`} aria-current={isActive ? "page" : undefined}>
          {conv.title}
        </a>
      </li>
    ))}
  </ul>
</nav>
```

### Labels de formulaire

```tsx
// Correct — label associé au champ
<Label htmlFor="system-prompt">Prompt système</Label>
<Textarea
  id="system-prompt"
  aria-describedby="prompt-help"
  placeholder="Décrivez le comportement de l'agent..."
/>
<p id="prompt-help" className="text-sm text-muted-foreground">
  Ce prompt définit la personnalité et les contraintes de l'agent.
</p>

// Incorrect — pas de label
<Textarea placeholder="Prompt système" />
```

### Lecteur d'écran

- Utiliser les balises sémantiques HTML5 (`nav`, `main`, `aside`, `header`, `footer`)
- Les messages du chat doivent avoir `role="log"` et `aria-live="polite"`
- Les notifications toast doivent avoir `role="alert"` et `aria-live="assertive"`
- Les images doivent avoir un attribut `alt` descriptif (ou `alt=""` si décoratif)

## Outils de test

| Outil | Usage |
|-------|-------|
| axe DevTools (extension navigateur) | Audit automatique de la page |
| Lighthouse (Chrome DevTools) | Score a11y global |
| NVDA / VoiceOver | Test avec lecteur d'écran |
| Keyboard-only navigation | Test manuel sans souris |

## Checklist pré-release

- [ ] Score Lighthouse a11y ≥ 90
- [ ] Navigation au clavier fonctionnelle sur toutes les pages
- [ ] Pas d'erreurs axe DevTools (niveau AA)
- [ ] Contraste vérifié en mode clair ET sombre
- [ ] Labels sur tous les champs de formulaire
- [ ] Aria-labels sur tous les boutons icône
- [ ] Testé avec VoiceOver (Mac) ou NVDA (Windows)