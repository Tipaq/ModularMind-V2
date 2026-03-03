# Post-Mortem : Panne API du 15 Janvier 2026

**Date de l'incident :** 15 janvier 2026
**Sévérité :** P1 — Critique
**Durée de l'indisponibilité :** 45 minutes (10h12 - 10h57 CET)
**Rédacteur :** Karim Bouzid, Engineering Manager — Squad Platform
**Revue :** 17 janvier 2026 avec l'équipe Platform + SRE
**Statut :** Clos — tous les action items complétés

---

## 1. Résumé

Le 15 janvier 2026 à 10h12, l'API principale de ModularMind est devenue indisponible pour l'ensemble des clients. Les utilisateurs recevaient des erreurs HTTP 503 (Service Unavailable) sur tous les endpoints. L'incident a duré 45 minutes et a affecté environ 230 utilisateurs actifs. La cause racine était un épuisement du pool de connexions PostgreSQL provoqué par une migration de données lancée sans coordination avec l'équipe opérationnelle.

---

## 2. Timeline Détaillée

| Heure (CET) | Événement |
|-------------|-----------|
| 09h45 | L'équipe Data lance un script de migration pour restructurer la table `memory_facts` (ajout d'un index et backfill de 2,3 millions de lignes) |
| 10h05 | Les premières alertes Datadog remontent : latence P99 des requêtes API passe de 120ms à 800ms |
| 10h08 | L'alerte "Connection Pool Usage > 80%" se déclenche sur le canal `#alerts-infra` |
| 10h12 | Le pool de connexions atteint sa limite (max_connections=100). Les nouvelles requêtes API sont rejetées avec des erreurs 503. L'alerte PagerDuty P1 se déclenche |
| 10h14 | L'ingénieur d'astreinte (Thomas Petit) acknowledge l'incident et commence l'investigation |
| 10h18 | Thomas identifie que 78 connexions sur 100 sont monopolisées par des requêtes longues provenant du script de migration. Il contacte l'équipe Data sur Slack |
| 10h22 | Le script de migration est identifié et stoppé manuellement par Yasmine Cherkaoui (EM Squad Data) |
| 10h25 | Les connexions monopolisées ne se libèrent pas immédiatement — les transactions en cours sont en attente de rollback |
| 10h30 | Thomas force la terminaison des sessions PostgreSQL bloquantes via `pg_terminate_backend()` pour les connexions du script de migration |
| 10h35 | Le pool de connexions commence à se libérer. 40 connexions disponibles. Les premières requêtes API passent à nouveau |
| 10h42 | 85 % des requêtes API répondent normalement. Quelques timeout résiduels pour les requêtes qui avaient été mises en file d'attente |
| 10h50 | 100 % du trafic est restauré. Latence P99 revenue à la normale (130ms) |
| 10h57 | L'incident est déclaré résolu après 15 minutes de stabilité confirmée. Communication envoyée aux clients via la status page |

---

## 3. Impact

### Utilisateurs affectés

- **230 utilisateurs actifs** au moment de l'incident (sur 1 450 utilisateurs totaux)
- **100 % des fonctionnalités** impactées (API complètement indisponible)
- **Durée d'impact utilisateur :** 45 minutes
- **Aucune perte de données** confirmée

### Impact métier

- 3 clients Enterprise ont ouvert des tickets de support P1
- 1 démonstration commerciale en cours a dû être reportée
- 12 exécutions d'agents en cours au moment de la panne ont été interrompues (relancées automatiquement après la résolution via le mécanisme de retry du worker)
- Violation du SLA 99,95 % pour le mois de janvier (disponibilité effective : 99,90 %). Crédit de service de 10 % appliqué aux clients Enterprise concernés

### Communication

- **10h20** : Bannière "Incident en cours" affichée sur la status page
- **10h35** : Mise à jour : "Cause identifiée, résolution en cours"
- **10h57** : Mise à jour : "Incident résolu, service rétabli"
- **11h30** : E-mail envoyé aux clients Enterprise avec un résumé de l'incident
- **17 janvier** : Post-mortem partagé avec les clients Enterprise ayant ouvert un ticket

---

## 4. Cause Racine

### Cause directe

Le pool de connexions PostgreSQL (configuré avec `max_connections=100` et géré par SQLAlchemy avec `pool_size=20, max_overflow=30`) a été saturé par un script de migration de données lancé par l'équipe Data & Analytics.

