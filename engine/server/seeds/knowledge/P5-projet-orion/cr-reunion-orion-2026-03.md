# Compte-Rendu — Réunion Kick-off Projet Orion

**Date :** 2026-03-01
**Participants :** Lucas Martin (Lead), Antoine Lefèvre, Camille Rousseau, Marie Dupont, Nicolas Durand, Thomas Petit
**Durée :** 2h00
**Rédacteur :** Lucas Martin

## Ordre du jour

1. Présentation du projet et objectifs
2. Choix de la stack technique
3. Planning Phase 0 (Discovery)
4. Organisation de l'équipe

## 1. Présentation du Projet

Marie a présenté le brief projet et les résultats du sondage utilisateurs Q4 2025 :

### Résultats Sondage (287 répondants)

- **78%** souhaitent une app mobile ModularMind
- **65%** utilisent leur smartphone pour des tâches professionnelles quotidiennement
- **Top 3 features demandées** : notifications push (89%), accès hors ligne (72%), biométrie (68%)
- **OS** : 55% iOS, 42% Android, 3% les deux
- **Usage principal** : consultation rapide des conversations (91%), envoi de messages courts (78%), consultation du knowledge base (45%)

### Competitive Analysis

| App | Points forts | Points faibles |
|-----|-------------|----------------|
| ChatGPT mobile | UX fluide, streaming rapide, voice mode | Pas de RAG, pas d'agents custom |
| Jasper mobile | Bonne intégration content marketing | UX basique, pas de conversations |
| Copilot mobile | Intégration Microsoft | Limité à l'écosystème MS |

**Différenciation ModularMind** : multi-agent, RAG intégré, mémoire persistante, graphes de workflow.

## 2. Choix de la Stack Technique

Lucas a présenté la comparaison React Native vs Flutter vs Natif :

### Résumé

Après discussion, l'équipe valide le choix **React Native + Expo** pour les raisons suivantes :

1. **Réutilisation** : 60-70% du code de logique métier est partageable avec le web
2. **Compétences** : l'équipe maîtrise React (Phoenix), pas besoin de former sur Dart ou Swift/Kotlin
3. **Design system** : `@modularmind/ui` peut être adapté pour React Native via `react-native-web`
4. **Expo** : simplifie énormément le build natif, les notifications push, et le déploiement (EAS)
5. **Coût** : 320K€ vs 550K€ pour du natif

### Préoccupations Levées

**Nicolas :** "Est-ce que le SSE streaming va fonctionner correctement sur React Native ?"
→ Lucas : oui, avec un polyfill `fetch` + `ReadableStream`. Spike prévu en Phase 0 pour valider.

**Thomas :** "Comment on teste sur les devices ?"
→ Lucas : Expo Go pour le dev, EAS Build pour les builds natifs. On aura un parc de 10 devices de test (5 iOS + 5 Android).

**Camille :** "Est-ce qu'on peut réutiliser les maquettes web ?"
→ Lucas : les composants oui (avec des adaptations), mais la navigation et les interactions doivent être repensées pour le mobile (gestes, bottom sheets, etc.).

## 3. Planning Phase 0 (Discovery)

### Durée : 1er avril → 30 avril 2026

| Semaine | Activité | Responsable |
|---------|----------|-------------|
| S1 | Setup Expo + structure projet + CI/CD EAS | Antoine |
| S1-S2 | Benchmark UX apps concurrentes + wireframes | Camille |
| S2 | Spike SSE streaming sur React Native | Lucas |
| S3 | Spike notifications push (Expo Notifications) | Antoine |
| S3-S4 | Maquettes Figma haute fidélité (login + conversations + chat) | Camille |
| S4 | Spike biométrie (expo-local-authentication) | Antoine |
| S4 | Revue architecture + validation des spikes | Equipe |

### Livrables Phase 0

- [ ] Projet Expo initialisé dans `apps/mobile/`
- [ ] Pipeline CI/CD (lint + test + EAS Build preview)
- [ ] POC SSE streaming fonctionnel (video démo)
- [ ] POC push notifications fonctionnel (video démo)
- [ ] POC biométrie fonctionnel (video démo)
- [ ] Maquettes Figma (10 écrans)
- [ ] Document d'architecture validé
- [ ] Backlog Phase 1 priorisé (40+ user stories)

## 4. Organisation de l'Equipe

### Recrutement

Marie confirme que **Emma Dubois** (développeuse React Native senior, 5 ans d'expérience) rejoindra l'équipe le 1er mai 2026. Son profil :
- Ex-Doctolib (app mobile patients)
- Expertise Expo, offline-first, push notifications
- Contribution open-source : `react-native-mmkv` et `expo-sqlite`

En attendant son arrivée, **Lucas et Antoine** démarrent Phase 0 en parallèle de leurs tâches Phoenix.

### Allocation Phase 0

| Nom | Projet Orion | Projet Phoenix | Autre |
|-----|-------------|----------------|-------|
| Lucas Martin | 30% | 60% | 10% |
| Antoine Lefèvre | 40% | 50% | 10% |
| Camille Rousseau | 40% | 50% | 10% |

### Rituels

- **Stand-up** : mardi et jeudi 9h30 (15 min, async Slack les autres jours)
- **Sprint review** : toutes les 2 semaines (aligné avec Phoenix)
- **Rétro** : fin de chaque phase

## Actions

| Action | Responsable | Deadline |
|--------|-------------|----------|
| Créer le projet Expo dans le monorepo | Antoine | 2026-04-03 |
| Commander les devices de test (5 iOS + 5 Android) | Thomas | 2026-04-07 |
| Configurer EAS Build + GitHub Actions | Antoine | 2026-04-07 |
| Finaliser le contrat Emma Dubois | Marie (HR) | 2026-03-15 |
| Préparer les specs fonctionnelles Phase 1 | Marie | 2026-04-21 |
| Planifier le spike SSE avec Nicolas (backend) | Lucas + Nicolas | 2026-04-10 |

## Prochaine Réunion

**Date :** 2026-04-15, 14h00
**Sujet :** Revue mid-Phase 0 — résultats des spikes
