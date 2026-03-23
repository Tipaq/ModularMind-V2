# Brief Projet — Phoenix (Refonte UI v4)

## Informations Générales

| Champ | Valeur |
|-------|--------|
| **Code projet** | PHOENIX |
| **Sponsor** | Marie Dupont (CPO) |
| **Chef de projet** | Lucas Martin (Lead Frontend) |
| **Date de lancement** | 2025-09-01 |
| **Date cible de livraison** | 2026-06-30 |
| **Budget** | 280 000 € |
| **Statut** | En cours — Phase 2/4 |

## Contexte

L'interface utilisateur actuelle de ModularMind (v3.x) a été développée en 2024 avec une stack React + Tailwind CSS. Bien qu'elle soit fonctionnelle, plusieurs retours utilisateurs et analyses UX ont identifié des points d'amélioration majeurs :

- **Complexité perçue** : 67% des nouveaux utilisateurs ne trouvent pas la fonctionnalité recherchée dans les 2 premières minutes
- **Performance** : le bundle principal pèse 2.1 MB, le Time-to-Interactive dépasse 4.5s sur mobile
- **Accessibilité** : score Lighthouse Accessibility de 72/100, non conforme WCAG 2.1 AA
- **Design system fragmenté** : composants dupliqués entre Chat et Ops, styles incohérents

## Objectifs

### Objectifs Primaires
1. **Réduire le Time-to-Value** : nouvel utilisateur productif en < 60 secondes
2. **Performance** : TTI < 2s sur 4G, bundle < 800 KB
3. **Accessibilité** : WCAG 2.1 AA (score Lighthouse > 95)
4. **Design system unifié** : bibliothèque partagée entre Chat, Ops et Platform

### Objectifs Secondaires
- Supporter le mode sombre nativement (actuellement ajouté en post)
- Préparer l'UI pour le mode mobile (Projet Orion)
- Réduire la dette technique frontend de 40%

## Périmètre

### In Scope
- Refonte complète de l'application Chat (pages, composants, navigation)
- Refonte du panneau d'administration Ops (dashboard, configuration agents)
- Création d'un design system unifié dans `packages/ui`
- Migration du système de thème vers des tokens CSS
- Nouvelle landing page pour Platform
- Tests E2E Playwright pour tous les parcours critiques

### Out of Scope
- Backend / API (aucun changement côté Engine)
- Application mobile (Projet Orion séparé)
- Refonte du Graph Studio (sera traité en Phase 4)

## Phases

### Phase 1 — Design System Foundation (2025-09-01 → 2025-11-30) ✅
- Audit des composants existants
- Définition des tokens de design (couleurs, typographie, espacement)
- Création de la bibliothèque `@modularmind/ui` avec shadcn/ui
- Migration du ThemeProvider avec support accent colors
- Documentation Storybook

### Phase 2 — Chat App Redesign (2025-12-01 → 2026-03-31) 🔄
- Refonte de la page de conversation
- Nouveau panneau latéral de navigation
- Composant de message redesigné (markdown, code blocks, streaming)
- Intégration du mode sombre natif
- Tests de performance

### Phase 3 — Ops App Redesign (2026-04-01 → 2026-05-31)
- Refonte du dashboard principal
- Pages de configuration agents/graphes
- Monitoring & analytics UI
- Knowledge base management UI

### Phase 4 — Polish & Launch (2026-06-01 → 2026-06-30)
- Graph Studio redesign
- Tests E2E complets
- Migration des utilisateurs existants
- Documentation utilisateur mise à jour
- Beta testing avec 50 utilisateurs

## Equipe

| Rôle | Nom | Allocation |
|------|-----|------------|
| Lead Frontend | Lucas Martin | 100% |
| Frontend Dev | Sophie Bernard | 100% |
| Frontend Dev | Antoine Lefèvre | 80% |
| UX Designer | Camille Rousseau | 60% |
| QA Engineer | Thomas Petit | 40% |
| Product Owner | Marie Dupont | 20% |

## Risques

| Risque | Impact | Probabilité | Mitigation |
|--------|--------|-------------|------------|
| Retard Phase 2 dû à la complexité du streaming SSE | Elevé | Moyen | POC technique validé en Phase 1 |
| Régression UX pour utilisateurs existants | Elevé | Faible | Beta testing progressif, feature flags |
| Dépendance avec Projet Orion pour le responsive | Moyen | Moyen | Design mobile-first indépendant d'Orion |
| Disponibilité de l'UX Designer (partagée) | Moyen | Elevé | Maquettes livrées avec 2 sprints d'avance |

## KPIs de Succès

| KPI | Baseline (v3) | Cible (v4) |
|-----|---------------|------------|
| Time-to-Interactive | 4.5s | < 2s |
| Bundle size | 2.1 MB | < 800 KB |
| Lighthouse Performance | 58 | > 90 |
| Lighthouse Accessibility | 72 | > 95 |
| Task completion (new user) | 33% en 2 min | > 80% en 2 min |
| NPS score | 32 | > 50 |
