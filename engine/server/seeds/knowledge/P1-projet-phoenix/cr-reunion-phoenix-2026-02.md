# Compte-Rendu — Réunion Projet Phoenix

**Date :** 2026-02-14
**Participants :** Lucas Martin (Lead), Sophie Bernard, Antoine Lefèvre, Camille Rousseau, Marie Dupont
**Durée :** 1h30
**Rédacteur :** Lucas Martin

## Ordre du jour

1. Bilan Sprint 8 (Phase 2)
2. Démo composant MessageBubble v2
3. Problème de performance SSE sur longues conversations
4. Planning Sprint 9

## 1. Bilan Sprint 8

### Terminé
- **MessageBubble v2** : nouveau design avec support markdown amélioré, code blocks avec syntax highlighting (Shiki), et copy-to-clipboard. Score Lighthouse Accessibility : 98.
- **ConversationList** : refonte avec recherche instantanée, filtres par agent, et groupement par date. Lazy loading des conversations anciennes.
- **Dark mode** : 100% des composants Chat migrés vers les tokens CSS. Plus aucune couleur hardcodée.
- **Tests E2E** : 12 nouveaux tests Playwright pour les parcours Chat (création conversation, envoi message, streaming, recherche).

### En cours
- **InputBar v2** : widget d'upload fichier intégré (pour RAG inline). Antoine est à 70%, prévu pour Sprint 9.
- **Sidebar responsive** : maquettes validées par Camille, développement prévu Sprint 9.

### Bloqué
- **Performance SSE** : voir point 3.

## 2. Démo MessageBubble v2

Sophie a présenté le nouveau composant. Points saillants :

- Le rendering markdown utilise `react-markdown` avec des composants custom pour les code blocks
- Shiki est chargé en lazy (500 KB de grammaires) — pas d'impact sur le TTI initial
- Le streaming s'affiche token par token avec un curseur animé
- Les messages longs sont collapse par défaut (> 500 tokens) avec un "Voir plus"
- Le copy-to-clipboard fonctionne par bloc de code individuel

**Feedback Camille :** ajouter une animation de "typing" plus naturelle (variation de vitesse). Sophie va itérer.

**Feedback Marie :** le bouton "Régénérer" doit être plus visible. Proposition : le placer en bas du message plutôt que dans le menu "...".

**Action :** Sophie intègre les retours dans Sprint 9.

## 3. Problème de Performance SSE

### Constat

Lucas a identifié un problème de performance sur les conversations longues (> 100 messages). Le re-render React à chaque token SSE cause des jank visibles :

- **< 50 messages** : fluide, 0 dropped frames
- **50-100 messages** : léger lag, ~5% dropped frames
- **> 100 messages** : lag notable, ~20% dropped frames, scroll saccadé

### Analyse

Le problème vient de la structure du state Zustand : chaque token SSE met à jour un message dans un array, ce qui trigger un re-render de toute la liste.

### Solutions Proposées

| Solution | Effort | Impact |
|----------|--------|--------|
| Virtualisation (react-window) | 2 jours | Résout le rendering mais complexifie le scroll |
| Mémoisation agressive (React.memo + useMemo) | 1 jour | Réduit de ~50% mais ne résout pas totalement |
| Store séparé pour le message en cours de streaming | 0.5 jour | Isole le re-render au seul message actif |
| Combinaison store séparé + react-window | 3 jours | Solution complète |

### Décision

On part sur la **combinaison store séparé + react-window** (option 4). Lucas prend le lead, Antoine assiste.

**Priorité :** haute — c'est un bloquant pour la démo client prévue le 28 février.

## 4. Planning Sprint 9 (2026-02-17 → 2026-02-28)

| Tâche | Assigné | Points |
|-------|---------|--------|
| Fix performance SSE (store séparé + virtualisation) | Lucas + Antoine | 8 |
| InputBar v2 (upload fichier) | Antoine | 5 |
| Sidebar responsive | Sophie | 5 |
| Intégration retours MessageBubble | Sophie | 3 |
| Maquettes Phase 3 (Ops dashboard) | Camille | 5 |
| Tests E2E nouvelles fonctionnalités | Thomas | 3 |

**Vélocité Sprint 8 :** 26 points
**Capacité Sprint 9 :** 29 points

## Actions

| Action | Responsable | Deadline |
|--------|-------------|----------|
| POC react-window + store séparé | Lucas | 2026-02-19 |
| Maquettes InputBar upload | Camille | 2026-02-18 |
| Mettre à jour la doc architecture frontend | Sophie | 2026-02-21 |
| Préparer démo client | Marie + Lucas | 2026-02-27 |

## Prochaine Réunion

**Date :** 2026-02-28, 14h00
**Sujet :** Démo client + rétrospective Sprint 9
