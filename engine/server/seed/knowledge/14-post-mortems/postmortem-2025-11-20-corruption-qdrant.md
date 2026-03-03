# Post-Mortem : Corruption d'Index Qdrant du 20 Novembre 2025

**Date de l'incident :** 20 novembre 2025
**Sévérité :** P2 — Majeur
**Durée de dégradation :** 2 heures 15 minutes (14h30 - 16h45 CET)
**Rédacteur :** Emilie Fontaine, Engineering Manager — Squad AI Engine
**Revue :** 22 novembre 2025 avec les squads AI Engine + Platform
**Statut :** Clos — tous les action items complétés

---

## 1. Résumé

Le 20 novembre 2025 à 14h30, le système de recherche vectorielle (Qdrant) a commencé à retourner des résultats incohérents et des erreurs intermittentes pour les fonctionnalités de RAG et de mémoire. L'investigation a révélé une corruption partielle de l'index HNSW de la collection `memory_embeddings`. La cause racine était une collision entre un snapshot automatique et une opération de bulk insert massive lancée simultanément. Le service a été dégradé pendant 2h15 avant la restauration complète via une réindexation depuis PostgreSQL.

---

## 2. Timeline Détaillée

| Heure (CET) | Événement |
|-------------|-----------|
| 14h00 | Le cron de snapshot Qdrant quotidien démarre (configuré à 14h00 UTC+1) |
| 14h05 | Le pipeline de mémoire traite un batch inhabituel de 45 000 embeddings suite à un import massif de documents par un client Enterprise (bulk RAG ingestion) |
| 14h15 | Le snapshot Qdrant est toujours en cours (collection de 3,2 millions de vecteurs). Le bulk insert commence à écrire dans la collection `memory_embeddings` |
| 14h25 | Les premières erreurs apparaissent dans les logs Qdrant : `WARN: segment merge conflict detected` |
| 14h30 | Les requêtes de recherche vectorielle commencent à retourner des résultats incohérents : certaines recherches retournent 0 résultats alors que les documents existent. L'alerte Datadog "Qdrant Search Accuracy Degraded" se déclenche |
| 14h35 | L'ingénieur d'astreinte (Léo Garnier) commence l'investigation. Il observe que le taux de recall des recherches est tombé à 40 % (vs. 95 % normal) |
| 14h45 | Léo identifie les erreurs de merge dans les logs Qdrant et la corrélation avec le snapshot en cours + le bulk insert |
| 14h50 | Décision prise : arrêter le bulk insert (pause du consumer Redis `memory:raw`) et annuler le snapshot en cours |
| 14h55 | Le snapshot est annulé. Le bulk insert est mis en pause. Les erreurs de merge cessent mais l'index reste corrompu |
| 15h00 | Tentative de repair via `POST /collections/memory_embeddings/index` — échoue avec `segment integrity check failed` |
| 15h10 | Décision d'escalade : réindexation complète depuis PostgreSQL. Plan validé par Emilie Fontaine |
| 15h15 | Début de la réindexation : suppression et recréation de la collection `memory_embeddings` avec les mêmes paramètres (dim=1536, distance=cosine, HNSW m=16, ef_construct=200) |
| 15h20 | Script de réindexation lancé : lecture des embeddings depuis la table `memory_fact_embeddings` en PostgreSQL (3,2 millions de vecteurs) et insertion par batch de 5 000 |
| 16h30 | Réindexation complète. Optimisation des segments en cours |
| 16h40 | Tests de recall : 94 % (proche de la normale). Les recherches fonctionnent correctement |
| 16h45 | Incident déclaré résolu. Consumer Redis `memory:raw` relancé pour traiter le backlog |
| 17h30 | Le backlog de 45 000 embeddings en attente est entièrement traité |

---

## 3. Impact

### Services affectés

- **RAG (Retrieval-Augmented Generation)** : Les réponses des agents utilisant le RAG étaient dégradées — documents pertinents non retrouvés, réponses génériques au lieu de réponses contextuelles
- **Mémoire persistante** : La recherche de faits mémorisés ne fonctionnait pas correctement — les agents "oubliaient" le contexte précédent
- **Recherche de documents** (console Ops) : Résultats de recherche incomplets ou absents

### Utilisateurs affectés

- Environ **120 utilisateurs actifs** pendant la période de dégradation
- Les utilisateurs n'ont pas reçu d'erreur explicite — les réponses des agents étaient simplement de moindre qualité (pas de contexte RAG, pas de mémoire)
- 5 tickets de support ouverts par des clients signalant des "réponses étranges" de leurs agents

### Données

- **Aucune perte de données** : Tous les embeddings étaient sauvegardés dans PostgreSQL (source de vérité). La réindexation a restauré 100 % des données.
- Le snapshot corrompu a été supprimé. Le snapshot suivant (21 novembre, 14h00) a été vérifié et est intègre.

