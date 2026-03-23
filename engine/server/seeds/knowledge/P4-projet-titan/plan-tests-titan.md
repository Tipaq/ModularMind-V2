# Plan de Tests — Projet Titan

## Stratégie

Le projet Titan requiert des tests spécifiques pour la fiabilité du pipeline de données, la précision des agrégations, et la performance des requêtes analytics.

## 1. Tests du Pipeline de Données

### Tests d'Ingestion

| Test | Description | Status |
|------|-------------|--------|
| Event simple | Un event LLM est correctement inséré dans la hypertable | ⬜ |
| Event batch | 1000 events en batch insert < 100ms | ⬜ |
| Event malformé | Event sans champs requis → rejeté + log erreur | ⬜ |
| Deduplication | Même event envoyé 2 fois → 1 seul enregistrement | ⬜ |
| Backpressure | File Redis Stream > 10K → batch insert accéléré | ⬜ |
| Consumer restart | Worker crash → reprise sans perte (at-least-once) | ⬜ |

### Tests de Calcul de Coûts

| Test | Description |
|------|-------------|
| Coût GPT-4o | 1000 tokens input + 500 output = $0.0075 |
| Coût GPT-4o-mini | 1000 tokens input + 500 output = $0.00045 |
| Coût Ollama | Toujours $0.00 (self-hosted) |
| Modèle inconnu | Fallback → coût $0.00 + warning log |
| Mise à jour prix | Changement de prix → nouveaux events OK, anciens inchangés |

## 2. Tests des Continuous Aggregates

### Tests de Précision

| Test | Description |
|------|-------------|
| SUM tokens 1h | Somme horaire = somme des events de l'heure |
| AVG latency 1d | Moyenne journalière = moyenne pondérée des moyennes horaires |
| COUNT events 1w | Comptage hebdo = somme des 7 comptages journaliers |
| Percentile P99 | Percentile calculé sur les données brutes = ±5% de la valeur réelle |
| Refresh timing | Aggregate rafraîchi dans les 5 minutes après l'intervalle |

### Tests de Rétention

| Test | Description |
|------|-------------|
| Données brutes > 6 mois | Automatiquement supprimées |
| Compression > 7 jours | Chunks compressés, ratio > 5:1 |
| Agrégats horaires > 1 an | Supprimés |
| Agrégats journaliers > 2 ans | Supprimés |
| Agrégats mensuels | Jamais supprimés |

## 3. Tests de l'API Analytics

### Tests Fonctionnels

| Endpoint | Test | Expected |
|----------|------|----------|
| GET /analytics/metrics | Période 24h, granularité 1h | 24 data points |
| GET /analytics/metrics | Période 30j, granularité 1d | 30 data points |
| GET /analytics/metrics | Filtre agent_id | Seules les données de l'agent |
| GET /analytics/metrics | group_by=model | Résultats groupés par modèle |
| GET /analytics/cost-breakdown | Mois en cours | Répartition correcte |
| GET /analytics/cost-breakdown | Comparaison mois-1 | Variation % correcte |

### Tests de Performance

| Test | Seuil |
|------|-------|
| Requête dashboard (7j, hourly) | < 200ms |
| Requête cost breakdown (30j) | < 100ms (continuous agg) |
| Export CSV 100K rows | < 5s (streaming) |
| Requête avec 10 filtres combinés | < 500ms |

### Tests de Sécurité

| Test | Description |
|------|-------------|
| Tenant isolation | User A ne voit pas les données du tenant B |
| Admin override | Admin peut voir les données de tous les tenants |
| Rate limiting | Max 100 requêtes analytics/min par user |

## 4. Tests d'Export

### Tests PDF

| Test | Description |
|------|-------------|
| Génération usage report | PDF valide, 4-6 pages, < 500 KB |
| Génération cost report | Charts rendus correctement |
| Période vide | PDF avec message "Aucune donnée pour cette période" |
| Gros volume (100K events) | Génération < 30s |
| Template branding | Logo, couleurs, footer présents |

### Tests CSV

| Test | Description |
|------|-------------|
| Headers corrects | Première ligne = noms de colonnes |
| Encoding UTF-8 | Caractères spéciaux (accents) préservés |
| Streaming gros fichier | 1M rows, mémoire < 100 MB |
| Filtres appliqués | CSV contient uniquement les données filtrées |

### Tests Rapports Programmés

| Test | Description |
|------|-------------|
| Schedule CRON | Rapport généré à l'heure prévue |
| Email delivery | PDF attaché, sujet correct |
| Slack delivery | Lien de téléchargement fonctionnel |
| Schedule désactivé | Aucun rapport généré |
| Erreur de génération | Notification d'erreur envoyée |

## 5. Tests d'Anomaly Detection (Phase 3)

| Test | Description |
|------|-------------|
| Spike d'erreurs simulé | Alerte déclenchée en < 5 min |
| Coût anormal simulé | Alerte déclenchée en < 1h |
| False positive rate | < 5% sur données historiques |
| Model retraining | Pas de régression après retraining |

## Environnement de Test

| Composant | CI | Staging |
|-----------|-------|---------|
| TimescaleDB | Docker (timescaledb:latest-pg16) | Extension PG existant |
| Redis Streams | Docker (redis:7-alpine) | Redis Sentinel |
| Données | Fixtures générées (30j, 100K events) | Données réelles (anonymisées) |
