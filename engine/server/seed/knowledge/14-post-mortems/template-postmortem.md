# Template de Post-Mortem

**Version :** 1.2
**Dernière mise à jour :** Janvier 2026
**Responsable :** VP Engineering
**Applicable à :** Tous les incidents P1 et P2 chez ModularMind

---

## Guide d'Utilisation

Ce template doit être utilisé pour documenter tout incident de sévérité P1 ou P2. Les incidents P3 peuvent optionnellement faire l'objet d'un post-mortem allégé (sections 1, 4 et 6 uniquement). L'objectif d'un post-mortem n'est **jamais** de blâmer des individus, mais de comprendre les défaillances systémiques et de mettre en place des mesures préventives.

### Processus

1. **Pendant l'incident** : L'ingénieur d'astreinte (ou l'incident commander) ouvre un document de post-mortem vierge et commence à documenter la timeline en temps réel
2. **Dans les 24h suivant la résolution** : Le rédacteur principal (généralement l'EM de l'équipe responsable) complète le draft
3. **Dans les 48-72h** : Une réunion de revue de post-mortem est organisée avec les équipes impliquées
4. **Dans la semaine** : Le post-mortem finalisé est partagé en interne (canal `#incidents`) et, pour les P1, avec les clients impactés

### Classification de Sévérité

| Niveau | Critère | Exemples | Astreinte | Post-mortem |
|--------|---------|----------|-----------|-------------|
| **P1 — Critique** | Service complètement indisponible OU perte de données OU faille de sécurité active | API down, base de données corrompue, fuite de données | PagerDuty immédiat (24/7) | Obligatoire (< 72h) |
| **P2 — Majeur** | Fonctionnalité majeure dégradée OU impact significatif sur une partie des utilisateurs | RAG ne fonctionne pas, latence x10, SSE cassé | PagerDuty heures ouvrées | Obligatoire (< 1 semaine) |
| **P3 — Mineur** | Fonctionnalité secondaire impactée OU impact limité (< 5 % des utilisateurs) | Erreur sur un endpoint spécifique, UI cosmétique | Slack `#alerts-infra` | Optionnel |
| **P4 — Informatif** | Anomalie détectée sans impact utilisateur | Pic CPU transitoire, log d'erreur isolé | Pas d'alerte | Non |

---

## Template

*Copier les sections ci-dessous dans un nouveau document et remplir les informations.*

---

# Post-Mortem : [Titre descriptif de l'incident]

**Date de l'incident :** [JJ mois AAAA]
**Sévérité :** [P1 / P2 / P3]
**Durée de l'indisponibilité / dégradation :** [Xh Xmin (HH:MM - HH:MM TZ)]
**Rédacteur :** [Nom, rôle]
**Revue :** [Date de la réunion de revue + participants]
**Statut :** [En cours / Clos]

---

## 1. Résumé

*Résumé en 3-5 phrases maximum. Répondre aux questions : Que s'est-il passé ? Quelle a été la durée ? Combien d'utilisateurs ont été affectés ? Quelle était la cause racine (en une phrase) ? Comment a-t-on résolu le problème ?*

---

## 2. Timeline Détaillée

*Documenter chaque événement significatif avec l'heure exacte. Être factuel et précis. Inclure : les alertes déclenchées, les actions prises, les décisions clés, les communications envoyées.*

