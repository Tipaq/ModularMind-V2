# Rapport d'audit SOC 2 — Résumé exécutif

## Informations générales

| Élément | Détail |
|---------|--------|
| **Organisation auditée** | ModularMind SAS |
| **Période d'audit** | 1er juin 2025 — 30 novembre 2025 |
| **Type de rapport** | SOC 2 Type II |
| **Auditeur** | Ernst & Young Advisory (EY) |
| **Date du rapport** | 15 décembre 2025 |
| **Opinion** | Favorable sans réserve |

## Périmètre

L'audit couvre la plateforme ModularMind en tant que service SaaS, incluant :
- L'infrastructure de production (hébergée chez OVHcloud, France)
- L'application Engine (API, Worker, bases de données)
- Les applications clientes (Chat, Ops, Platform)
- Les processus opérationnels (développement, déploiement, support)

## Critères de confiance évalués (Trust Service Criteria)

### Sécurité (CC)
**Résultat : Conforme**

Contrôles évalués :
- Gestion des accès et authentification (MFA, RBAC)
- Chiffrement des données (en transit et au repos)
- Surveillance et détection des menaces
- Gestion des vulnérabilités et patching
- Plan de réponse aux incidents

Observation : Tous les contrôles de sécurité testés fonctionnent efficacement pendant la période d'audit.

### Disponibilité (A)
**Résultat : Conforme**

Contrôles évalués :
- Monitoring de la disponibilité (uptime 99.95% sur la période)
- Processus de backup et restauration
- Plan de continuité d'activité
- Gestion des capacités et scalabilité

Observation : Un incident de disponibilité de 45 minutes le 15 janvier 2026 a été correctement géré selon le plan de réponse aux incidents.

### Confidentialité (C)
**Résultat : Conforme**

Contrôles évalués :
- Classification des données
- Contrôle d'accès aux données clients
- Chiffrement des données sensibles
- Politique de rétention et suppression
- Accords de confidentialité (NDA) avec les employés

Observation : Les contrôles de confidentialité sont robustes et appropriés pour le niveau de sensibilité des données traitées.

## Points d'attention

### Recommandations

1. **Rotation des secrets** : Formaliser davantage le calendrier de rotation et mettre en place des alertes automatiques à l'approche des dates de rotation.

2. **Tests de restauration** : Augmenter la fréquence des tests de restauration de backup de trimestriel à mensuel.

3. **Formation sécurité** : Étendre la formation obligatoire en sécurité à tous les collaborateurs (pas uniquement l'équipe technique).

### Actions correctives planifiées

| Recommandation | Responsable | Date cible |
|----------------|-------------|------------|
| Alertes automatiques de rotation | DevOps Lead | Mars 2026 |
| Tests de restauration mensuels | DBA | Février 2026 |
| Formation sécurité tous employés | RH + Sécurité | Avril 2026 |

## Prochain audit

Le prochain audit SOC 2 Type II est prévu pour **novembre 2026**, couvrant la période juin-novembre 2026.

## Distribution

Ce résumé est destiné à la direction de ModularMind et peut être partagé avec les clients sur demande. Le rapport complet est disponible sous NDA auprès de audit@modularmind.io.