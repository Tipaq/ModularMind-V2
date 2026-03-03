# FAQ — Configuration des agents IA

## Questions fréquentes

### Q : Comment créer un nouvel agent ?

**R :** Dans la console d'administration :
1. Naviguez vers **Agents > Créer un agent**
2. Renseignez le nom, la description et le modèle LLM
3. Rédigez le prompt système qui définit le comportement de l'agent
4. Sélectionnez les outils MCP à mettre à disposition
5. Optionnellement, assignez une base de connaissances (collections RAG)
6. Sauvegardez puis activez l'agent

### Q : Quel modèle choisir pour mon agent ?

**R :** Le choix dépend de votre usage :

| Usage | Modèle recommandé | Coût | Qualité |
|-------|-------------------|------|---------|
| Support client (réponses rapides) | gpt-4o-mini ou llama3.1:8b | Bas | Bonne |
| Analyse de code | claude-sonnet-4-6 | Moyen | Excellente |
| Raisonnement complexe | gpt-4o ou claude-opus-4-6 | Élevé | Maximale |
| Extraction de données | claude-haiku-4-5 | Très bas | Correcte |
| Usage intensif (self-hosted) | llama3.1:70b | GPU only | Très bonne |

### Q : Comment optimiser le prompt système ?

**R :** Bonnes pratiques pour les prompts système :
- Soyez spécifique sur le rôle et le périmètre de l'agent
- Incluez des exemples de réponses attendues
- Précisez le ton (formel, amical, technique)
- Définissez les limites (ce que l'agent ne doit PAS faire)
- Mentionnez les outils disponibles et quand les utiliser
- Gardez le prompt sous 500 tokens pour des performances optimales

### Q : Comment connecter un agent à la base de connaissances ?

**R :** Lors de la configuration de l'agent :
1. Dans la section "Base de connaissances", sélectionnez les collections RAG
2. L'agent aura automatiquement accès aux documents de ces collections
3. Vous pouvez configurer le seuil de pertinence (0.7 par défaut)
4. Le nombre de chunks injectés dans le contexte est configurable (5 par défaut)

### Q : Mon agent donne des réponses trop longues/courtes, que faire ?

**R :** Ajustez ces paramètres :
- **Max tokens** : Limite la longueur de la réponse (ex: 500 pour des réponses concises)
- **Prompt système** : Ajoutez "Réponds de manière concise en 2-3 phrases maximum"
- **Température** : Baissez-la (0.1-0.3) pour des réponses plus focalisées

### Q : Comment tester un agent avant de le mettre en production ?

**R :** Plusieurs options :
1. Utilisez le mode "Brouillon" pour tester sans exposer l'agent aux utilisateurs
2. Si un graphe est assigné, utilisez le bouton "Test" dans l'éditeur de graphes
3. Créez un utilisateur de test avec accès limité pour valider le comportement