# FAQ — Problèmes de performance

## Questions fréquentes

### Q : Les réponses de l'agent sont très lentes, que faire ?

**R :** Plusieurs causes possibles :

1. **Modèle surchargé** : Si vous utilisez Ollama, vérifiez que le GPU n'est pas saturé. Passez à un modèle plus petit (8B au lieu de 70B) pour des réponses plus rapides.

2. **Contexte trop large** : Si la conversation a beaucoup de messages, le temps de traitement augmente. Commencez une nouvelle conversation pour réduire la taille du contexte.

3. **RAG lent** : Si l'agent utilise une base de connaissances volumineuse, la recherche peut prendre du temps. Vérifiez que les index Qdrant sont à jour.

4. **Rate limiting** : Vous avez peut-être atteint la limite de requêtes. Attendez quelques secondes avant de réessayer.

### Q : Le chargement de l'application est lent

**R :** Vérifiez :
- Votre connexion internet (minimum 5 Mbps recommandé)
- Le cache du navigateur : essayez un hard refresh (Ctrl+Shift+R)
- Les extensions de navigateur qui pourraient interférer
- Le serveur est peut-être en cours de redémarrage (attendez 30 secondes)

### Q : Les timeouts sont fréquents

**R :** Les timeouts surviennent quand le modèle ne répond pas dans le délai imparti :
- **Timeout par défaut** : 120 secondes pour le streaming, 30 secondes pour les requêtes simples
- **Solution** : Contactez l'administrateur pour augmenter le timeout ou passer à un modèle plus rapide
- **Provider cloud** : Vérifiez le statut du provider (OpenAI, Anthropic) sur leur page de statut

### Q : Comment savoir si le problème vient de mon côté ou du serveur ?

**R :** Vérifiez ces points :
1. Ouvrez `https://api.modularmind.io/health` — si ça répond `{"status": "ok"}`, le serveur fonctionne
2. Essayez depuis un autre navigateur ou en navigation privée
3. Vérifiez le dashboard de monitoring (si vous êtes admin/opérateur)
4. Contactez le support si le problème persiste

### Q : Pourquoi certaines réponses sont coupées en plein milieu ?

**R :** La réponse a atteint la limite de tokens configurée (`max_tokens`). Solutions :
- L'administrateur peut augmenter le `max_tokens` de l'agent
- Reformulez votre question pour obtenir une réponse plus concise
- Demandez à l'agent de continuer : "Continue ta réponse"