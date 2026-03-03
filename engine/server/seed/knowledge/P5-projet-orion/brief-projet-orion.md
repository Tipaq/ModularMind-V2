# Brief Projet — Orion (Application Mobile)

## Informations Générales

| Champ | Valeur |
|-------|--------|
| **Code projet** | ORION |
| **Sponsor** | Marie Dupont (CPO) |
| **Chef de projet** | Lucas Martin (Lead Frontend) |
| **Date de lancement** | 2026-04-01 |
| **Date cible de livraison** | 2026-12-31 |
| **Budget** | 320 000 € |
| **Statut** | Kick-off — Phase 0 (Discovery) |

## Contexte

ModularMind est actuellement accessible uniquement via navigateur web (desktop et mobile web). Bien que l'application Chat soit responsive, l'expérience mobile présente des limitations :

- **Pas de notifications push** : les utilisateurs ne sont pas notifiés des réponses de l'agent
- **Pas d'accès hors ligne** : impossible de consulter l'historique sans connexion
- **Performance mobile** : le SPA React charge 800 KB+ sur des réseaux lents
- **Pas de biométrie** : pas d'authentification par empreinte ou Face ID
- **Demande client** : 78% des utilisateurs enterprise souhaitent une app mobile (sondage Q4 2025)

## Objectifs

1. **Application mobile native** (iOS + Android) pour les conversations
2. **Notifications push** : alertes temps réel pour les réponses d'agents
3. **Mode hors ligne** : consultation de l'historique, brouillons de messages
4. **Auth biométrique** : Face ID / Touch ID / empreinte Android
5. **Performance** : TTI < 1.5s, app size < 30 MB

## Stack Technique

Après analyse comparative (voir ADR-orion-001), l'équipe recommande **React Native** avec **Expo** :

| Critère | React Native + Expo | Flutter | Natif (Swift/Kotlin) |
|---------|--------------------:|--------:|--------------------:|
| Réutilisation code web | 60-70% | 0% | 0% |
| Courbe d'apprentissage | Faible (équipe React) | Moyenne | Elevée |
| Composants partagés (@modularmind/ui) | Via react-native-web | Non | Non |
| Délai de livraison | 6-8 mois | 8-10 mois | 12-14 mois |
| Equipe nécessaire | 2 devs | 2 devs | 4 devs (2 iOS + 2 Android) |
| Performance native | 90% du natif | 95% du natif | 100% |
| Coût estimé | 320K€ | 380K€ | 550K€ |

**Décision : React Native + Expo** — réutilisation maximale de l'expertise React de l'équipe Phoenix, partage de composants via `@modularmind/ui`, et délai de livraison compétitif.

## Périmètre

