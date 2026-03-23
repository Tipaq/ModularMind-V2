# Manuel utilisateur — Studio de Graphes ModularMind

## Introduction

Le Studio de Graphes est l'éditeur visuel de workflows IA de ModularMind. Il vous permet de concevoir des pipelines d'agents complexes en reliant visuellement des nœuds sur un canevas interactif, sans écrire de code.

## Accès au Studio

Le Studio est accessible depuis la plateforme ModularMind à l'adresse `https://platform.modularmind.io/studio/graphs`. Seuls les utilisateurs avec le rôle `admin` ou `operator` peuvent créer et modifier des graphes.

## Concepts fondamentaux

### Graphe

Un graphe représente un workflow complet. Il est composé de nœuds connectés par des arêtes qui définissent le flux d'exécution. Chaque graphe possède :

- Un **nœud d'entrée** (point de départ obligatoire)
- Un ou plusieurs **nœuds de sortie** (fin du workflow)
- Des **nœuds intermédiaires** pour le traitement

### État du graphe

L'état est un objet partagé qui traverse tous les nœuds du graphe. Chaque nœud peut lire et modifier l'état. La structure typique :

```json
{
  "messages": [],
  "context": {},
  "tools_output": {},
  "metadata": {
    "conversation_id": "...",
    "user_id": "...",
    "iteration": 0
  }
}
```

## Types de nœuds

### LLM Node

Envoie les messages à un modèle de langage et ajoute la réponse à l'état.

**Configuration :**
- Modèle : Sélection du provider + modèle
- Prompt système : Instructions spécifiques pour ce nœud
- Température : 0.0 à 1.0
- Max tokens : Limite de la réponse
- Stop sequences : Tokens d'arrêt personnalisés

### Tool Node

Exécute un outil MCP et injecte le résultat dans l'état du graphe.

**Configuration :**
- Outil : Sélection parmi les outils MCP enregistrés
- Paramètres : Mapping des paramètres d'entrée depuis l'état
- Timeout : Durée maximale d'exécution (défaut : 30s)
- Gestion d'erreur : Continuer / Arrêter / Chemin alternatif

### Condition Node

Évalue une condition sur l'état et route vers un chemin ou un autre.

**Configuration :**
- Expression : Condition Python évaluée sur l'état (ex: `len(state.messages) > 5`)
- Sortie Vrai : Nœud cible si la condition est vraie
- Sortie Faux : Nœud cible si la condition est fausse

### Router Node

Route vers un nœud parmi plusieurs selon des critères complexes.

**Configuration :**
- Type de routage : Par contenu (LLM-based), par regex, par valeur d'état
- Routes : Liste de (condition, nœud cible) avec une route par défaut
- Prompt de classification : Pour le routage LLM-based

### Memory Node

Interagit avec le système de mémoire ModularMind.

**Modes :**
- **Lecture** : Recherche des souvenirs pertinents et les injecte dans le contexte
- **Écriture** : Extrait et stocke des faits de la conversation en cours
- **Recherche** : Recherche sémantique dans la mémoire de l'agent

### RAG Node

Recherche dans la base de connaissances et enrichit le contexte.

**Configuration :**
- Collections : Sélection des collections à interroger
- Limite de résultats : Nombre max de chunks retournés (défaut : 5)
- Seuil de pertinence : Score minimum pour inclure un résultat (défaut : 0.7)
- Mode d'injection : Avant le prompt système / En tant que message utilisateur

## Créer un graphe

### Étape 1 : Nouveau graphe

1. Cliquez sur **"+ Nouveau graphe"** dans la barre d'outils
2. Nommez votre graphe (ex: "Pipeline Support Client")
3. Ajoutez une description du workflow
4. Un canevas vierge s'ouvre avec un nœud d'entrée par défaut

### Étape 2 : Ajouter des nœuds

- **Glisser-déposer** depuis la palette de nœuds à gauche
- **Double-clic** sur le canevas pour ouvrir le menu rapide
- **Raccourci** : `L` pour LLM, `T` pour Tool, `C` pour Condition, `R` pour Router

### Étape 3 : Connecter les nœuds

1. Survolez le port de sortie d'un nœud (cercle à droite)
2. Cliquez et maintenez, puis glissez vers le port d'entrée d'un autre nœud
3. Relâchez pour créer la connexion
4. Les connexions se colorent automatiquement selon le type

### Étape 4 : Configurer chaque nœud

Double-cliquez sur un nœud pour ouvrir son panneau de configuration. Remplissez les champs requis et validez.

### Étape 5 : Tester le graphe

1. Cliquez sur **"Test"** dans la barre d'outils
2. Entrez un message de test
3. Observez l'exécution nœud par nœud en temps réel
4. Les nœuds s'illuminent en vert (succès) ou rouge (erreur) lors de l'exécution
5. Inspectez l'état à chaque étape en cliquant sur un nœud exécuté

### Étape 6 : Publier

1. Validez le graphe (vérification automatique des connexions)
2. Cliquez sur **"Publier"**
3. Sélectionnez la version (majeure, mineure, patch)
4. Le graphe est maintenant disponible pour les agents

## Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `Ctrl + Z` | Annuler |
| `Ctrl + Shift + Z` | Rétablir |
| `Ctrl + S` | Sauvegarder |
| `Ctrl + D` | Dupliquer la sélection |
| `Suppr` | Supprimer la sélection |
| `Espace + Glisser` | Naviguer sur le canevas |
| `Ctrl + Molette` | Zoom avant/arrière |
| `Ctrl + 0` | Ajuster au contenu |

## Bonnes pratiques

1. **Nommez clairement** chaque nœud pour faciliter la maintenance
2. **Limitez la profondeur** à 10 nœuds maximum pour la lisibilité
3. **Utilisez les conditions** pour gérer les cas limites (réponse vide, erreur outil)
4. **Testez avec des cas variés** avant de publier en production
5. **Versionnez vos graphes** à chaque modification significative
