# Compte-Rendu — Réunion Projet Titan

**Date :** 2026-02-27
**Participants :** Fatima El Amrani (Lead), Karim Hadj, Léa Dumont, Marie Dupont, Antoine Lefèvre
**Durée :** 1h15
**Rédacteur :** Fatima El Amrani

## Ordre du jour

1. Avancement Sprint 2 (Phase 1)
2. POC TimescaleDB — résultats
3. Design du dashboard cost tracking
4. Planning Sprint 3

## 1. Avancement Sprint 2

### Terminé
- **Extension TimescaleDB** installée sur le PostgreSQL de staging. Aucun impact sur les requêtes existantes — c'est une extension, pas un remplacement.
- **Hypertable `analytics_events`** créée avec partitionnement par jour. Tests d'insertion : 50K events/sec en batch mode.
- **Continuous aggregates** : `metrics_hourly` et `metrics_daily` configurés et testés. Rafraîchissement automatique fonctionnel.
- **Retention + compression** : policy de compression après 7j (ratio 10:1 observé), retention 6 mois sur les données brutes.

### En cours
- **Analytics collector** (worker consumer) : Karim implémente le consumer Redis Stream. Batch insert toutes les 10 secondes ou 1000 events. ETA : Sprint 3.
- **LLM cost lookup table** : Léa compile les prix par provider/modèle. 12 modèles référencés.
- **API `/analytics/metrics`** : Fatima est à 60%. Les filtres temporels fonctionnent, reste les group_by.

## 2. POC TimescaleDB — Résultats

Fatima a présenté les résultats du POC TimescaleDB réalisé avec des données simulées (30 jours, 10M events) :

### Performance des Requêtes

| Requête | Sans TimescaleDB | Avec TimescaleDB | Gain |
|---------|-----------------|------------------|------|
| COUNT events 24h | 1.2s | 45ms | 26x |
| AVG latency par heure (7j) | 3.8s | 120ms | 31x |
| SUM cost par modèle (30j) | 8.5s | 85ms (continuous agg) | 100x |
| Percentile P99 latency (24h) | 5.2s | 200ms | 26x |
| Full scan 30j | 45s | 2.1s | 21x |

### Stockage

| Configuration | Taille 30j (10M events) |
|---------------|------------------------|
| PostgreSQL standard | 4.2 GB |
| TimescaleDB (non compressé) | 4.2 GB |
| TimescaleDB (compressé 7j+) | 1.1 GB |
| Continuous aggregates | +120 MB |

**Conclusion** : TimescaleDB est clairement le bon choix. Les continuous aggregates pré-calculent les données ce qui rend le dashboard instantané.

### Risque Identifié

La version community de TimescaleDB ne supporte pas les continuous aggregates hiérarchiques (cascade hourly → daily). On doit créer les aggregates directement depuis la hypertable source, ce qui consomme plus de CPU lors du rafraîchissement.

**Mitigation** : planifier les rafraîchissements en heures creuses (2h-5h du matin).

## 3. Design Dashboard Cost Tracking

Marie et Antoine ont présenté les maquettes du widget cost tracking pour le dashboard Ops.

### Widgets Proposés

1. **Cost Overview Card** : total du mois, variation vs mois précédent, projection fin de mois
2. **Cost by Model (bar chart)** : répartition par modèle LLM, triée par coût
3. **Cost Trend (line chart)** : courbe des coûts quotidiens sur 30j avec comparaison mois-1
4. **Cost by Agent (table)** : tableau triable avec agent, modèle, tokens, coût, % du total
5. **Budget Alert** : indicateur visuel si le coût projeté dépasse un seuil configurable

### Feedback

- **Fatima** : les widgets sont bien pensés. Attention à la performance — les requêtes doivent utiliser les continuous aggregates, pas les données brutes.
- **Karim** : proposer un drill-down depuis le bar chart (clic sur un modèle → détail par agent).
- **Marie** : ajouter la possibilité de configurer un budget mensuel par tenant et recevoir une alerte à 80% et 100%.

### Décision

Les 5 widgets sont validés. Antoine commence l'implémentation en Sprint 3 avec Recharts. Le budget alert sera un stretch goal.

## 4. Planning Sprint 3 (2026-03-03 → 2026-03-14)

| Tâche | Assigné | Points |
|-------|---------|--------|
| Analytics collector (worker consumer) | Karim | 8 |
| LLM callback integration dans l'Engine | Karim | 5 |
| API `/analytics/metrics` (group_by + pagination) | Fatima | 5 |
| API `/analytics/cost-breakdown` | Fatima | 3 |
| Widget Cost Overview Card | Antoine | 3 |
| Widget Cost by Model (Recharts bar chart) | Antoine | 5 |
| Compléter la table de prix LLM (12 modèles) | Léa | 2 |
| Tests d'intégration pipeline complet | Léa | 5 |

**Vélocité Sprint 2 :** 28 points
**Capacité Sprint 3 :** 36 points

## Actions

| Action | Responsable | Deadline |
|--------|-------------|----------|
| Déployer TimescaleDB sur staging | Fatima | 2026-03-04 |
| Documenter le schema analytics_events | Léa | 2026-03-05 |
| Intégrer le LLM callback dans l'Engine | Karim + Nicolas (Mercury) | 2026-03-07 |
| Préparer les maquettes des 3 widgets restants | Antoine + Camille (Phoenix) | 2026-03-14 |

## Prochaine Réunion

**Date :** 2026-03-13, 14h30
**Sujet :** Démo pipeline + premier widget
