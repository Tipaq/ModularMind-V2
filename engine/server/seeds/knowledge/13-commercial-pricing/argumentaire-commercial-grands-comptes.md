# Argumentaire Commercial — Grands Comptes

**Version :** 1.6
**Dernière mise à jour :** Février 2026
**Cible :** Entreprises de plus de 1 000 salariés, groupes internationaux, secteurs réglementés
**Usage :** Équipe commerciale grands comptes — préparation de RFP, soutenances, comités de pilotage

---

## 1. Enjeux Spécifiques des Grands Comptes

Les grandes organisations font face à des défis structurellement différents des PME dans leur adoption de l'IA générative. Leurs exigences portent sur cinq axes majeurs :

### Sécurité et conformité réglementaire

Les grands comptes opèrent dans des environnements fortement réglementés (banque, assurance, santé, défense, administration). Toute solution IA doit démontrer sa conformité aux cadres normatifs applicables : RGPD, loi IA européenne (AI Act), directives sectorielles (DORA pour la finance, HDS pour la santé), et les politiques de sécurité internes souvent plus strictes que les exigences légales.

### Gouvernance et contrôle

Les DSI exigent un contrôle total sur les données traitées par l'IA, les modèles utilisés, les flux d'information et les droits d'accès. Le "shadow AI" (usage non contrôlé de ChatGPT et autres outils par les collaborateurs) est identifié comme un risque majeur par 85 % des RSSI interrogés (étude Wavestone 2025).

### Intégration au SI existant

Les grands comptes disposent d'un SI complexe (ERP, CRM, SIRH, GED, outils métier) et toute nouvelle solution doit s'intégrer sans friction. L'interopérabilité, les API, le SSO et le provisioning automatisé sont des prérequis non négociables.

### Scalabilité et performance

Le volume d'usage dans un grand compte peut varier de quelques centaines à plusieurs dizaines de milliers d'utilisateurs. La solution doit supporter cette montée en charge sans dégradation de performance.

### Accompagnement et support

Les grands comptes attendent un accompagnement structuré : chef de projet dédié, formations, documentation, SLA contractuels, revues de service régulières.

---

## 2. Positionnement ModularMind Enterprise

### La réponse aux exigences des grands comptes

ModularMind Enterprise a été conçu spécifiquement pour répondre aux contraintes des grandes organisations. Notre plateforme se distingue par :

**Souveraineté des données**
- Hébergement exclusivement en France (OVHcloud, Scaleway) ou on-premise
- Aucun transfert de données hors UE
- Chiffrement AES-256 au repos, TLS 1.3 en transit
- Isolation des tenants (VPC dédié, base de données séparée)
- Logs d'audit complets et exportables (SIEM compatible)

**Conformité certifiée**
- **SOC 2 Type II** : Audit annuel par Deloitte (rapport disponible sous NDA)
- **RGPD** : DPA (Data Processing Agreement) standard conforme aux CCT
- **HDS** : Certification en cours (livraison prévue Q2 2026)
- **AI Act** : Classification des risques intégrée, documentation de transparence
- **ISO 27001** : Certification prévue Q3 2026

**Contrôle granulaire**
- RBAC (Role-Based Access Control) avec rôles personnalisables
- Politiques de rétention des données configurables par tenant
- Filtrage de contenu paramétrable (PII detection, guardrails)
- Approbation des modèles LLM par l'administrateur
- Journal d'audit de toutes les interactions IA

---

## 3. Architecture de Déploiement

### Option 1 : Cloud dédié (recommandé)

```
Client VPN / ExpressRoute
         |
    [Load Balancer]
         |
    [VPC Dédié - OVHcloud FR]
    +---------------------------+
    | ModularMind Engine        |
    | ModularMind Platform      |
    | PostgreSQL (dédié)        |
    | Redis (dédié)             |
    | Qdrant (dédié)            |
    | Ollama (GPU dédié)        |
    +---------------------------+
         |
    [API Gateway + WAF]
         |
    Réseau client (SSO/SAML)
```

