# Plan de réponse aux incidents de sécurité

## Classification des incidents

| Niveau | Description | Exemples | Temps de réponse |
|--------|-------------|----------|------------------|
| SEV-1 | Critique, impact majeur | Fuite de données, ransomware, compromission serveur | Immédiat (< 15 min) |
| SEV-2 | Élevé, impact significatif | Accès non autorisé, DDoS, secret compromis | < 1 heure |
| SEV-3 | Moyen, impact limité | Tentative de phishing réussie, vulnérabilité exploitable | < 4 heures |
| SEV-4 | Bas, impact minimal | Scan de ports, tentative de brute force bloquée | < 24 heures |

## Équipe de réponse (CSIRT)

| Rôle | Titulaire | Suppléant |
|------|-----------|-----------|
| Incident Commander | Lucas Girard (DevOps Lead) | Marie Chen (CTO) |
| Lead Technique | Thomas Lefevre (Tech Lead) | Alexandre Martin (VP Eng) |
| Communication | Pierre Durand (CEO) | Laura Petit (CPO) |
| Juridique | Cabinet externe (Fieldfisher) | — |
| DPO | Sophie Bernard | — |

## Processus de réponse

### Phase 1 : Détection et qualification (0-15 min)

1. Incident détecté (alerte monitoring, signalement utilisateur, scan de sécurité)
2. Premier répondant qualifie la sévérité
3. Notification de l'équipe CSIRT via :
   - SEV-1/2 : PagerDuty + appel téléphonique
   - SEV-3/4 : Slack #security-incidents

### Phase 2 : Confinement (15 min - 2h)

1. Isoler les systèmes affectés (couper l'accès réseau si nécessaire)
2. Préserver les preuves (snapshots, logs, captures réseau)
3. Évaluer l'étendue de la compromission
4. Bloquer le vecteur d'attaque (IP, compte, clé API)

### Phase 3 : Éradication (2h - 24h)

1. Identifier la cause racine
2. Supprimer le code malveillant ou corriger la vulnérabilité
3. Révoquer et renouveler tous les secrets potentiellement compromis
4. Appliquer les correctifs
5. Scanner les systèmes pour vérifier l'absence de backdoors

### Phase 4 : Récupération (24h - 72h)

1. Restaurer les services de manière contrôlée
2. Monitoring renforcé pendant 48h
3. Vérifier l'intégrité des données
4. Réactiver les accès utilisateurs

### Phase 5 : Post-incident (1-2 semaines)

1. Rédiger le rapport d'incident (template disponible)
2. Organiser une réunion de retour d'expérience (blameless)
3. Identifier les améliorations (processus, outils, formation)
4. Mettre à jour les runbooks et procédures
5. Communiquer les leçons apprises à l'équipe

## Communication

### Interne
- Slack #security-incidents pour le suivi en temps réel
- Email à all@modularmind.io après résolution (sans détails techniques sensibles)

### Clients
- Si des données clients sont affectées : notification sous 72h (obligation RGPD)
- Email individuel aux clients concernés
- Publication d'un avis de sécurité sur le portail client

### Autorités
- Si données personnelles affectées : notification CNIL sous 72h
- Si infraction pénale : signalement aux forces de l'ordre

## Contact d'urgence

**Ligne de sécurité 24/7** : +33 1 XX XX XX XX
**Email** : security@modularmind.io
**PagerDuty** : Escalation policy "Security Incident"