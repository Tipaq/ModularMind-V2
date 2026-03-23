# Formation : Prompt Engineering Avancé

**Code formation :** FORM-PE-201
**Durée :** 1 jour (7 heures)
**Niveau :** Intermédiaire à avancé
**Prérequis :** Formation FORM-IAG-101 ou expérience équivalente avec les LLM
**Formateur :** Emilie Fontaine (EM Squad AI Engine) ou un Senior Engineer de la Squad AI
**Dernière mise à jour :** Février 2026

---

## 1. Objectifs de la Formation

À l'issue de cette formation, les participants seront capables de :

- Concevoir des system prompts robustes et maintenables pour les agents ModularMind
- Appliquer les techniques avancées de prompting (few-shot, chain-of-thought, structured output)
- Maîtriser les patterns de tool use (appel d'outils par le LLM) dans le contexte ModularMind
- Évaluer la qualité des réponses d'un agent et itérer de manière méthodique
- Éviter les pièges courants (prompt injection, hallucinations, dérives de comportement)
- Optimiser les coûts (réduction de tokens) sans sacrifier la qualité

---

## 2. Programme Détaillé

### Module 1 : Anatomie d'un System Prompt Professionnel (1h30)

**Contenu :**

Un system prompt bien structuré est la clé d'un agent IA performant. Chez ModularMind, nous recommandons la structure suivante :

```
## Identité
[Qui est l'agent, son rôle, son expertise]

## Contexte
[L'entreprise, le domaine, les contraintes métier]

## Instructions
[Ce que l'agent doit faire, étape par étape]

## Contraintes
[Ce que l'agent ne doit PAS faire, limites, garde-fous]

## Format de réponse
[Structure attendue, longueur, ton, langue]

## Exemples (optionnel)
[Exemples de questions/réponses attendues]
```

**Bonnes pratiques :**
- Utiliser des délimiteurs clairs (##, ---, ```) pour séparer les sections
- Être spécifique plutôt que générique ("Réponds en 3 paragraphes maximum" vs "Sois concis")
- Anticiper les cas limites ("Si la question n'est pas liée au support, réponds poliment que tu ne peux pas aider")
- Tester le prompt avec des questions adversariales avant de le mettre en production
- Versionner les prompts comme du code (GitLab, commentaires de changement)

**Anti-patterns courants :**
- Le "prompt fleuve" : trop long, trop détaillé, le modèle se perd dans les instructions
- Le prompt contradictoire : "Sois bref mais exhaustif" — instructions mutuellement exclusives
- Le prompt sans contraintes : l'agent peut dériver vers des sujets non pertinents
- Le prompt non testé : mis en production sans vérification sur des cas réels

**Exercice (30 min) :** Rédiger un system prompt complet pour un agent de qualification de leads commerciaux chez ModularMind. Critères : identité, instructions de qualification (BANT), format de sortie (JSON structuré), contraintes (pas de promesses de prix, redirection vers le commercial pour les questions techniques).

---

### Module 2 : Few-Shot Learning Avancé (1h)

**Contenu :**

Le few-shot learning consiste à fournir des exemples de entrées/sorties attendues dans le prompt pour guider le comportement du modèle. C'est l'une des techniques les plus efficaces pour obtenir un format et un ton cohérents.

**Techniques :**

1. **Few-shot basique** : 2-5 exemples dans le system prompt
   ```
   Exemple 1:
   Q: "Quel est le prix de ModularMind Pro ?"
   R: "Le plan Pro est à 79 euros/mois par utilisateur en engagement annuel..."

   Exemple 2:
   Q: "Est-ce que ModularMind est RGPD compliant ?"
   R: "Absolument. ModularMind est hébergé en France..."
   ```

2. **Few-shot dynamique** : Les exemples sont sélectionnés dynamiquement depuis une base de données en fonction de la question de l'utilisateur (via recherche sémantique). C'est l'approche utilisée par ModularMind quand le RAG est activé avec des exemples de Q&A.

3. **Few-shot négatif** : Montrer des exemples de ce que le modèle ne doit PAS faire
   ```
   MAUVAIS EXEMPLE (ne pas reproduire):
   Q: "Quel est le prix ?"
   R: "Je ne sais pas, consultez notre site web."

   BON EXEMPLE:
   Q: "Quel est le prix ?"
   R: "Le plan Pro est à 79 euros/mois par utilisateur..."
   ```

4. **Few-shot avec chaîne de raisonnement** : Les exemples incluent le processus de réflexion, pas seulement la réponse finale

**Conseils d'optimisation :**
- 3 à 5 exemples suffisent généralement (au-delà, le gain marginal diminue)
- Varier les exemples pour couvrir les cas d'usage principaux
- Inclure au moins un exemple de cas limite ("je ne sais pas" / "hors périmètre")
- Surveiller le nombre de tokens : chaque exemple consomme des tokens du contexte

**Exercice (20 min) :** Créer un set de 4 exemples few-shot pour un agent de classification de tickets de support (catégories : technique, facturation, fonctionnalité, feedback).

---

### Module 3 : Chain-of-Thought et Raisonnement Structuré (1h)

**Contenu :**

Le chain-of-thought (CoT) est une technique qui demande au modèle d'expliciter son raisonnement avant de donner sa réponse finale. Cela améliore significativement la qualité sur les tâches nécessitant une analyse ou un raisonnement multi-étapes.

**Variantes :**

1. **CoT explicite** : "Explique ton raisonnement étape par étape avant de donner ta réponse"
2. **CoT structuré** : Définir les étapes de raisonnement dans le prompt
   ```
   Pour chaque question, suis ce processus :
   1. ANALYSE : Identifie le sujet principal et le type de question
   2. RECHERCHE : Utilise les documents disponibles (RAG) pour trouver l'information
   3. SYNTHÈSE : Formule une réponse claire en t'appuyant sur les sources
   4. VÉRIFICATION : Vérifie que ta réponse est factuelle et complète
   5. RÉPONSE : Donne ta réponse finale
   ```
3. **ReAct (Reasoning + Acting)** : Le modèle alterne entre réflexion et action (appel d'outils)
   ```
   Pensée: L'utilisateur demande le statut de sa commande. Je dois utiliser l'outil CRM.
   Action: search_crm(customer_email="client@example.com")
   Observation: Commande #12345, statut: expédiée, livraison prévue le 15 mars.
   Réponse: Votre commande #12345 a été expédiée et sera livrée le 15 mars.
   ```

**Quand utiliser le CoT :**
- Analyse de documents complexes (contrats, rapports techniques)
- Prise de décision multi-critères (qualification de leads, triage de tickets)
- Tâches mathématiques ou logiques
- Diagnostic de problèmes techniques

**Quand NE PAS utiliser le CoT :**
- Questions factuelles simples (le CoT ajoute de la latence et des tokens inutiles)
- Conversations informelles
- Tâches de génération créative (le raisonnement peut brider la créativité)

**Exercice (30 min) :** Implémenter un agent de diagnostic technique dans ModularMind utilisant le CoT structuré. Le processus : identifier le symptôme, lister les causes possibles, poser des questions de clarification, proposer une solution.

---

### Module 4 : Structured Outputs (1h)

**Contenu :**

Les structured outputs permettent de contraindre le LLM à répondre dans un format précis (JSON, XML, Markdown structuré, tableaux). C'est essentiel pour l'intégration des agents avec d'autres systèmes.

**Techniques dans ModularMind :**

1. **Instruction dans le prompt** :
   ```
   Réponds UNIQUEMENT en JSON valide avec la structure suivante :
   {
     "intent": "support|billing|feature|other",
     "urgency": "low|medium|high",
     "summary": "résumé en une phrase",
     "suggested_action": "description de l'action recommandée"
   }
   ```

2. **JSON Mode** (supporté par OpenAI, Anthropic) : Forcer le modèle à retourner du JSON valide via le paramètre `response_format`

3. **Function calling / Tool use** : Déclarer des schémas de fonctions que le modèle peut appeler avec des paramètres structurés

4. **Pydantic validation** : Dans le pipeline ModularMind, valider la sortie du LLM contre un schéma Pydantic et relancer si le format est invalide

**Exercice (20 min) :** Configurer un agent ModularMind qui analyse un e-mail entrant et retourne un JSON structuré (expéditeur, sujet, sentiment, priorité, actions suggérées).

---

### Module 5 : Tool Use et MCP (1h)

**Contenu :**

Le tool use permet aux agents de réaliser des actions concrètes : interroger une base de données, envoyer un e-mail, créer un ticket, consulter une API externe.

**Architecture dans ModularMind :**

```
Utilisateur -> Agent -> LLM décide d'utiliser un outil -> MCP Tool exécute l'action -> Résultat renvoyé au LLM -> Réponse à l'utilisateur
```

**MCP Tools dans ModularMind :**
- Le Model Context Protocol (MCP) standardise la façon dont les LLM interagissent avec les outils
- Chaque outil est décrit par un schéma (nom, description, paramètres)
- Le LLM choisit quel outil utiliser et avec quels paramètres
- ModularMind gère l'exécution sécurisée via des sidecars isolés

**Bonnes pratiques pour le tool use :**
- Décrire chaque outil avec précision dans le prompt (le LLM doit comprendre QUAND l'utiliser)
- Limiter le nombre d'outils disponibles (5-10 max, sinon le LLM se perd)
- Prévoir des cas d'erreur ("Si l'outil retourne une erreur, informe l'utilisateur et propose une alternative")
- Tester les edge cases : que se passe-t-il si l'outil est lent ? Si les paramètres sont invalides ?

**Exercice (30 min) :** Créer un agent dans ModularMind avec 3 outils MCP : recherche CRM, création de ticket, envoi d'e-mail. Tester le comportement de l'agent face à différents scénarios.

---

### Module 6 : Évaluation et Itération (1h)

**Contenu :**

**Métriques d'évaluation :**
- **Précision** : La réponse est-elle factuellement correcte ?
- **Pertinence** : La réponse adresse-t-elle bien la question posée ?
- **Complétude** : Toutes les informations nécessaires sont-elles présentes ?
- **Format** : La réponse respecte-t-elle le format demandé ?
- **Ton** : La réponse est-elle dans le ton attendu (professionnel, amical, technique) ?
- **Latence** : Le temps de réponse est-il acceptable ?
- **Coût** : Le nombre de tokens consommés est-il optimisé ?

**Processus d'itération :**
1. Définir un jeu de tests (20-50 questions représentatives)
2. Exécuter les tests et scorer chaque réponse (manuellement ou avec un LLM évaluateur)
3. Identifier les patterns d'échec (catégoriser les mauvaises réponses)
4. Ajuster le prompt ou la configuration de l'agent
5. Ré-exécuter les tests et comparer
6. Répéter jusqu'à atteindre le score cible

**LLM as Judge :**
- Utiliser un LLM (souvent GPT-4 ou Claude Opus) pour évaluer automatiquement les réponses d'un agent
- Définir une grille d'évaluation structurée
- Utile pour l'évaluation à grande échelle, mais vérifier la cohérence avec l'évaluation humaine

**Exercice final (30 min) :** Évaluer l'agent créé dans le Module 5 contre un jeu de 10 questions de test. Identifier les faiblesses. Itérer sur le prompt pour améliorer le score.

---

## 3. Ressources Complémentaires

- **Anthropic Prompt Engineering Guide** : documentation officielle des bonnes pratiques pour Claude
- **OpenAI Cookbook** : exemples de prompts et techniques avancées
- **Prompt Engineering Guide (DAIR.AI)** : référence académique et pratique
- **Base de prompts ModularMind** : Notion > Engineering > AI Engine > Prompts Library
- **Collection de system prompts internes** : GitLab > modularmind/prompts (exemples production)

---

## 4. Évaluation

- Évaluation continue pendant les exercices pratiques
- Projet final : Conception d'un agent complet (system prompt + few-shot + tool use + structured output) pour un cas d'usage réel de l'entreprise du participant
- Restitution de 10 minutes devant le groupe
- Attestation de compétence délivrée

---

*Formation disponible en interne (gratuite, sur le temps de travail) et en prestation externe pour les clients ModularMind (2 000 euros HT/session). Inscription : `formation@modularmind.fr`.*
