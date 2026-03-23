# Manuel utilisateur — Console d'administration (Ops)

## Présentation

La console d'administration ModularMind (Ops) est l'interface de gestion destinée aux administrateurs et opérateurs. Elle permet de configurer les agents, gérer les utilisateurs, monitorer les performances, et administrer le système.

## Accès

- **URL développement** : `http://localhost:5174`
- **URL production** : `https://ops.modularmind.io`
- **Rôles requis** : `admin` ou `operator`

## Dashboard principal

Le dashboard offre une vue d'ensemble de l'état du système :

### Métriques en temps réel

- **Conversations actives** : Nombre de conversations en cours dans les dernières 24h
- **Messages traités** : Volume de messages avec tendance (hausse/baisse)
- **Temps de réponse moyen** : Latence P50/P95/P99 des réponses agents
- **Utilisation mémoire** : Pourcentage de mémoire système utilisée
- **Files Redis** : Profondeur des streams Redis (tâches en attente)

### Graphiques

- Courbe de messages par heure (7 derniers jours)
- Répartition par agent (diagramme en anneau)
- Latence par provider LLM (barres empilées)

## Gestion des agents

### Liste des agents

Naviguez vers **Agents** dans le menu latéral pour voir tous les agents configurés :

| Colonne | Description |
|---------|-------------|
| Nom | Nom de l'agent |
| Modèle | Provider + modèle (ex: "Ollama / llama3.1:8b") |
| Statut | Actif, Inactif, Brouillon |
| Conversations | Nombre total de conversations |
| Dernière activité | Date du dernier message traité |

### Créer un agent

1. Cliquez sur **"+ Nouvel agent"**
2. Remplissez le formulaire :
   - **Nom** : Identifiant unique de l'agent
   - **Description** : But et périmètre de l'agent
   - **Modèle** : Sélectionnez le provider et le modèle LLM
   - **Prompt système** : Instructions de comportement de l'agent
   - **Température** : Créativité des réponses (0.0 = déterministe, 1.0 = créatif)
   - **Outils** : Sélectionnez les outils MCP disponibles pour l'agent
   - **Base de connaissances** : Collections RAG accessibles à l'agent
3. Cliquez sur **Sauvegarder** puis **Activer**

### Modifier un agent

- Les modifications d'un agent actif prennent effet immédiatement
- Les conversations en cours ne sont pas interrompues
- L'historique des modifications est conservé pour audit

## Éditeur de graphes

L'éditeur visuel permet de créer des workflows multi-étapes pour les agents :

### Types de nœuds

- **LLM Node** : Appel à un modèle de langage
- **Tool Node** : Exécution d'un outil MCP
- **Condition Node** : Branchement conditionnel basé sur le contenu
- **Router Node** : Routage vers différents chemins selon des critères
- **Memory Node** : Lecture/écriture dans le système de mémoire
- **RAG Node** : Recherche dans la base de connaissances

### Connexions

- Glissez depuis le port de sortie d'un nœud vers le port d'entrée d'un autre
- Les connexions conditionnelles sont colorées selon le critère (vert = vrai, rouge = faux)
- Double-cliquez sur une connexion pour ajouter une transformation de données

## Monitoring

### Onglet Performances

- **Latence par endpoint** : Temps de réponse API ventilé par route
- **Throughput** : Requêtes par seconde avec pics et creux
- **Taux d'erreur** : Pourcentage de requêtes en erreur (5xx, 4xx)
- **Saturation** : Utilisation CPU, mémoire, connexions DB

### Onglet Workers

- **Streams Redis** : Profondeur et vélocité de chaque stream
- **Tâches en cours** : Liste des tâches actives (type, durée, progression)
- **Historique** : Tâches récentes avec statut (succès/échec) et durée

### Onglet Modèles

- **Disponibilité** : Statut de chaque provider LLM (en ligne/hors ligne)
- **Utilisation** : Tokens consommés par modèle et par période
- **Coûts** : Estimation des coûts par provider (si applicable)

## Gestion des utilisateurs

### Rôles disponibles

| Rôle | Permissions |
|------|------------|
| `admin` | Accès complet, gestion des utilisateurs, configuration système |
| `operator` | Gestion des agents, monitoring, base de connaissances |
| `user` | Chat uniquement, accès aux conversations assignées |

### Actions utilisateur

- **Créer** : Ajout d'un nouvel utilisateur avec rôle et groupes
- **Modifier** : Changement de rôle, réinitialisation de mot de passe
- **Désactiver** : Suspension temporaire sans suppression des données
- **Supprimer** : Suppression définitive (conversations archivées conservées)

## Base de connaissances (RAG)

### Gérer les collections

- Créez des collections avec différents niveaux d'accès (Global, Groupe, Agent)
- Uploadez des documents (PDF, DOCX, TXT, MD) — traitement automatique
- Suivez le statut de traitement : En attente → Traitement → Prêt / Échec
- Testez la recherche sémantique directement depuis l'interface

### Statistiques

- Nombre de collections, documents et chunks
- Espace de stockage utilisé (PostgreSQL + Qdrant)
- Dernière synchronisation
- Requêtes de recherche récentes avec scores de pertinence

## Paramètres système

### Configuration générale

- **Nom de l'instance** : Identifiant de votre installation ModularMind
- **Timezone** : Fuseau horaire pour les logs et rapports
- **Langue par défaut** : FR, EN, ES, DE
- **Rétention des logs** : Durée de conservation (30, 60, 90, 180 jours)

### Sécurité

- **Politique de mots de passe** : Longueur minimale, complexité requise
- **Durée de session** : Expiration du JWT (par défaut 7 jours)
- **Rate limiting** : Limites par utilisateur et par IP
- **CORS** : Origines autorisées pour les requêtes cross-origin
