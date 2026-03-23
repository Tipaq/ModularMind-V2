# Manuel utilisateur — Interface Chat ModularMind

## Présentation

L'interface Chat de ModularMind est une application web monopage (SPA) permettant aux utilisateurs de converser avec les agents IA configurés par l'administrateur. Elle offre une expérience de chat en temps réel avec streaming SSE, gestion des conversations, et personnalisation du thème.

## Accès et connexion

### URL d'accès

- **Développement** : `http://localhost:5173`
- **Production** : `https://chat.modularmind.io` (ou votre domaine personnalisé)

### Authentification

1. Entrez votre adresse email professionnelle
2. Saisissez votre mot de passe
3. Si le 2FA est activé, entrez le code TOTP depuis votre application d'authentification
4. La session est maintenue via un cookie HttpOnly sécurisé (durée : 7 jours, rafraîchissement automatique)

## Gestion des conversations

### Créer une nouvelle conversation

1. Cliquez sur le bouton **"+ Nouvelle conversation"** dans la barre latérale
2. Sélectionnez l'agent avec lequel vous souhaitez converser
3. Optionnellement, donnez un titre descriptif à la conversation
4. Commencez à taper votre message

### Liste des conversations

La barre latérale gauche affiche vos conversations, triées par date de dernière activité :

- **Recherche** : Utilisez la barre de recherche pour filtrer par titre ou contenu
- **Épingler** : Cliquez sur l'icône d'épingle pour garder une conversation en haut
- **Archiver** : Glissez vers la gauche ou utilisez le menu contextuel pour archiver
- **Supprimer** : Disponible via le menu contextuel (action irréversible)

### Changer d'agent en cours de conversation

Vous pouvez changer l'agent répondeur à tout moment via le sélecteur d'agent en haut de la conversation. Le nouvel agent aura accès à l'historique complet de la conversation.

## Envoi de messages

### Formatage du texte

ModularMind supporte le formatage Markdown dans vos messages :

- `**gras**` pour le **gras**
- `*italique*` pour l'*italique*
- `` `code inline` `` pour le `code inline`
- Triple backticks pour les blocs de code avec coloration syntaxique
- Listes à puces et numérotées
- Liens `[texte](url)`

### Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `Entrée` | Envoyer le message |
| `Shift + Entrée` | Nouvelle ligne |
| `Ctrl + N` | Nouvelle conversation |
| `Ctrl + K` | Recherche rapide |
| `Ctrl + /` | Afficher l'aide raccourcis |
| `Échap` | Fermer le panneau latéral |

### Pièces jointes

Vous pouvez joindre des fichiers à vos messages :

- **Formats acceptés** : PDF, DOCX, TXT, MD, images (PNG, JPG, GIF)
- **Taille maximale** : 10 Mo par fichier
- **Glisser-déposer** : Faites glisser un fichier directement dans la zone de saisie
- **Bouton** : Cliquez sur l'icône trombone à gauche de la zone de saisie

## Streaming en temps réel (SSE)

Les réponses de l'agent s'affichent en temps réel grâce au streaming SSE (Server-Sent Events) :

- Le texte apparaît progressivement, mot par mot
- Un indicateur de frappe s'affiche pendant la génération
- Vous pouvez **interrompre** la génération en cliquant sur le bouton "Stop"
- Si la connexion est interrompue, le système se reconnecte automatiquement et reprend le streaming

## Personnalisation du thème

### Mode clair / sombre

Cliquez sur l'icône soleil/lune dans la barre de navigation pour basculer entre :

- **Mode clair** : Fond blanc, texte sombre
- **Mode sombre** : Fond sombre, texte clair
- **Système** : Suit les préférences de votre OS

### Couleur d'accent

Personnalisez la couleur principale de l'interface :

1. Cliquez sur l'icône palette dans les paramètres
2. Choisissez parmi les presets (bleu, violet, vert, orange, rose)
3. Ou ajustez manuellement la teinte et la saturation
4. Les changements sont appliqués instantanément et sauvegardés localement

## Fonctionnalités avancées

### Contexte RAG

Si l'agent est connecté à une base de connaissances, les sources utilisées pour la réponse s'affichent en bas du message sous forme de cartes cliquables avec le nom du document et l'extrait pertinent.

### Mémoire conversationnelle

L'agent se souvient des informations clés de vos conversations précédentes. Un badge "Mémoire" apparaît lorsque l'agent utilise des souvenirs pour contextualiser sa réponse. Vous pouvez gérer vos données de mémoire depuis les paramètres.

### Export de conversation

- **Markdown** : Exportez la conversation complète en fichier `.md`
- **PDF** : Générez un PDF formaté avec en-têtes et horodatage
- **JSON** : Export brut pour intégration avec d'autres outils

## Résolution de problèmes

| Symptôme | Solution |
|----------|----------|
| Message "Connexion perdue" | Vérifiez votre connexion internet. Le système se reconnecte automatiquement sous 5 secondes. |
| Réponse très lente | Le modèle est peut-être surchargé. Essayez un modèle plus léger ou attendez quelques instants. |
| Erreur "Session expirée" | Rafraîchissez la page. Si le problème persiste, reconnectez-vous. |
| Fichier non accepté | Vérifiez le format et la taille (max 10 Mo). |
