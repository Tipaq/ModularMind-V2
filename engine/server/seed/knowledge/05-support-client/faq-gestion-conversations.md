# FAQ — Gestion des conversations

## Questions fréquentes

### Q : Comment exporter une conversation ?

**R :** Ouvrez la conversation, puis cliquez sur le menu (**⋮**) en haut à droite :
- **Exporter en Markdown** : Fichier `.md` avec l'historique complet
- **Exporter en PDF** : Document formaté avec horodatage
- **Exporter en JSON** : Données brutes pour intégration

### Q : Comment retrouver une ancienne conversation ?

**R :** Utilisez la barre de recherche dans la liste des conversations :
- Recherche par titre de conversation
- Recherche dans le contenu des messages
- Filtrage par agent, date, ou statut (active/archivée)

### Q : Quelle est la limite du contexte de conversation ?

**R :** La limite dépend du modèle utilisé :

| Modèle | Contexte max | ~Messages (estimation) |
|--------|-------------|----------------------|
| gpt-4o | 128K tokens | ~200 messages |
| claude-sonnet-4-6 | 200K tokens | ~300 messages |
| llama3.1:8b | 128K tokens | ~200 messages |

Quand la limite est atteinte, les messages les plus anciens sont automatiquement résumés pour libérer de l'espace tout en conservant le contexte important.

### Q : Puis-je partager une conversation avec un collègue ?

**R :** Actuellement, les conversations sont privées à chaque utilisateur. Les administrateurs peuvent consulter les conversations via la console Ops pour des besoins de supervision. Une fonctionnalité de partage est prévue dans la roadmap v3.3.

### Q : Comment archiver des conversations en masse ?

**R :** Via la console Ops, les opérateurs peuvent archiver les conversations selon des critères :
- Conversations inactives depuis plus de X jours
- Conversations d'un agent spécifique
- Conversations d'un utilisateur spécifique

### Q : Les conversations sont-elles sauvegardées automatiquement ?

**R :** Oui, chaque message est sauvegardé immédiatement dans la base de données. Il n'y a pas de perte de données en cas de déconnexion. Si une réponse en streaming est interrompue, la partie déjà générée est conservée.