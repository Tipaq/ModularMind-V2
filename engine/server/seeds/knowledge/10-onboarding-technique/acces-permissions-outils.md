# Accès et permissions — Outils internes ModularMind

## Demande d'accès

Tous les accès sont gérés par l'Office Manager (Julie Moreau) et le DevOps Lead (Lucas Girard). Votre buddy s'assure que vous avez tous les accès nécessaires pendant votre première semaine.

## Outils et accès par rôle

### Tous les employés

| Outil | URL | Accès | Contact |
|-------|-----|-------|---------|
| Email (Google Workspace) | mail.google.com | Créé par IT le J1 | julie@modularmind.io |
| Slack | modularmind.slack.com | Invitation par email | julie@modularmind.io |
| Notion | notion.so/modularmind | Invitation workspace | julie@modularmind.io |
| 1Password | modularmind.1password.com | Invitation par IT | lucas@modularmind.io |
| Google Calendar | calendar.google.com | Via Google Workspace | — |
| Lucca (SIRH) | modularmind.lucca.io | Créé par RH | sophie@modularmind.io |

### Engineering (backend, frontend, devops, qa, data)

| Outil | URL | Accès | Contact |
|-------|-----|-------|---------|
| GitHub | github.com/modularmind | Ajouté à l'organisation | lucas@modularmind.io |
| Jira | modularmind.atlassian.net | Compte créé par PM | laura@modularmind.io |
| Grafana | grafana.modularmind.internal | OIDC après formation | lucas@modularmind.io |
| Sentry | sentry.io/modularmind | Invitation par email | lucas@modularmind.io |
| VPN (Tailscale) | tailscale.com | Invitation par DevOps | lucas@modularmind.io |
| Staging | staging.modularmind.internal | Via VPN | lucas@modularmind.io |
| Docker Registry | ghcr.io/modularmind | Via GitHub | — |

### Permissions GitHub par équipe

| Team | Repos | Permission |
|------|-------|-----------|
| @modularmind/backend | modularmind-v2 | Write |
| @modularmind/frontend | modularmind-v2 | Write |
| @modularmind/devops | modularmind-v2, infra, k8s-manifests | Admin |
| @modularmind/qa | modularmind-v2 | Write |
| @modularmind/data | modularmind-v2, data-pipelines | Write |

### Environnements

| Environnement | URL | Accès | Données |
|---------------|-----|-------|---------|
| Local | localhost:8000 / 5173 / 5174 | Développeur | Données de test |
| Staging | staging-*.modularmind.internal | Engineering (VPN) | Copie anonymisée |
| Production | *.modularmind.io | DevOps + Admin | Données réelles |

**Règle importante** : Seuls les DevOps et le VP Engineering ont accès SSH aux serveurs de production. Aucun développeur ne doit accéder directement à la production.

## Channels Slack importants

| Channel | Description | Qui |
|---------|-------------|-----|
| #general | Annonces générales | Tous |
| #engineering | Discussions techniques | Engineering |
| #team-backend | Équipe backend | Backend |
| #team-frontend | Équipe frontend | Frontend |
| #team-devops | Équipe DevOps | DevOps |
| #releases | Notifications de déploiement | Engineering |
| #incidents | Alertes et incidents | Engineering |
| #security-incidents | Incidents de sécurité | Sécurité + DevOps |
| #code-review | Demandes de review | Engineering |
| #random | Discussions informelles | Tous |
| #help-desk | Questions et support interne | Tous |

## VPN

Le VPN Tailscale est nécessaire pour accéder à :
- L'environnement staging
- Grafana et les dashboards de monitoring
- Les bases de données de staging (en lecture seule)

Installation :
1. Téléchargez Tailscale (tailscale.com/download)
2. Connectez-vous avec votre email ModularMind
3. Lucas validera votre accès et vous assignera le bon ACL