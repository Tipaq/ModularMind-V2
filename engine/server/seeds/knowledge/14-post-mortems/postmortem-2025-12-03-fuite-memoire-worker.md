# Post-Mortem : Fuite Mémoire du Worker du 3 Décembre 2025

**Date de l'incident :** 3 décembre 2025
**Sévérité :** P2 — Majeur
**Durée de dégradation :** 3 heures (06h00 - 09h00 CET, détection à 08h15)
**Rédacteur :** Karim Bouzid, Engineering Manager — Squad Platform
**Revue :** 5 décembre 2025 avec les squads Platform + AI Engine
**Statut :** Clos — tous les action items complétés

---

## 1. Résumé

Le 3 décembre 2025, le processus worker de ModularMind (consumer Redis Streams + APScheduler) a crashé avec une erreur OOM (Out of Memory) après environ 8 heures de fonctionnement continu. Le worker avait été redémarré la veille à 22h00 suite à un déploiement. La cause racine était une accumulation non bornée de batches d'embeddings dans la mémoire du processus, due à un déséquilibre entre la vitesse de production (extraction de faits) et la vitesse de consommation (envoi vers Qdrant). Le pipeline de mémoire a été interrompu pendant environ 3 heures, causant un retard dans l'extraction de faits et l'indexation des embeddings.

---

## 2. Timeline Détaillée

| Heure (CET) | Événement |
|-------------|-----------|
| 22h00 (2 déc.) | Déploiement v2.14.3. Le worker est redémarré. Consommation mémoire initiale : 380 Mo |
| 23h00 | Consommation mémoire du worker : 520 Mo. Normale pour cette phase (chargement des modèles de tokenization) |
| 02h00 (3 déc.) | Consommation mémoire : 1,2 Go. Pas d'alerte (seuil configuré à 2 Go) |
| 04h00 | Consommation mémoire : 2,1 Go. L'alerte "Worker Memory > 2 Go" se déclenche mais personne n'est d'astreinte sur cette alerte (classée P3) |
| 05h30 | Consommation mémoire : 3,5 Go |
| 06h00 | Le processus worker atteint la limite mémoire du conteneur Docker (4 Go) et est tué par le kernel (OOM killer). Le conteneur est redémarré automatiquement par Docker |
| 06h02 | Le worker redémarre. Consommation initiale : 380 Mo. Il commence à traiter le backlog accumulé pendant le crash |
| 06h45 | Consommation mémoire : 1,8 Go (le backlog amplifie le problème : encore plus de messages à traiter) |
| 07h30 | Consommation mémoire : 3,2 Go |
| 08h00 | Second crash OOM. Docker redémarre le conteneur |
| 08h15 | L'ingénieur d'astreinte (Léo Garnier) arrive au bureau et remarque les 2 crash OOM dans les logs. Il commence l'investigation |
| 08h25 | Léo identifie le pattern : la mémoire croît linéairement avec le nombre de messages traités sur le stream `memory:extracted` |
| 08h35 | Analyse du code du consumer `EmbedderHandler` : identification d'une liste `pending_batches` qui accumule les embeddings en attente d'envoi vers Qdrant sans limite de taille |
| 08h45 | Léo déploie un hotfix : ajout d'une limite de 100 batches en mémoire (environ 500 Mo max) avec flush forcé quand le seuil est atteint |
| 09h00 | Le worker redémarré avec le hotfix. Consommation stable à 600 Mo après 30 minutes. Traitement du backlog en cours |
| 10h30 | Backlog entièrement traité. Le worker fonctionne normalement |

---

## 3. Impact

### Services affectés

- **Pipeline de mémoire** : L'extraction de faits et l'indexation des embeddings ont été retardées de ~3 heures pour les messages générés entre 06h00 et 09h00
- **Tâches planifiées (APScheduler)** : Les tâches cron hébergées par le worker (nettoyage des sessions expirées, synchronisation des configs, métriques) n'ont pas été exécutées pendant les périodes de crash
- **Agents IA** : Les faits récents n'étaient pas disponibles en mémoire pendant la période d'indisponibilité du worker. Impact modéré car la plupart des utilisateurs commençaient leur journée à 9h

### Utilisateurs affectés

- Impact indirect sur tous les utilisateurs dont les conversations ont eu lieu entre 06h00 et 09h00 (environ 45 utilisateurs, principalement early birds et fuseaux horaires différents)
- Aucun ticket de support ouvert (la dégradation était subtile : les agents fonctionnaient mais sans les faits mémorisés très récents)

### Données

- **Aucune perte de données** : Tous les messages étaient persistés dans les Redis Streams et ont été traités après la résolution. Redis Streams garantit la livraison "at least once".

---

## 4. Cause Racine

### Analyse technique

Le worker ModularMind exécute plusieurs consumers Redis Streams, dont le `EmbedderHandler` qui est responsable de :

1. Lire les faits extraits depuis le stream `memory:extracted`
2. Calculer les embeddings via l'API OpenAI (ou un modèle local)
3. Insérer les embeddings dans Qdrant et PostgreSQL

Le `EmbedderHandler` implémentait un mécanisme de batching pour optimiser les appels API et les insertions Qdrant : il accumulait les embeddings dans une liste `pending_batches` et les envoyait par lots de 500 vecteurs.

**Le problème :** La liste `pending_batches` n'avait **aucune limite de taille**. Dans les conditions normales, le batch était flush tous les 500 éléments ou toutes les 30 secondes (le premier des deux). Cependant :

