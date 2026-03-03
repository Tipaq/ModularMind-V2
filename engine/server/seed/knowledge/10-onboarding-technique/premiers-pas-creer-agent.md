# Premiers pas — Créer un agent ModularMind

## Objectif

Ce tutoriel vous guide pas à pas dans la création de votre premier agent IA avec ModularMind. À la fin, vous aurez un agent fonctionnel capable de répondre aux questions en utilisant une base de connaissances.

## Prérequis

- Environnement de développement configuré (voir guide de setup)
- Services lancés localement (Engine, Worker, Chat, Ops)
- Au moins un modèle Ollama téléchargé (`llama3.1:8b`)

## Étape 1 : Se connecter à la console Ops

1. Ouvrez http://localhost:5174
2. Connectez-vous avec `admin@modularmind.io` / `changeme`
3. Vous arrivez sur le dashboard principal

## Étape 2 : Créer une collection RAG

Avant de créer l'agent, préparons une base de connaissances :

1. Naviguez vers **Base de connaissances** dans le menu
2. Cliquez sur **"+ Nouvelle collection"**
3. Remplissez :
   - Nom : "Documentation Test"
   - Description : "Collection de test pour l'onboarding"
   - Scope : Global
4. Cliquez **Créer**
5. Dans la collection, cliquez **"+ Uploader un document"**
6. Sélectionnez un fichier Markdown de la documentation (ex: `guide-demarrage-rapide.md`)
7. Attendez que le statut passe à "Prêt" (quelques secondes pour un petit fichier)

## Étape 3 : Créer l'agent

1. Naviguez vers **Agents** dans le menu
2. Cliquez sur **"+ Nouvel agent"**
3. Remplissez le formulaire :

**Informations de base :**
- Nom : "Mon Premier Agent"
- Description : "Agent de test créé pendant l'onboarding"

**Configuration du modèle :**
- Provider : Ollama
- Modèle : llama3.1:8b
- Température : 0.5 (bon équilibre créativité/précision)
- Max tokens : 1024

**Prompt système :**
```
Tu es un assistant technique pour ModularMind. Tu réponds aux questions en utilisant le contexte fourni par la base de connaissances. Si tu ne trouves pas l'information dans le contexte, dis-le honnêtement. Réponds en français de manière claire et concise.
```

**Base de connaissances :**
- Sélectionnez la collection "Documentation Test"
- Seuil de pertinence : 0.7
- Nombre de résultats : 5

4. Cliquez **Sauvegarder**
5. Cliquez **Activer** pour rendre l'agent disponible

## Étape 4 : Tester l'agent

1. Ouvrez l'interface Chat : http://localhost:5173
2. Connectez-vous
3. Cliquez **"+ Nouvelle conversation"**
4. Sélectionnez "Mon Premier Agent"
5. Testez avec ces messages :
   - "Comment installer ModularMind ?"
   - "Quels sont les prérequis ?"
   - "Comment configurer les variables d'environnement ?"
6. Observez :
   - Le streaming SSE (tokens qui s'affichent progressivement)
   - Les sources RAG citées en bas de chaque réponse
   - La qualité des réponses basées sur le document uploadé

## Étape 5 : Itérer

Expérimentez avec :
- **Température** : 0.1 (très factuel) vs 0.9 (très créatif)
- **Prompt système** : Ajoutez des contraintes ou un ton différent
- **Plus de documents** : Uploadez d'autres fichiers dans la collection
- **Autre modèle** : Essayez avec `mistral:7b` ou `gpt-4o-mini` (si API key configurée)

## Félicitations !

Vous avez créé votre premier agent ModularMind. Pour aller plus loin :
- Explorez l'éditeur de graphes pour créer des workflows multi-étapes
- Activez le système de mémoire pour que l'agent se souvienne des conversations
- Connectez des outils MCP pour donner des capacités supplémentaires à l'agent