# Brief Projet — Titan (Analytics & Reporting Avancé)

## Informations Générales

| Champ | Valeur |
|-------|--------|
| **Code projet** | TITAN |
| **Sponsor** | Marie Dupont (CPO) |
| **Chef de projet** | Fatima El Amrani (Lead Data) |
| **Date de lancement** | 2026-02-01 |
| **Date cible de livraison** | 2026-09-30 |
| **Budget** | 180 000 € |
| **Statut** | En cours — Phase 1/3 |

## Contexte

ModularMind dispose de données riches (conversations, exécutions, mémoires, documents RAG) mais offre actuellement un monitoring limité :

- **Dashboard Ops basique** : quelques compteurs et graphes temps réel
- **Pas d'analytics historique** : impossible de voir les tendances sur 30/90 jours
- **Pas d'export** : les clients enterprise demandent des rapports PDF/CSV
- **Pas d'insights IA** : aucune analyse automatique des patterns d'usage
- **Métriques LLM limitées** : tokens comptés mais pas de cost tracking

## Objectifs

1. **Dashboard analytics avancé** avec widgets configurables et timeframes
2. **Cost tracking** : suivi des coûts LLM par agent, modèle, et tenant
3. **Quality metrics** : scoring automatique des réponses (pertinence, satisfaction)
4. **Export & reporting** : rapports PDF/CSV programmables (daily, weekly, monthly)
5. **Insights IA** : détection automatique d'anomalies et recommandations

## Architecture

```
                ┌──────────────────────────────────────────┐
                │            Analytics Pipeline             │
                │                                          │
Engine ──logs──→ │  Collector → Aggregator → TimescaleDB   │
                │                              │            │
                │              ┌────────────────┘            │
                │              ↓                             │
                │  Dashboard API ← Platform (UI)            │
                │              │                             │
                │  Exporter ──→ PDF/CSV/S3                  │
                │              │                             │
                │  Anomaly Detector ──→ Alerts              │
                └──────────────────────────────────────────┘
```

### Stack Analytics

| Composant | Technologie | Justification |
|-----------|------------|---------------|
| Time-series DB | TimescaleDB (extension PG) | Réutilise PostgreSQL, hypertables pour les métriques |
| Aggregation | Continuous aggregates (TimescaleDB) | Pré-calcul automatique des agrégats |
| Dashboard | Recharts (frontend) | Déjà utilisé dans Ops, léger |
| Export PDF | WeasyPrint | Python natif, templates HTML → PDF |
| Export CSV | csv stdlib | Standard, streaming pour gros volumes |
| Anomaly detection | IsolationForest (scikit-learn) | Léger, pas de dépendance GPU |

## Phases

### Phase 1 — Data Pipeline + Cost Tracking (2026-02-01 → 2026-04-30) 🔄
- Extension TimescaleDB sur PostgreSQL existant
- Hypertables pour les métriques (conversations, tokens, latence, erreurs)
- Continuous aggregates (1h, 1d, 1w, 1m)
- API endpoint `/analytics/metrics` avec filtres temporels
- Cost tracking par provider/modèle (lookup table de prix)
- Dashboard widget "Coûts LLM" dans Ops

### Phase 2 — Quality Metrics + Dashboard (2026-05-01 → 2026-07-31)
- Scoring automatique des réponses (LLM-as-judge)
- Métriques de satisfaction (thumbs up/down, feedback)
- Dashboard analytics complet (10+ widgets configurables)
- Comparaison de périodes (ce mois vs le mois dernier)
- Filtres avancés (agent, modèle, user group, date range)

### Phase 3 — Export + Insights (2026-08-01 → 2026-09-30)
- Rapports PDF (template branded ModularMind)
- Export CSV streaming (gros volumes)
- Rapports programmables (cron)
- Détection d'anomalies (IsolationForest)
- Recommandations automatiques (ex: "L'agent X a 30% d'erreurs, envisagez de changer de modèle")

## Métriques Collectées

### Conversations & Messages

| Métrique | Granularité | Rétention |
|----------|-------------|-----------|
| `conversations_created` | 1 min | 1 an |
| `messages_sent` | 1 min | 1 an |
| `messages_by_channel` | 1 min | 1 an |
| `avg_messages_per_conversation` | 1 heure | 1 an |
| `avg_conversation_duration` | 1 heure | 1 an |

### LLM & Tokens

| Métrique | Granularité | Rétention |
|----------|-------------|-----------|
| `tokens_input` | 1 min | 1 an |
| `tokens_output` | 1 min | 1 an |
| `tokens_cost_usd` | 1 min | 2 ans |
| `llm_latency_ms` | 1 min | 6 mois |
| `llm_errors` | 1 min | 1 an |
| `llm_fallbacks` | 1 min | 1 an |

### RAG & Memory

| Métrique | Granularité | Rétention |
|----------|-------------|-----------|
| `rag_searches` | 1 min | 1 an |
| `rag_avg_score` | 1 heure | 1 an |
| `documents_processed` | 1 heure | 1 an |
| `memories_created` | 1 heure | 1 an |
| `memories_recalled` | 1 heure | 1 an |

### Qualité (Phase 2)

| Métrique | Granularité | Rétention |
|----------|-------------|-----------|
| `response_quality_score` | par message | 1 an |
| `user_satisfaction` | par conversation | 2 ans |
| `thumbs_up_ratio` | 1 heure | 1 an |
| `escalation_rate` | 1 jour | 2 ans |

## Cost Tracking

### Table de Prix LLM

```python
LLM_PRICING = {
    "gpt-4o": {"input": 2.50, "output": 10.00},        # per 1M tokens
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "claude-3-5-sonnet": {"input": 3.00, "output": 15.00},
    "claude-3-haiku": {"input": 0.25, "output": 1.25},
    "ollama/*": {"input": 0.00, "output": 0.00},         # Self-hosted
}
```

### Dashboard Cost Widget

```
┌─────────────────────────────────────────┐
│  Coûts LLM — Mars 2026                  │
│                                          │
│  Total: $1,247.50  (+12% vs Fév)        │
│                                          │
│  Par modèle:                             │
│  ██████████████ gpt-4o        $890.00    │
│  ████████       gpt-4o-mini   $245.50    │
│  ████           claude-sonnet $112.00    │
│  ▓              ollama         $0.00     │
│                                          │
│  Par agent:                              │
│  ██████████████ Support Bot   $520.00    │
│  ████████       Sales Bot     $380.00    │
│  ██████         Tech Bot      $347.50    │
└─────────────────────────────────────────┘
```

## Equipe

| Rôle | Nom | Allocation |
|------|-----|------------|
| Lead Data | Fatima El Amrani | 80% |
| Backend Dev | Karim Hadj | 60% |
| Frontend Dev | Antoine Lefèvre | 40% |
| Data Analyst | Léa Dumont | 100% |
| Product Owner | Marie Dupont | 15% |

## Risques

| Risque | Impact | Probabilité | Mitigation |
|--------|--------|-------------|------------|
| Volume de données élevé (> 100M rows/mois) | Moyen | Moyen | TimescaleDB compression + rétention automatique |
| Coût TimescaleDB license | Faible | Faible | Version community suffisante |
| Précision du scoring LLM-as-judge | Moyen | Elevé | Validation humaine sur 500 samples |
| Performance dashboard (requêtes lourdes) | Elevé | Moyen | Continuous aggregates pré-calculés |