- Environnement totalement isolé
- Performance garantie (pas de contention avec d'autres tenants)
- Backup quotidien avec rétention 90 jours
- PRA/PCA avec RPO < 1h, RTO < 4h

### Option 2 : On-premise / Cloud privé du client

ModularMind peut être déployé dans l'infrastructure du client :

- Livraison sous forme de conteneurs Docker / Helm charts Kubernetes
- Compatible avec les clouds privés (OpenStack, VMware) et publics (AWS, GCP, Azure)
- Support de l'installation par l'équipe ModularMind (forfait d'accompagnement)
- Mises à jour livrées sous forme de releases semestrielles avec release notes détaillées
- Contrat de maintenance et support séparé

### Intégration SSO / SAML

| Protocole | Fournisseurs testés |
|-----------|-------------------|
| SAML 2.0 | Microsoft Entra ID, Okta, OneLogin, PingFederate |
| OIDC | Keycloak, Auth0, Google Workspace |
| SCIM 2.0 | Provisioning automatique des utilisateurs |
| LDAP | Active Directory (via bridge SAML) |

---

## 4. Programme Pilote

Nous recommandons systématiquement une approche par **pilote** pour les grands comptes. Le programme standard :

### Phase 1 — Cadrage (2 semaines)

- Atelier de cadrage avec les parties prenantes (DSI, métier, RSSI, DPO)
- Identification de 2-3 cas d'usage prioritaires
- Définition des critères de succès et des KPI
- Revue de sécurité préliminaire (questionnaire de sécurité, DPIA)
- Livrable : Note de cadrage validée

### Phase 2 — Pilote technique (6-8 semaines)

- Déploiement d'un environnement dédié
- Configuration des agents IA pour les cas d'usage identifiés
- Intégration SSO et connecteurs SI
- Ingestion des documents pour le RAG
- Formation des utilisateurs pilotes (20-50 personnes)
- Support dédié pendant toute la durée du pilote

### Phase 3 — Bilan et décision (2 semaines)

- Analyse des métriques d'usage et de performance
- Recueil du feedback utilisateurs (NPS, entretiens)
- Calcul du ROI constaté vs. prévisionnel
- Recommandation de déploiement (go / no-go / ajustements)
- Proposition commerciale pour le déploiement à l'échelle

**Coût du pilote :** 15 000 euros HT (forfait tout compris : infrastructure, configuration, formation, support). Ce montant est **déduit du premier abonnement annuel** en cas de signature.

---

## 5. SLA et Support Enterprise

### Niveaux de service garantis

| Indicateur | SLA Standard | SLA Premium |
|-----------|-------------|-------------|
| Disponibilité plateforme | 99,95 % | 99,99 % |
| Temps de réponse P1 (service indisponible) | < 30 min | < 15 min |
| Temps de réponse P2 (fonctionnalité dégradée) | < 2h | < 1h |
| Temps de réponse P3 (question / demande) | < 8h ouvrées | < 4h ouvrées |
| Temps de résolution P1 | < 4h | < 2h |
| Fenêtre de maintenance | Dimanche 2h-6h | Planifiée 2 semaines à l'avance |
| Pénalités (crédit de service) | 10 % / tranche de 0,1 % sous SLA | 15 % / tranche de 0,05 % sous SLA |

### Accompagnement dédié

- **Account Manager** : Point de contact commercial unique, revue trimestrielle
- **Technical Account Manager (TAM)** : Point de contact technique, revue mensuelle, assistance à l'intégration
- **Comité de pilotage** : Réunion trimestrielle avec les parties prenantes (DSI, métier, ModularMind)
- **Canal Slack dédié** : Communication directe avec l'équipe Engineering ModularMind
- **Roadmap partagée** : Visibilité sur les évolutions produit, possibilité de remonter des demandes de fonctionnalités prioritaires

---

## 6. Intégrations et API

### API REST documentée

- API RESTful complète (OpenAPI 3.1)
- Authentification par clé API + JWT
- Rate limiting configurable par tenant
- Webhooks pour les événements (exécution terminée, agent mis à jour, etc.)
- SDK disponibles : Python, TypeScript/JavaScript

### Connecteurs pré-construits (via MCP Tools)

| Catégorie | Outils supportés |
|-----------|-----------------|
| CRM | Salesforce, HubSpot, Pipedrive |
| Support | Zendesk, Freshdesk, Intercom |
| GED | SharePoint, Google Drive, Notion |
| SIRH | Workday, BambooHR, Payfit |
| Communication | Slack, Microsoft Teams, email (SMTP) |
| Base de données | PostgreSQL, MySQL, MongoDB, Elasticsearch |
| BI | Tableau, Power BI, Metabase |

### Développement de connecteurs custom

L'équipe ModularMind peut développer des connecteurs personnalisés pour les systèmes propriétaires du client. Tarification au forfait selon la complexité (à partir de 5 000 euros par connecteur).

---

## 7. Références et Témoignages

### Secteur Banque / Assurance

> "ModularMind nous a permis de déployer des agents IA conformes à nos exigences réglementaires (DORA, RGPD) en moins de 3 mois. La mémoire contextuelle et le RAG sur nos procédures internes ont transformé la productivité de nos équipes conformité."
> — Directeur Innovation, banque régionale (350 collaborateurs)

### Secteur Industrie

> "Le déploiement on-premise était un prérequis absolu pour nous. L'équipe ModularMind a installé la plateforme sur notre cluster Kubernetes en 2 semaines. Les agents IA analysent désormais nos rapports de maintenance et anticipent les pannes."
> — DSI, groupe industriel (2 000 collaborateurs)

### Secteur Public

> "La souveraineté des données et l'hébergement en France étaient des conditions sine qua non. ModularMind cochait toutes les cases. Le programme pilote nous a convaincus en 6 semaines."
> — Responsable Transformation Digitale, collectivité territoriale

---

## 8. Processus de Vente Grands Comptes

1. **Qualification** (1-2 semaines) : Identification des interlocuteurs, compréhension du contexte, qualification BANT
2. **Présentation exécutive** (1h) : Vision, démo stratégique, Q&A
3. **Atelier technique** (2h) : Revue d'architecture, intégration SI, sécurité
4. **Réponse à RFP** (si applicable, 2-3 semaines)
5. **Programme pilote** (8-12 semaines)
6. **Négociation contractuelle** (2-4 semaines) : Conditions commerciales, SLA, DPA
7. **Déploiement à l'échelle** (4-8 semaines)

**Cycle de vente moyen : 4-6 mois.**

---

*Document confidentiel — usage interne grands comptes uniquement. Contact : Philippe Girard, VP Sales (`philippe.girard@modularmind.fr`).*