### In Scope (v1.0)
- Ecran de connexion (email/password + biométrie)
- Liste des conversations avec recherche
- Vue conversation avec streaming SSE
- Envoi de messages texte
- Notifications push (réponses d'agents)
- Mode hors ligne (lecture historique)
- Thème clair/sombre (synchro avec l'app web)
- Support iOS 16+ et Android 12+

### Out of Scope (v1.0)
- Upload de fichiers (prévu v1.1)
- RAG search intégré (prévu v1.1)
- Console d'administration (reste web-only)
- Graph Studio (reste web-only)
- Widgets iOS/Android
- Apple Watch / Wear OS

## Phases

### Phase 0 — Discovery (2026-04-01 → 2026-04-30)
- Benchmark apps concurrentes (ChatGPT mobile, Jasper, etc.)
- Design UX mobile (wireframes → maquettes Figma)
- Setup technique (Expo, CI/CD EAS Build, TestFlight/Play Console)
- Spike : SSE streaming sur React Native
- Spike : notifications push (FCM + APNs via Expo)

### Phase 1 — Core Features (2026-05-01 → 2026-08-31)
- Auth (email/password + biométrie)
- Liste conversations
- Vue conversation + streaming
- Envoi messages
- Navigation (stack navigator)
- Offline mode (SQLite local)

### Phase 2 — Push + Polish (2026-09-01 → 2026-11-30)
- Notifications push
- Thème clair/sombre
- Animations et transitions
- Optimisation performance
- Tests sur devices réels (10+ devices)

### Phase 3 — Launch (2026-12-01 → 2026-12-31)
- Beta testing (100 utilisateurs)
- Soumission App Store + Google Play
- Documentation utilisateur
- Plan de communication lancement

## Architecture Mobile

```
┌──────────────────────────────────────┐
│         React Native (Expo)          │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  Navigation (React Navigation) │  │
│  ├────────────────────────────────┤  │
│  │  Screens                       │  │
│  │  ├── LoginScreen               │  │
│  │  ├── ConversationsScreen       │  │
│  │  ├── ChatScreen                │  │
│  │  └── SettingsScreen            │  │
│  ├────────────────────────────────┤  │
│  │  State (Zustand + MMKV)        │  │
│  │  ├── auth store                │  │
│  │  ├── conversations store       │  │
│  │  └── settings store            │  │
│  ├────────────────────────────────┤  │
│  │  Services                      │  │
│  │  ├── API client (shared)       │  │
│  │  ├── SSE streaming             │  │
│  │  ├── Push notifications        │  │
│  │  └── Offline sync (SQLite)     │  │
│  └────────────────────────────────┘  │
│                                      │
│  @modularmind/ui (shared components) │
│  @modularmind/api-client (shared)    │
└──────────────────────────────────────┘
        │
        ↓ HTTPS
        │
   API Gateway (Kong) → Engine (FastAPI)
```

## Equipe

| Rôle | Nom | Allocation | Période |
|------|-----|------------|---------|
| Lead Frontend / Mobile | Lucas Martin | 40% | Phase 0-3 |
| Mobile Dev (React Native) | Emma Dubois (recrutement) | 100% | Phase 1-3 |
| Mobile Dev (React Native) | Antoine Lefèvre | 60% | Phase 1-3 |
| UX Designer | Camille Rousseau | 40% | Phase 0-1 |
| QA Engineer | Thomas Petit | 30% | Phase 2-3 |
| Backend (push notif) | Nicolas Durand | 20% | Phase 2 |

**Note :** un recrutement est prévu (Emma Dubois, développeuse React Native senior, entretien finalisé, start date : 1er mai 2026).

## Risques

| Risque | Impact | Probabilité | Mitigation |
|--------|--------|-------------|------------|
| SSE streaming instable sur mobile | Elevé | Moyen | Spike technique en Phase 0 + fallback polling |
| Review App Store longue (> 2 semaines) | Moyen | Moyen | Soumettre early avec TestFlight beta |
| Recrutement Emma Dubois échoue | Elevé | Faible | Plan B : freelance React Native |
| Performance sur Android bas de gamme | Moyen | Moyen | Tests sur Redmi Note 10 (device cible bas) |
| Concurrence chat mobile déjà mature | Moyen | Elevé | Différenciation : multi-agent, RAG, memory |

## KPIs de Succès

| KPI | Cible v1.0 |
|-----|------------|
| App Store rating | > 4.5 ★ |
| Crash-free rate | > 99.5% |
| DAU / MAU ratio | > 40% |
| Time to first message | < 10 secondes |
| Push notification opt-in | > 70% |
| App size | < 30 MB |
| TTI (cold start) | < 1.5s |

## Dépendances

| Projet | Dépendance | Impact |
|--------|-----------|--------|
| Phoenix | Design system `@modularmind/ui` adapté mobile | Bloquant Phase 1 |
| Mercury | API Gateway + API keys pour auth mobile | Non-bloquant (cookie auth en fallback) |
| Atlas | Push notification infra (FCM relay sur K8s) | Bloquant Phase 2 |
