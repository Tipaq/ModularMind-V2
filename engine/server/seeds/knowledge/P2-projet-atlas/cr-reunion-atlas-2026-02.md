# Compte-Rendu — Réunion Projet Atlas

**Date :** 2026-02-20
**Participants :** Julien Morel (Lead), Pierre Girard, Nicolas Durand, Aisha Benali, Maxime Faure
**Durée :** 2h00
**Rédacteur :** Julien Morel

## Ordre du jour

1. Bilan Phase 2 — semaines 5-8
2. Résultats tests de charge staging K8s
3. Problème GPU scheduling pour Ollama
4. Planning migration production

## 1. Bilan Phase 2

### Terminé
- **Redis Sentinel** : cluster 3 nœuds déployé et testé. Failover automatique en < 5s. Monitoring Prometheus intégré.
- **Qdrant cluster** : 3 nœuds avec réplication factor 2. Benchmark : latence de recherche P99 = 45ms (vs 38ms en standalone — overhead acceptable).
- **HPA Engine** : configuré et testé. Scale-up de 2 → 8 pods en 90 secondes sous charge. Scale-down progressif en 5 minutes.
- **Network policies** : isolation complète entre namespaces. Seuls les pods Engine/Worker accèdent à mm-infra.
- **Monitoring** : Prometheus + Grafana déployés dans mm-monitoring. Dashboards pour Engine, PostgreSQL, Redis, Qdrant. Alerting via PagerDuty.

### En cours
- **Tests de charge** : voir point 2
- **GPU node pool** : voir point 3
- **Canary deployment strategy** : Pierre est à 60%, Argo Rollouts configuré

### Bloqué
- **Ollama GPU scheduling** : voir point 3

## 2. Tests de Charge Staging K8s

Maxime a présenté les résultats des tests de charge réalisés avec k6 :

### Configuration
- **Cluster** : 3 nœuds app (b2-30), 3 nœuds data (b2-30)
- **Engine** : 2 pods (min) → 10 pods (max via HPA)
- **Scénario** : montée progressive 0 → 500 utilisateurs concurrents sur 10 minutes

### Résultats

| Métrique | Baseline (Docker Compose) | K8s Staging | Variation |
|----------|--------------------------|-------------|-----------|
| Throughput max | 280 req/s | 1,200 req/s | +328% |
| Latence P50 | 45ms | 52ms | +15% |
| Latence P99 | 320ms | 180ms | -44% |
| Error rate (sous charge) | 2.3% | 0.1% | -96% |
| Temps de recovery (pod crash) | Manuel (~5min) | 15s (auto) | -95% |

### Observations

1. **La latence P50 est légèrement plus élevée** à cause du network hop pod-to-pod (vs localhost en Docker Compose). L'overhead est de 7ms en moyenne — jugé acceptable.
2. **La latence P99 est nettement meilleure** grâce au load balancing entre pods. Plus de "hot spot" sur un seul container.
3. **Le HPA réagit bien** : scale-up déclenché à 70% CPU, pods opérationnels en ~60s (image pull + readiness probe).
4. **Zero erreurs réseau** avec les network policies — la configuration est correcte.

### Recommandation

Maxime recommande de passer le min replicas à 3 (au lieu de 2) en production pour absorber le trafic de base sans attendre le HPA. Coût additionnel : ~150€/mois. **Approuvé** par l'équipe.

## 3. Problème GPU Scheduling pour Ollama

### Constat

Le node pool GPU (t1-45) est opérationnel, mais Ollama a des problèmes en K8s :

1. **GPU memory** : Ollama charge les modèles en VRAM. En K8s, si le pod est reschedulé, il doit recharger le modèle (~2 min pour llama3:8b). Pendant ce temps, les requêtes timeout.
2. **Resource limits** : K8s ne supporte pas nativement la granularité GPU memory, seulement le nombre de GPUs (`nvidia.com/gpu: 1`).
3. **Scaling** : Ollama ne supporte pas le multi-instance sur le même GPU. Un pod = un GPU.

### Solutions Discutées

| Solution | Avantages | Inconvénients |
|----------|-----------|---------------|
| Pod affinity + PDB | Evite les rescheduling inutiles | Ne résout pas le cold start |
| Ollama avec `OLLAMA_KEEP_ALIVE: 24h` | Modèle en VRAM en permanence | Consomme GPU même sans trafic |
| Fallback vers API externe (OpenAI) | Aucun GPU nécessaire | Coût variable, dépendance externe |
| vLLM au lieu d'Ollama | Meilleur batching, continuous batching | Migration significative |

### Décision

Court terme (Phase 2) : **Pod affinity + PDB + KEEP_ALIVE=24h**. On garde Ollama avec un pod "sticky" sur le nœud GPU. Le PodDisruptionBudget empêche K8s de le rescheduler sauf en cas de maintenance du nœud.

Long terme (post-Atlas) : évaluer la migration vers **vLLM** pour le batching et l'optimisation GPU. Julien créera un ticket de spike technique.

## 4. Planning Migration Production

### Fenêtre de Migration

- **Date proposée** : week-end du 12-13 avril 2026
- **Créneau** : samedi 22h → dimanche 6h (8 heures)
- **Downtime prévu** : 30 minutes max (bascule DNS)

### Étapes

1. **J-7** : backup complet PostgreSQL + snapshot Qdrant
2. **J-1** : freeze des déploiements, communication aux clients enterprise
3. **H-2** : pg_dump depuis les VMs, restore sur CloudNativePG
4. **H-1** : snapshot Qdrant → restore sur cluster K8s
5. **H-0** : bascule DNS (TTL réduit à 60s depuis J-7)
6. **H+1** : validation smoke tests automatisés
7. **H+2** : monitoring intensif (war room)
8. **J+1-J+14** : surveillance SLA, rollback plan actif

### Critères de Rollback

Si l'un de ces critères est atteint dans les 48h post-migration :
- Error rate > 1% pendant 15 minutes
- Latence P99 > 500ms pendant 15 minutes
- Perte de données détectée
- 3+ incidents critiques

→ Rollback : rebascule DNS vers les VMs (maintenues en standby pendant 2 semaines).

## Actions

| Action | Responsable | Deadline |
|--------|-------------|----------|
| Finaliser Argo Rollouts canary strategy | Pierre | 2026-03-07 |
| Documenter runbook migration production | Julien | 2026-03-14 |
| Configurer PDB pour Ollama GPU pod | Pierre | 2026-02-28 |
| Spike vLLM vs Ollama | Julien | 2026-04-15 |
| Communiquer fenêtre de migration aux clients | Nicolas | 2026-03-21 |
| Réduire TTL DNS à 60s | Maxime | 2026-04-05 |

## Prochaine Réunion

**Date :** 2026-03-06, 10h00
**Sujet :** Revue canary strategy + planning détaillé migration
