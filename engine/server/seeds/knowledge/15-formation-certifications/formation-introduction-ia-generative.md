# Formation : Introduction à l'IA Générative

**Code formation :** FORM-IAG-101
**Durée :** 2 jours (14 heures)
**Niveau :** Débutant à intermédiaire
**Prérequis :** Aucun (connaissances de base en informatique souhaitées)
**Formateur :** Antoine Nguyen (CTO) ou Emilie Fontaine (EM Squad AI Engine)
**Dernière mise à jour :** Janvier 2026

---

## 1. Objectifs de la Formation

À l'issue de cette formation, les participants seront capables de :

- Comprendre les principes fondamentaux de l'IA générative et des grands modèles de langage (LLM)
- Expliquer les concepts de tokenization, embeddings, attention et fine-tuning
- Différencier les principaux modèles du marché (GPT-4, Claude, Mistral, Llama) et leurs cas d'usage
- Rédiger des prompts efficaces pour obtenir des résultats pertinents
- Identifier les limites et les risques de l'IA générative (hallucinations, biais, confidentialité)
- Utiliser la plateforme ModularMind pour créer et configurer un agent IA basique

---

## 2. Programme Détaillé

### Jour 1 — Fondamentaux de l'IA Générative

#### Module 1 : Contexte et histoire (1h30)

**Contenu :**
- L'intelligence artificielle : de l'IA symbolique au deep learning
- La révolution des Transformers (2017) : l'architecture qui a tout changé
- Chronologie des LLM : GPT-1 (2018), GPT-3 (2020), ChatGPT (2022), GPT-4 (2023), Claude 3 (2024)
- Le paysage actuel : modèles propriétaires vs open source, cloud vs local
- Les enjeux sociétaux : emploi, éducation, créativité, réglementation (AI Act européen)

**Exercice :** Quiz interactif sur les jalons clés de l'IA générative

#### Module 2 : Comment fonctionne un LLM (2h)

**Contenu :**
- Le concept de réseau de neurones (explication simplifiée, pas de mathématiques)
- L'architecture Transformer : attention, couches, paramètres
- Le processus d'entraînement : pré-training sur des corpus massifs, puis alignement (RLHF)
- La prédiction du prochain token : comment un LLM "pense"
- La fenêtre de contexte : pourquoi un LLM a une mémoire limitée (4K, 32K, 128K, 200K tokens)
- La température et le sampling : contrôler la créativité du modèle

**Démonstration :** Visualisation interactive du processus de génération token par token avec ModularMind (mode debug activé)

#### Module 3 : Tokenization et Embeddings (2h)

**Contenu :**

**Tokenization :**
- Qu'est-ce qu'un token ? (sous-mots, pas des mots entiers)
- Les algorithmes de tokenization : BPE (Byte-Pair Encoding), SentencePiece, tiktoken
- Impact de la tokenization sur les coûts (facturation au token chez OpenAI, Anthropic)
- Différences de tokenization entre modèles (GPT-4 vs Claude vs Mistral)
- Exercice pratique : compter les tokens d'un texte avec le tokenizer OpenAI

**Embeddings :**
- Qu'est-ce qu'un embedding ? Représentation vectorielle du sens
- L'espace vectoriel : mots proches sémantiquement = vecteurs proches géométriquement
- Les modèles d'embedding : OpenAI text-embedding-3, Cohere, modèles open source (BGE, E5)
- Applications : recherche sémantique, classification, clustering, RAG
- La distance cosinus : mesurer la similarité entre deux textes

**Exercice pratique :** Utiliser l'API d'embeddings de ModularMind pour comparer la similarité entre plusieurs textes. Visualisation 2D des vecteurs avec t-SNE.

#### Module 4 : Les modèles du marché (1h30)

**Contenu :**

| Modèle | Éditeur | Forces | Limites | Cas d'usage |
|--------|---------|--------|---------|-------------|
| GPT-4o | OpenAI | Polyvalent, multimodal (texte+image), rapide | Propriétaire, US | Usage général, analyse d'image |
| GPT-4 Turbo | OpenAI | Très capable, 128K contexte | Coûteux, lent | Tâches complexes, raisonnement |
| Claude 3.5 Sonnet | Anthropic | Excellent en rédaction et analyse, 200K contexte | Propriétaire, US | Analyse de documents longs, rédaction |
| Claude 3 Opus | Anthropic | Le plus capable pour le raisonnement | Très coûteux, lent | Tâches de réflexion approfondie |
| Mistral Large | Mistral AI | Performant, européen (Paris), ouvert | Moins polyvalent que GPT-4 | Usage général, souveraineté |
| Llama 3.1 (405B) | Meta | Open source, exécutable en local | Nécessite GPU puissant | On-premise, recherche |
| Gemini Ultra | Google | Multimodal natif, intégration Google | Écosystème Google | Analyse multimédia |

**Discussion :** Comment choisir le bon modèle pour un cas d'usage donné ? (coût, performance, confidentialité, latence)

---

### Jour 2 — De la Théorie à la Pratique