```python
# Code problématique (simplifié)
class EmbedderHandler:
    def __init__(self):
        self.pending_batches: list[EmbeddingBatch] = []  # Pas de limite !

    async def handle(self, message: ExtractedFact):
        embedding = await self.compute_embedding(message)
        self.pending_batches.append(embedding)

        if len(self.pending_batches) >= 500:
            await self.flush()

    async def flush(self):
        # Envoyer vers Qdrant + PG
        await self.qdrant_client.upsert(self.pending_batches)
        await self.pg_store.bulk_insert(self.pending_batches)
        self.pending_batches.clear()
```

Le problème se manifestait lorsque le `flush()` échouait silencieusement (timeout Qdrant, erreur réseau transitoire). Dans ce cas, les embeddings restaient dans `pending_batches` et de nouveaux éléments continuaient à s'accumuler. Le mécanisme de retry ajoutait les éléments échoués à la fin de la liste, créant une boucle d'accumulation.

Chaque `EmbeddingBatch` contenait le vecteur (1536 floats = 6 Ko) plus les métadonnées. Avec des dizaines de milliers de batches accumulés, la mémoire croissait de manière linéaire et incontrôlée.

### Facteur aggravant

Le déploiement de la v2.14.3 (la veille à 22h00) avait introduit un changement dans le timeout de connexion Qdrant qui causait des timeout plus fréquents lors des pics de charge matinaux. Cela augmentait le taux d'échec du `flush()` et accélérait l'accumulation.

---

## 5. Résolution

### Hotfix immédiat (v2.14.4)

```python
class EmbedderHandler:
    MAX_PENDING_BATCHES = 100  # ~500 Mo max
    FLUSH_INTERVAL_SECONDS = 10  # Flush plus fréquent

    def __init__(self):
        self.pending_batches: list[EmbeddingBatch] = []

    async def handle(self, message: ExtractedFact):
        embedding = await self.compute_embedding(message)
        self.pending_batches.append(embedding)

        if len(self.pending_batches) >= 500 or len(self.pending_batches) >= self.MAX_PENDING_BATCHES:
            await self.flush()

    async def flush(self):
        try:
            await self.qdrant_client.upsert(self.pending_batches)
            await self.pg_store.bulk_insert(self.pending_batches)
            self.pending_batches.clear()
        except Exception as e:
            logger.error(f"Flush failed: {e}")
            # Garder uniquement les 50 derniers batches, les plus anciens seront re-traités
            # depuis le stream (acknowledgement retardé)
            if len(self.pending_batches) > 50:
                dropped = len(self.pending_batches) - 50
                self.pending_batches = self.pending_batches[-50:]
                logger.warning(f"Dropped {dropped} pending batches to prevent OOM")
```

### Correction durable (v2.15.0)

- Remplacement de la liste en mémoire par une file d'attente bornée (`asyncio.Queue(maxsize=200)`)
- Ajout d'un garbage collector périodique pour les objets volumineux (toutes les 5 minutes)
- Métriques Prometheus exposées pour le nombre de pending batches et la mémoire du processus
- Circuit breaker sur la connexion Qdrant : après 3 échecs consécutifs, pause de 30 secondes avant retry

---

## 6. Action Items

| ID | Action | Responsable | Échéance | Statut |
|----|--------|------------|----------|--------|
| AI-1 | Déployer le hotfix v2.14.4 avec la limite de pending batches | Léo Garnier | 3 déc. (fait) | Terminé |
| AI-2 | Corriger le timeout Qdrant introduit dans v2.14.3 (restaurer la valeur précédente) | Léo Garnier | 3 déc. (fait) | Terminé |
| AI-3 | Remplacer la liste par une `asyncio.Queue` bornée dans `EmbedderHandler` | Equipe AI Engine | 13 déc. | Terminé |
| AI-4 | Ajouter des métriques Prometheus pour : pending_batches_count, worker_memory_rss, flush_failures_total | Thomas Petit | 10 déc. | Terminé |
| AI-5 | Reclasser l'alerte "Worker Memory > 2 Go" en P2 (au lieu de P3) et l'inclure dans la rotation PagerDuty | Karim Bouzid | 5 déc. | Terminé |
| AI-6 | Implémenter un circuit breaker sur les connexions Qdrant et Redis dans le worker | Equipe Platform | 20 déc. | Terminé |
| AI-7 | Ajouter un GC périodique (`gc.collect()` + `gc.freeze()`) dans le worker pour les objets de grande taille | Léo Garnier | 13 déc. | Terminé |
| AI-8 | Revoir toutes les structures de données en mémoire dans le worker pour s'assurer qu'elles sont bornées | Equipe AI Engine | 20 déc. | Terminé |

---

## 7. Leçons Apprises

1. **Toute structure de données en mémoire doit être bornée.** Les listes, queues et caches sans limite de taille sont des bombes à retardement. Un audit systématique de toutes les structures unbounded dans le worker a été réalisé (AI-8).

2. **Les échecs silencieux sont dangereux.** Le `flush()` échouait sans que cela soit visible ni alerté. Le monitoring doit couvrir non seulement les métriques d'infrastructure (CPU, mémoire) mais aussi les métriques applicatives (taux de flush, taille de queue, latence de traitement).

3. **Les alertes mémoire doivent être prioritaires.** Une fuite mémoire sur un service singleton (le worker) est par définition critique — il n'y a pas de failover. La reclassification en P2 garantit qu'un ingénieur est alerté.

4. **Les déploiements tardifs nécessitent une surveillance renforcée.** Le déploiement à 22h00 signifie que l'impact n'est visible que le lendemain matin. Pour les déploiements hors heures ouvrées, une vérification des métriques doit être planifiée 2h après le déploiement.

---

*Post-mortem révisé et approuvé lors de la réunion d'équipe du 5 décembre 2025. Archivé dans Notion > Engineering > Post-Mortems.*