Le script utilisait des transactions longues (batch de 10 000 lignes par transaction) et ouvrait plusieurs connexions parallèles (8 workers) pour accélérer le traitement. Ces 8 connexions, combinées aux transactions longues, ont provoqué un effet domino :

1. Les 8 connexions du script maintenaient des verrous sur la table `memory_facts`
2. Les requêtes de l'API qui accédaient à cette table (lectures de mémoire pour les agents) se mettaient en attente de verrou
3. Chaque requête en attente maintenait une connexion du pool ouverte
4. Le pool de l'API (50 connexions max : `pool_size=20 + max_overflow=30`) s'est épuisé en quelques minutes
5. Une fois le pool API saturé, plus aucune requête ne pouvait être traitée

### Cause profonde

L'incident résulte de **trois défaillances combinées** :

1. **Absence de procédure de migration coordonnée** : Le script a été lancé en heures ouvrées sans validation préalable de l'équipe Platform ni vérification de l'impact sur les connexions
2. **Pas de pool de connexions séparé** pour les opérations de maintenance : Le script de migration utilisait les mêmes identifiants et la même base que l'API de production
3. **Seuils d'alerte trop tardifs** : L'alerte à 80 % d'utilisation du pool laissait moins de 2 minutes avant la saturation complète — insuffisant pour réagir

---

## 5. Résolution

### Actions immédiates (jour J)

1. Arrêt du script de migration
2. Terminaison forcée des sessions PostgreSQL bloquantes
3. Vérification de l'intégrité des données post-rollback
4. Relance des 12 exécutions d'agents interrompues

### Reprise de la migration (jour J+1)

La migration a été relancée le 16 janvier à 3h00 (créneau de maintenance) avec les ajustements suivants :
- Batch size réduit à 1 000 lignes (au lieu de 10 000)
- 2 workers parallèles (au lieu de 8)
- Utilisation d'un utilisateur PostgreSQL dédié (`migration_user`) avec une limite de connexions séparée
- Monitoring en temps réel pendant toute la durée

---

## 6. Action Items

| ID | Action | Responsable | Échéance | Statut |
|----|--------|------------|----------|--------|
| AI-1 | Créer un utilisateur PostgreSQL dédié pour les migrations avec un pool de connexions séparé (max 5 connexions) | Karim Bouzid | 22 janv. | Terminé |
| AI-2 | Documenter la procédure de migration de données en production (checklist pré-migration, créneau, validation) | Yasmine Cherkaoui | 24 janv. | Terminé |
| AI-3 | Abaisser le seuil d'alerte du pool de connexions à 60 % (au lieu de 80 %) et ajouter une alerte prédictive basée sur la tendance | Thomas Petit | 22 janv. | Terminé |
| AI-4 | Augmenter `max_connections` PostgreSQL à 200 et ajuster les pools SQLAlchemy en conséquence | Karim Bouzid | 29 janv. | Terminé |
| AI-5 | Ajouter un circuit breaker sur les connexions DB dans l'API pour retourner une erreur 503 propre plutôt qu'un timeout | Equipe Platform | 5 fév. | Terminé |
| AI-6 | Mettre en place un runbook "Migration de données en production" dans le wiki DevOps | Yasmine Cherkaoui | 31 janv. | Terminé |

---

## 7. Leçons Apprises

1. **Les migrations de données sont des opérations à risque** qui doivent être traitées avec le même sérieux qu'un déploiement. Elles nécessitent une coordination explicite avec l'équipe Platform.

2. **L'isolation des ressources est critique** : Les opérations de maintenance ne doivent jamais partager les mêmes ressources (connexions, CPU, IO) que le trafic de production.

3. **Les alertes doivent donner le temps de réagir** : Un seuil à 80 % pour une ressource qui peut se saturer en 2-3 minutes n'est pas actionnable. Les alertes prédictives (basées sur la tendance) sont plus utiles que les seuils absolus.

4. **La communication d'incident a bien fonctionné** : Le délai entre la détection et la première communication client (8 minutes) est conforme à notre objectif. Le processus PagerDuty -> investigation -> communication est rodé.

---

*Post-mortem révisé et approuvé lors de la réunion d'équipe du 17 janvier 2026. Archivé dans Notion > Engineering > Post-Mortems.*