| Heure (CET) | Événement |
|-------------|-----------|
| HH:MM | [Description de l'événement] |
| HH:MM | [Description de l'événement] |
| ... | ... |

**Métriques clés pendant l'incident :**

- Temps de détection (TTD) : [temps entre le début de l'incident et la première alerte]
- Temps d'engagement (TTE) : [temps entre l'alerte et le début de l'investigation]
- Temps de résolution (TTR) : [temps entre le début de l'investigation et la résolution]
- Temps total d'impact : [durée totale vue par les utilisateurs]

---

## 3. Impact

### Services affectés

*Lister tous les services, fonctionnalités et systèmes impactés. Préciser le type d'impact (indisponibilité totale, dégradation, erreurs intermittentes).*

### Utilisateurs affectés

*Estimer le nombre d'utilisateurs impactés. Distinguer les utilisateurs "directement impactés" (erreur visible) des utilisateurs "indirectement impactés" (dégradation de qualité). Mentionner les clients Enterprise nommément si des tickets de support ont été ouverts.*

### Impact métier

*Quantifier l'impact business si possible : revenus perdus, SLA manqués, crédits de service à appliquer, réputation.*

### Données

*Confirmer s'il y a eu perte de données ou non. Si oui, quantifier et détailler les mesures de récupération.*

### Communication

*Documenter toutes les communications envoyées pendant et après l'incident : status page, e-mails clients, messages Slack internes.*

---

## 4. Cause Racine

### Analyse technique

*Explication détaillée et technique de la cause de l'incident. Utiliser des diagrammes, du code, des logs si nécessaire. L'analyse doit être suffisamment précise pour qu'un ingénieur puisse comprendre exactement ce qui s'est passé.*

### Chaîne causale (méthode des 5 pourquoi)

*Remonter la chaîne causale pour identifier la cause profonde (pas seulement la cause directe).*

1. **Pourquoi** le service était-il indisponible ?
   - [Réponse] — parce que [cause directe]
2. **Pourquoi** [cause directe] s'est-il produit ?
   - [Réponse] — parce que [cause intermédiaire]
3. **Pourquoi** [cause intermédiaire] n'a-t-il pas été détecté ?
   - [Réponse] — parce que [défaillance de monitoring / process]
4. **Pourquoi** [défaillance] existait-elle ?
   - [Réponse] — parce que [cause systémique]
5. **Pourquoi** [cause systémique] n'avait-elle pas été corrigée ?
   - [Réponse] — parce que [cause racine profonde]

### Facteurs contributifs

*Lister les facteurs qui ont aggravé l'incident sans en être la cause directe (charge inhabituelle, timing malheureux, dette technique, etc.).*

---

## 5. Résolution

### Actions immédiates

*Décrire les actions prises pendant l'incident pour restaurer le service. Être précis sur les commandes, les configurations modifiées, les déploiements effectués.*

### Vérification post-résolution

*Comment avez-vous confirmé que le problème était résolu ? Quels tests, métriques ou vérifications ont été effectués ?*

---

## 6. Action Items

*Lister toutes les actions préventives et correctives. Chaque action doit avoir un responsable nommé et une échéance. Les actions doivent être suivies jusqu'à complétion.*

| ID | Action | Responsable | Échéance | Statut |
|----|--------|------------|----------|--------|
| AI-1 | [Description de l'action] | [Nom] | [Date] | [En cours / Terminé] |
| AI-2 | [Description de l'action] | [Nom] | [Date] | [En cours / Terminé] |

**Catégories d'actions recommandées :**

- **Correction** : Corriger la cause directe
- **Détection** : Améliorer le monitoring et les alertes pour détecter plus tôt
- **Prévention** : Éliminer la cause racine pour qu'elle ne se reproduise pas
- **Processus** : Améliorer les processus (review, déploiement, communication)
- **Documentation** : Mettre à jour les runbooks, procédures, documentation

---

## 7. Leçons Apprises

*3 à 5 leçons clés tirées de cet incident. Formuler chaque leçon de manière positive et actionnable. Éviter les formulations vagues ("il faut faire mieux") — être spécifique.*

1. [Leçon 1]
2. [Leçon 2]
3. [Leçon 3]

---

## Annexes (optionnel)

- Captures d'écran des dashboards pendant l'incident
- Extraits de logs pertinents
- Diagrammes d'architecture
- Liens vers les tickets Linear associés

---

## Checklist de Validation

Avant de clôturer le post-mortem, vérifier que :

- [ ] Le résumé est compréhensible par un non-technicien
- [ ] La timeline est complète et les heures sont précises
- [ ] L'impact est quantifié (nombre d'utilisateurs, durée, SLA)
- [ ] La cause racine est identifiée (pas seulement la cause directe)
- [ ] Les 5 pourquoi ont été appliqués
- [ ] Tous les action items ont un responsable et une échéance
- [ ] Le post-mortem a été revu en réunion avec les équipes impliquées
- [ ] Le ton est factuel et sans blâme
- [ ] Les leçons apprises sont actionnables
- [ ] La communication client a été effectuée (si P1 ou client impacté)

---

*Template maintenu par l'équipe SRE. Suggestions d'amélioration : canal Slack `#incidents` ou `karim.bouzid@modularmind.fr`.*