#### Module 5 : Fine-tuning et adaptation (1h30)

**Contenu :**
- Pourquoi fine-tuner un modèle ? (spécialisation, ton, format de sortie)
- Les techniques de fine-tuning :
  - Full fine-tuning : réentraîner tous les paramètres (coûteux, rarement nécessaire)
  - LoRA / QLoRA : adapter une petite fraction des paramètres (efficace, recommandé)
  - Prompt tuning : optimiser un préfixe de prompt (léger, limité)
- Les alternatives au fine-tuning :
  - RAG (Retrieval-Augmented Generation) : enrichir le contexte avec des documents
  - Few-shot learning : fournir des exemples dans le prompt
  - System prompts : instruire le modèle sur son rôle et ses contraintes
- Quand fine-tuner vs. quand utiliser le RAG ? (arbre de décision pratique)

**Démonstration :** Comparaison d'un modèle base vs. un modèle avec RAG sur un cas d'usage de support client ModularMind

#### Module 6 : Introduction au Prompt Engineering (2h)

**Contenu :**
- Les bases du prompt engineering : clarté, spécificité, contexte
- Le rôle du system prompt : donner une identité à l'IA
- Techniques fondamentales :
  - Instructions directes ("Réponds en 3 points")
  - Persona ("Tu es un expert en droit du travail français")
  - Format de sortie ("Réponds en JSON avec les champs suivants")
  - Contraintes ("Ne mentionne jamais de concurrent", "Limite ta réponse à 200 mots")
- Introduction au few-shot learning : fournir des exemples de entrée/sortie
- Introduction au chain-of-thought : "Explique ton raisonnement étape par étape"
- Les pièges courants : prompts trop vagues, instructions contradictoires, context window overflow

**Exercices pratiques (45 min) :**
1. Rédiger un system prompt pour un agent de support client ModularMind
2. Améliorer un prompt de résumé de document (itérations successives)
3. Créer un prompt few-shot pour la classification de tickets

#### Module 7 : Limites et risques (1h)

**Contenu :**
- **Hallucinations** : Quand l'IA invente des faits. Comment les détecter et les atténuer (RAG, vérification, grounding)
- **Biais** : Les LLM reproduisent les biais de leurs données d'entraînement. Exemples concrets et stratégies de mitigation
- **Confidentialité** : Risques de fuite de données personnelles ou confidentielles. Bonnes pratiques (PII filtering, modèles locaux, DPA)
- **Sécurité** : Prompt injection, jailbreaking, extraction de données. Introduction aux guardrails
- **Dépendance** : Le risque de sur-confiance dans les réponses de l'IA. L'humain doit rester dans la boucle
- **Réglementation** : AI Act européen, RGPD appliqué à l'IA, obligations de transparence

**Exercice :** Identifier les risques dans 3 scénarios d'usage réels et proposer des mesures d'atténuation

#### Module 8 : Atelier pratique avec ModularMind (2h)

**Contenu :**
- Présentation de la plateforme ModularMind (architecture, concepts clés : agents, graphes, mémoire, RAG)
- Création guidée d'un premier agent IA :
  1. Définir le cas d'usage et la persona
  2. Rédiger le system prompt
  3. Choisir le modèle LLM approprié
  4. Configurer la mémoire (activation de l'extraction de faits)
  5. Activer le RAG (upload de documents de référence)
  6. Tester et itérer sur les réponses
- Test en conditions réelles avec un jeu de questions/réponses
- Partage des résultats et discussion

---

## 3. Méthodes Pédagogiques

- **40 % théorie** (présentations, démonstrations)
- **40 % pratique** (exercices sur ModularMind, prompts, configuration d'agents)
- **20 % échanges** (discussions, Q&A, retours d'expérience)

### Supports fournis

- Slides de présentation (PDF)
- Accès à un environnement ModularMind de formation (30 jours post-formation)
- Fiches mémo : glossaire IA, aide-mémoire prompt engineering, arbre de décision modèle/RAG/fine-tuning
- Bibliographie recommandée et liens vers des ressources en ligne

---

## 4. Évaluation

- Quiz d'évaluation en fin de formation (20 questions, QCM + questions ouvertes)
- Seuil de réussite : 70 %
- Attestation de formation délivrée aux participants ayant réussi le quiz
- Enquête de satisfaction anonyme envoyée 1 semaine après la formation

---

## 5. Prochaines Sessions

| Date | Lieu | Places disponibles |
|------|------|-------------------|
| 17-18 mars 2026 | Paris (Bureau ModularMind) | 12 |
| 14-15 avril 2026 | Lyon (La Cordée) | 10 |
| 12-13 mai 2026 | Distanciel (Google Meet) | 15 |

Inscription via Payfit (catégorie "Formation interne") ou par e-mail à `formation@modularmind.fr`.

---

*Formation éligible au plan de développement des compétences (budget formation individuel de 2 000 euros). Pour les clients ModularMind, cette formation est disponible en prestation externe (voir grille tarifaire).*
