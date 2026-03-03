# Post-Mortem : Pic de Latence SSE du 10 Février 2026

**Date de l'incident :** 10 février 2026
**Sévérité :** P2 — Majeur
**Durée de dégradation :** 1 heure 40 minutes (11h20 - 13h00 CET)
**Rédacteur :** Thomas Bertrand, Engineering Manager — Squad Product
**Revue :** 12 février 2026 avec les squads Product + Platform
**Statut :** Clos — tous les action items complétés

---

## 1. Résumé

Le 10 février 2026, environ 30 % des utilisateurs de l'application Chat ont constaté des délais anormalement longs (5 à 15 secondes) avant de voir les premières réponses des agents IA en streaming (SSE — Server-Sent Events). Le problème était intermittent et dépendait de la répartition du trafic entre les instances Nginx. La cause racine était la directive `proxy_buffering on` activée par défaut dans la configuration Nginx du reverse proxy, qui buffurisait les événements SSE au lieu de les transmettre en temps réel. Ce paramètre avait été réintroduit accidentellement lors d'une mise à jour de la configuration Nginx le 7 février.

---

## 2. Timeline Détaillée

| Heure (CET) | Événement |
|-------------|-----------|
| 07 fév. 16h00 | Mise à jour de la configuration Nginx dans le cadre du ticket PLAT-892 (ajout de headers de sécurité CSP). La configuration est regénérée à partir du template et déployée |
| 07 fév. - 10 fév. | Le problème existe mais n'est pas détecté car le monitoring SSE ne mesure que le taux d'erreur (0 %) et pas la latence du premier byte |
| 10 fév. 11h20 | Un client Enterprise ouvre un ticket de support P2 : "Les réponses de nos agents mettent 10 secondes à s'afficher alors que c'était instantané la semaine dernière" |
| 11h25 | L'équipe Customer Success confirme le problème et escalade à l'Engineering |
| 11h30 | Thomas Bertrand reproduit le problème en environnement de production. Observations : le délai initial est de 5-8 secondes, puis les tokens arrivent par "paquets" au lieu d'arriver un par un |
| 11h45 | Vérification côté Engine : les logs montrent que les événements SSE sont émis immédiatement et correctement (latence < 100ms entre la génération du token et l'envoi SSE). Le problème est en aval |
| 11h55 | Vérification côté Nginx : Thomas examine les logs d'accès Nginx et constate des temps de réponse (upstream_response_time) normaux mais des temps de transfert (request_time) anormalement élevés pour les endpoints `/api/v1/executions/*/stream` |
| 12h05 | Inspection de la configuration Nginx : découverte que `proxy_buffering` est activé (`on` par défaut dans Nginx). La directive `proxy_buffering off` qui était présente dans l'ancienne configuration n'a pas été reportée dans le template regénéré |
| 12h10 | Analyse : avec `proxy_buffering on`, Nginx accumule les données reçues du backend dans un buffer de 8 Ko (4 buffers de 4 Ko par défaut) avant de les transmettre au client. Pour les réponses SSE qui envoient de petits paquets (quelques dizaines d'octets par token), le buffer met plusieurs secondes à se remplir |
| 12h15 | Le hotfix est préparé : ajout des directives suivantes dans le bloc `location` des endpoints SSE |
| 12h25 | Déploiement du hotfix en production (rolling update, 0 downtime) |
| 12h30 | Premiers tests : la latence du premier byte est immédiatement réduite à < 200ms. Le streaming est fluide |
| 12h45 | Confirmation par le client Enterprise que le problème est résolu |
| 13h00 | Monitoring étendu confirmant la résolution pour 100 % du trafic. Incident déclaré résolu |

---

## 3. Impact

### Utilisateurs affectés

- **Environ 30 % des utilisateurs** de l'application Chat ont été affectés. Le pourcentage dépendait de l'instance Nginx à laquelle ils étaient routés (2 instances sur 3 étaient touchées — la 3ème avait été redémarrée entre-temps et avait conservé l'ancienne configuration en cache)
- **Durée d'exposition :** 3 jours (du 7 au 10 février), mais l'impact n'était perceptible que pendant les heures d'activité

### Expérience utilisateur

L'impact sur l'expérience utilisateur était significatif :

- **Délai initial de 5-15 secondes** avant l'affichage du premier token (vs. < 500ms normalement)
- **Tokens affichés par "paquets"** de 20-50 tokens au lieu d'un streaming fluide token par token
- L'impression que l'agent "réfléchissait longtemps" puis "répondait d'un coup"
- Aucune erreur visible pour l'utilisateur — l'expérience était simplement lente

### Métriques

- TTFB (Time To First Byte) moyen pour les endpoints SSE : **7,2 secondes** (vs. 180ms normalement)
- P99 TTFB : **14,8 secondes**
- Taux d'erreur SSE : **0 %** (pas d'erreur, juste de la latence)
- 1 ticket de support P2 ouvert par un client Enterprise
- Estimation : 4-5 utilisateurs ont probablement fermé leur session en pensant que l'agent ne répondait pas (basé sur les analytics de session)

---

## 4. Cause Racine

### Cause directe

La directive `proxy_buffering on` (valeur par défaut de Nginx) était active sur les endpoints SSE. Cette directive provoque le comportement suivant :

1. Nginx reçoit les données du backend (FastAPI) dans un buffer interne
2. Il ne transmet les données au client que lorsque le buffer est plein (4 Ko par défaut) ou qu'un timeout est atteint
3. Les événements SSE étant de petite taille (50-200 octets par token), le buffer met plusieurs secondes à se remplir
4. Le client reçoit alors un "paquet" de tokens d'un coup au lieu d'un flux continu

### Cause profonde

Le ticket PLAT-892 (ajout de headers CSP) a nécessité la regénération de la configuration Nginx à partir d'un template Jinja2. Le template avait été mis à jour pour les headers de sécurité, mais **la directive `proxy_buffering off` n'était pas dans le template** — elle avait été ajoutée manuellement dans la configuration en production lors du déploiement initial du SSE (6 mois plus tôt) sans être reportée dans le template source.

C'est un cas classique de **drift entre la configuration déclarative (template) et la configuration réelle (production)**. Le template Jinja2 dans le dépôt Git ne reflétait pas la configuration production.

### Pourquoi la détection a pris 3 jours

1. **Pas de monitoring TTFB sur les endpoints SSE** : Le monitoring existant vérifiait le taux d'erreur (HTTP 5xx) et le débit d'événements, mais pas la latence du premier byte
2. **Impact intermittent** : Seules 2 instances Nginx sur 3 étaient affectées
3. **Pas de test de régression SSE** : La CI/CD ne testait pas la latence du streaming, seulement la fonctionnalité (les données arrivent)

---

## 5. Résolution

### Configuration Nginx corrigée

Les directives suivantes ont été ajoutées dans le bloc `location` des endpoints SSE :

```nginx
location ~ ^/api/v1/executions/.*/stream$ {
    proxy_pass http://engine_upstream;

    # Désactiver le buffering pour le SSE
    proxy_buffering off;
    proxy_cache off;

    # Headers SSE
    proxy_set_header Connection '';
    proxy_http_version 1.1;
    chunked_transfer_encoding off;

    # Timeouts pour les connexions longues
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;

    # Transmettre les headers SSE du backend
    proxy_set_header X-Accel-Buffering no;
    add_header X-Accel-Buffering no;
}
```

### Test de charge post-correction

Un test de charge a été réalisé pour valider la correction :

| Métrique | Avant correction | Après correction |
|----------|-----------------|-----------------|
| TTFB moyen (SSE) | 7,2 s | 165 ms |
| TTFB P99 (SSE) | 14,8 s | 420 ms |
| Débit tokens/s (perçu client) | Irrégulier (paquets) | Fluide (token par token) |
| Connexions SSE simultanées testées | 200 | 200 |
| Erreurs pendant le test | 0 | 0 |

---

## 6. Action Items

| ID | Action | Responsable | Échéance | Statut |
|----|--------|------------|----------|--------|
| AI-1 | Corriger la configuration Nginx : ajouter `proxy_buffering off` pour les endpoints SSE | Thomas Bertrand | 10 fév. (fait) | Terminé |
| AI-2 | Reporter la directive `proxy_buffering off` dans le template Jinja2 source (et toutes les directives SSE) | Karim Bouzid | 11 fév. | Terminé |
| AI-3 | Ajouter un test de régression SSE dans la CI/CD : vérifier que le TTFB < 1 seconde pour un endpoint de streaming | Equipe Platform | 21 fév. | Terminé |
| AI-4 | Ajouter un monitoring TTFB sur les endpoints SSE dans Datadog (alerte si TTFB P95 > 2 secondes) | Thomas Petit | 14 fév. | Terminé |
| AI-5 | Auditer la configuration Nginx production vs. le template source pour identifier d'autres drifts | Karim Bouzid | 17 fév. | Terminé |
| AI-6 | Migrer la gestion de la configuration Nginx vers un outil de templating versionné avec validation automatique (passage à la génération 100 % via CI/CD, interdiction des modifications manuelles en prod) | Equipe Platform | 7 mars | Terminé |
| AI-7 | Ajouter un header `X-Stream-Latency` dans les réponses SSE de l'Engine pour mesurer la latence côté serveur indépendamment de Nginx | Equipe AI Engine | 21 fév. | Terminé |

---

## 7. Leçons Apprises

1. **Le SSE nécessite une configuration Nginx spécifique** et cette configuration doit être traitée comme du code : versionnée, testée, et déployée automatiquement. Les modifications manuelles en production sont une source de drift inévitable.

2. **Monitorer la fonctionnalité ne suffit pas — il faut monitorer l'expérience.** Le taux d'erreur était à 0 % mais l'expérience utilisateur était sévèrement dégradée. Le TTFB est un indicateur critique pour les interfaces de streaming.

3. **Les régressions de performance sont plus difficiles à détecter que les régressions fonctionnelles.** Un test E2E classique (vérifier que les données arrivent) ne détecte pas un problème de latence. Les tests de performance doivent être intégrés dans la CI/CD.

4. **Le délai de détection de 3 jours est inacceptable pour un problème affectant 30 % des utilisateurs.** La combinaison monitoring TTFB + test de régression SSE dans la CI devrait empêcher toute récurrence.

5. **La documentation de configuration Nginx pour le SSE devrait être un article de référence** dans notre base de connaissances DevOps. C'est un piège classique qui touche de nombreuses équipes.

---

*Post-mortem révisé et approuvé lors de la réunion d'équipe du 12 février 2026. Archivé dans Notion > Engineering > Post-Mortems.*
