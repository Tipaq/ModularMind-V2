# Modèle de Proposition Commerciale

**Document type — à personnaliser pour chaque prospect**
**Version :** 1.3
**Dernière mise à jour :** Janvier 2026

---

# Proposition Commerciale

## ModularMind — Plateforme d'Orchestration d'Agents IA

**Préparée pour :** [Nom de l'entreprise cliente]
**Préparée par :** [Nom du commercial], Account Executive — ModularMind SAS
**Date :** [JJ/MM/AAAA]
**Validité :** 30 jours à compter de la date d'émission
**Référence :** PROP-[AAAA]-[NNN]

---

## 1. Résumé Exécutif

ModularMind est la plateforme d'orchestration d'agents IA la plus complète du marché européen. Elle permet aux entreprises de centraliser, déployer et superviser des agents intelligents multi-modèles avec mémoire persistante, RAG (Retrieval-Augmented Generation) et workflows visuels.

Cette proposition détaille notre compréhension de vos besoins, la solution que nous recommandons, le planning de déploiement et les conditions commerciales associées.

**Points clés de notre proposition :**

- Déploiement de [X] agents IA spécialisés pour [cas d'usage identifiés]
- Intégration native avec votre SI existant ([outils identifiés])
- Hébergement souverain en France, conforme RGPD
- Accompagnement complet : formation, support dédié, Customer Success Manager
- ROI estimé : [X]x sur la première année

---

## 2. Analyse des Besoins

*[Section à personnaliser intégralement sur la base des entretiens de découverte]*

### 2.1 Contexte de l'entreprise

[Nom de l'entreprise] est un acteur [secteur] de [taille] collaborateurs, basé à [localisation]. L'entreprise opère dans un contexte de [transformation digitale / croissance / optimisation des processus] et souhaite tirer parti de l'intelligence artificielle pour [objectifs stratégiques].

### 2.2 Problématiques identifiées

Au cours de nos échanges du [date(s) des réunions], nous avons identifié les problématiques suivantes :

1. **[Problématique 1]** : [Description détaillée, impact quantifié si possible]
   - Impact estimé : [X] heures/mois perdues, [X] euros de coût indirect

2. **[Problématique 2]** : [Description détaillée]
   - Impact estimé : [X] tickets/mois non résolus en première intention

3. **[Problématique 3]** : [Description détaillée]
   - Impact estimé : [X] jours de délai dans le processus [Y]

### 2.3 Exigences clés

- Sécurité : [exigences spécifiques — RGPD, SOC 2, chiffrement, etc.]
- Intégration : [systèmes existants à connecter — CRM, GED, etc.]
- Volume : [nombre d'utilisateurs, volume de documents, fréquence d'usage]
- Délai : [date cible de mise en production]

---

## 3. Solution Proposée

### 3.1 Architecture recommandée

Nous recommandons le déploiement de ModularMind en formule **[Pro / Enterprise]** avec l'architecture suivante :

**Environnement :** [Cloud dédié (OVHcloud, région Paris) / On-premise]

**Agents IA proposés :**

| Agent | Cas d'usage | Modèle LLM recommandé | Connecteurs |
|-------|------------|----------------------|-------------|
| [Agent 1] | [Description] | [GPT-4o / Claude 3.5 / Mistral] | [Outils] |
| [Agent 2] | [Description] | [Modèle] | [Outils] |
| [Agent 3] | [Description] | [Modèle] | [Outils] |

**RAG — Base de connaissances :**

| Source documentaire | Volume estimé | Fréquence de mise à jour |
|--------------------|--------------|-------------------------|
| [Documents internes] | [X] Go | [Quotidienne / hebdomadaire] |
| [Base de connaissances] | [X] Go | [En continu] |
| [FAQ / Procédures] | [X] Mo | [Mensuelle] |

**Intégrations :**

| Système | Type d'intégration | Connecteur |
|---------|-------------------|------------|
| [SSO - Microsoft Entra ID] | Authentification | SAML 2.0 |
| [CRM - Salesforce] | Lecture/écriture | MCP Tool Salesforce |
| [GED - SharePoint] | Lecture (RAG) | MCP Tool SharePoint |

### 3.2 Mémoire et contexte

ModularMind exploitera sa mémoire persistante pour :

- Retenir les faits importants extraits des conversations (préférences, décisions, contacts)
- Maintenir un historique contextuel par utilisateur et par projet
- Enrichir automatiquement la base de connaissances à partir des interactions

### 3.3 Sécurité et gouvernance

- RBAC avec [X] rôles définis selon votre matrice de droits
- Audit logs complets, rétention [X] mois, export compatible [SIEM du client]
- Chiffrement AES-256 au repos, TLS 1.3 en transit
- Filtrage PII configurable sur les données sensibles
- DPA (Data Processing Agreement) conforme aux CCT européennes

---

## 4. Planning de Déploiement

### Phase 1 — Initialisation (Semaines 1-2)

| Livrable | Responsable | Durée |
|----------|------------|-------|
| Kick-off projet | ModularMind + Client | 2h |
| Provisioning de l'environnement | ModularMind | 2 jours |
| Configuration SSO/SAML | ModularMind + Client IT | 1 jour |
| Atelier de design des agents | ModularMind + Client métier | 4h |

### Phase 2 — Configuration (Semaines 3-5)

| Livrable | Responsable | Durée |
|----------|------------|-------|
| Configuration des agents IA | ModularMind | 1 semaine |
| Ingestion des documents RAG | ModularMind + Client | 3 jours |
| Développement des connecteurs MCP | ModularMind | 1 semaine |
| Tests d'intégration | ModularMind + Client IT | 3 jours |
| Recette fonctionnelle | Client métier | 3 jours |

### Phase 3 — Déploiement (Semaines 6-7)

| Livrable | Responsable | Durée |
|----------|------------|-------|
| Formation administrateurs (1 session) | ModularMind | 4h |
| Formation utilisateurs (2 sessions) | ModularMind | 2 x 2h |
| Déploiement pilote (groupe restreint) | ModularMind | 3 jours |
| Go-live production | ModularMind + Client | 1 jour |

### Phase 4 — Hypercare (Semaines 8-11)

| Livrable | Responsable | Durée |
|----------|------------|-------|
| Support renforcé post-déploiement | ModularMind | 4 semaines |
| Ajustements des agents | ModularMind | En continu |
| Bilan de déploiement | ModularMind + Client | 2h |
| Transition vers le support standard | ModularMind | 1 jour |

**Durée totale estimée : 10-12 semaines** de la signature à la mise en production complète.

---

## 5. Détail Tarifaire

### 5.1 Abonnement plateforme

| Élément | Quantité | Prix unitaire | Total annuel HT |
|---------|---------|--------------|----------------|
| Licence ModularMind [Pro/Enterprise] | [X] utilisateurs | [X] euros/user/mois | [X] euros |
| Add-on : Pack modèles premium | [X] utilisateurs | 15 euros/user/mois | [X] euros |
| Add-on : Stockage vectoriel suppl. | [X] Go | 20 euros/Go/mois | [X] euros |
| Add-on : Support [Business/Premium] | 1 | [X] euros/mois | [X] euros |
| **Sous-total abonnement annuel** | | | **[X] euros HT** |

### 5.2 Prestations de services (one-shot)

| Prestation | Quantité | Prix unitaire | Total HT |
|-----------|---------|--------------|---------|
| Forfait déploiement et configuration | 1 | [X] euros | [X] euros |
| Développement connecteurs MCP custom | [X] connecteurs | 5 000 euros/connecteur | [X] euros |
| Formation administrateurs (1 session) | 1 | 1 500 euros | 1 500 euros |
| Formation utilisateurs (2 sessions) | 2 | 800 euros | 1 600 euros |
| **Sous-total prestations** | | | **[X] euros HT** |

### 5.3 Récapitulatif

| Poste | Montant HT |
|-------|-----------|
| Abonnement annuel | [X] euros |
| Prestations de déploiement | [X] euros |
| **Total Année 1** | **[X] euros HT** |
| **Total Année 2+** (renouvellement) | **[X] euros HT** |

*TVA en sus au taux en vigueur (20 %). Remise volume de [X] % appliquée.*

---

## 6. Conditions Générales

### Durée et renouvellement

- Engagement initial de **12 mois** à compter de la date de signature
- Renouvellement automatique par tacite reconduction pour des périodes successives de 12 mois
- Résiliation possible avec un préavis de **60 jours** avant la date d'échéance

### Facturation et paiement

- Abonnement : facturation annuelle ou trimestrielle, payable à 30 jours nets
- Prestations : facturation à la livraison de chaque phase, payable à 30 jours nets
- Mode de paiement : virement bancaire (SEPA) ou prélèvement automatique

### Garanties

- SLA de disponibilité : [99,9 % / 99,95 %] avec pénalités en cas de manquement
- Garantie de réversibilité : export complet des données dans un format standard (JSON, CSV) sous 30 jours en fin de contrat
- Confidentialité : NDA réciproque inclus dans les conditions générales
- DPA : Data Processing Agreement conforme RGPD, annexé au contrat

### Propriété des données

- Les données du client restent la propriété exclusive du client
- ModularMind n'utilise en aucun cas les données du client pour entraîner des modèles ou à des fins autres que la fourniture du service
- Droit à l'effacement exercable à tout moment

### Évolution tarifaire

- Les prix sont garantis pour la durée de l'engagement initial
- Toute évolution tarifaire sera notifiée 90 jours avant la date de renouvellement
- L'augmentation annuelle est plafonnée à l'indice Syntec + 3 %

---

## 7. SLA Détaillé

*[Insérer le tableau SLA correspondant au niveau de support choisi — voir grille tarifaire]*

| Priorité | Description | Temps de réponse | Temps de résolution |
|----------|-------------|-----------------|-------------------|
| P1 — Critique | Service indisponible | < [X] min | < [X] h |
| P2 — Majeur | Fonctionnalité majeure dégradée | < [X] h | < [X] h |
| P3 — Mineur | Question, demande d'assistance | < [X] h ouvrées | Best effort |
| P4 — Évolution | Demande de fonctionnalité | Accusé réception < 5 jours | Roadmap |

---

## 8. Prochaines Étapes

1. **Validation de la proposition** par vos équipes
2. **Réunion de clarification** (si questions ou ajustements nécessaires)
3. **Signature du contrat** et du DPA
4. **Kick-off projet** dans les 5 jours ouvrés suivant la signature

Nous restons à votre entière disposition pour toute question ou précision.

---

**ModularMind SAS**
42 rue de la Boétie, 75008 Paris
SIRET : 912 345 678 00015 — RCS Paris
TVA intracommunautaire : FR 82 912345678

**Contact commercial :**
[Nom du commercial]
[Email]
[Téléphone]

---

*Ce document constitue une proposition commerciale non contractuelle. Les conditions définitives seront formalisées dans le contrat de service. Proposition valable 30 jours.*