---

## 4. Cause Racine

### Analyse technique

La corruption de l'index est due à une **condition de concurrence** entre le processus de snapshot Qdrant et l'opération de bulk insert massive.

Qdrant utilise des segments (fichiers mmap) pour stocker les vecteurs et les index HNSW. Le processus de snapshot crée un point de cohérence en verrouillant temporairement les segments. Cependant, la version de Qdrant utilisée (v1.7.3) présentait un bug connu (issue #2847 sur GitHub) où un bulk insert de plus de 10 000 vecteurs pendant un snapshot en cours pouvait provoquer une corruption du fichier d'index HNSW.

Le flux de l'incident :

1. Le snapshot démarre et commence à parcourir les segments de la collection
2. Le bulk insert de 45 000 embeddings déclenche la création de nouveaux segments
3. Le processus de merge automatique des segments tente de fusionner les anciens et nouveaux segments
4. Le snapshot, qui référence encore les anciens segments, entre en conflit avec le merge
5. Le fichier d'index HNSW est partiellement écrasé, rendant certaines zones de l'index illisibles

### Pourquoi cela ne s'était pas produit avant

En temps normal, les insertions dans Qdrant se font par petits batches (50-200 vecteurs à la fois via le pipeline de mémoire). Le volume de 45 000 vecteurs en quelques minutes était exceptionnel et résultait d'un import massif de documents par un nouveau client Enterprise qui avait ingéré l'intégralité de sa base documentaire (800 fichiers PDF) en une seule opération.

---

## 5. Résolution

### Actions immédiates

1. Arrêt du bulk insert et du snapshot
2. Réindexation complète depuis PostgreSQL (source de vérité)
3. Vérification de l'intégrité post-réindexation (tests de recall)
4. Traitement du backlog d'embeddings en attente

### Corrections durables

1. Mise à jour de Qdrant vers la version 1.8.1 (correctif du bug #2847)
2. Séparation temporelle entre les snapshots et les opérations d'écriture

---

## 6. Action Items

| ID | Action | Responsable | Échéance | Statut |
|----|--------|------------|----------|--------|
| AI-1 | Mettre à jour Qdrant de v1.7.3 à v1.8.1 (correctif du bug de snapshot/insert concurrent) | Léo Garnier | 27 nov. | Terminé |
| AI-2 | Déplacer le cron de snapshot à 3h00 du matin (période de faible activité) | Karim Bouzid | 22 nov. | Terminé |
| AI-3 | Ajouter un verrou applicatif : bloquer les bulk inserts (> 5 000 vecteurs) pendant un snapshot en cours | Emilie Fontaine | 4 déc. | Terminé |
| AI-4 | Limiter le débit d'insertion dans Qdrant à 2 000 vecteurs/minute via un rate limiter dans le consumer `memory:raw` | Léo Garnier | 4 déc. | Terminé |
| AI-5 | Ajouter une alerte sur le taux de recall Qdrant (alerte si < 85 % sur une fenêtre de 5 minutes) | Thomas Petit | 29 nov. | Terminé |
| AI-6 | Documenter la procédure de réindexation Qdrant depuis PostgreSQL dans le runbook | Léo Garnier | 29 nov. | Terminé |
| AI-7 | Implémenter un test d'intégrité post-snapshot automatique (vérification du recall sur un jeu de test) | Equipe AI Engine | 18 déc. | Terminé |
| AI-8 | Ajouter un mécanisme de file d'attente pour les imports massifs de documents (> 100 fichiers) avec progression visible dans l'interface Ops | Equipe Product | 15 janv. | Terminé |

---

## 7. Leçons Apprises

1. **PostgreSQL comme source de vérité pour les embeddings était une décision architecturale clé.** Sans cette duplication, la réindexation aurait été impossible et nous aurions dû recalculer tous les embeddings (coût estimé : 450 dollars en appels API OpenAI + 8-10h de traitement).

2. **Les opérations de maintenance (snapshots, backup) ne sont pas "gratuites"** et doivent être planifiées pendant les périodes de faible activité. Elles consomment des ressources IO et peuvent interférer avec les opérations normales.

3. **La dégradation silencieuse est pire qu'une erreur explicite.** Les utilisateurs ont reçu des réponses de mauvaise qualité sans savoir que le système était dégradé. Nous devons améliorer la détection et la communication des dégradations de qualité (pas seulement des erreurs techniques).

4. **Les imports massifs de données doivent être traités comme des opérations à risque**, avec un débit contrôlé et une surveillance dédiée. Le mécanisme de file d'attente ajouté (AI-8) permettra d'éviter ce type de surcharge à l'avenir.

---

*Post-mortem révisé et approuvé lors de la réunion d'équipe du 22 novembre 2025. Archivé dans Notion > Engineering > Post-Mortems.*
