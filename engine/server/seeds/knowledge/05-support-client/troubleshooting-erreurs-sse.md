# Troubleshooting — Erreurs de streaming SSE

## Symptôme : La réponse ne s'affiche pas en temps réel

### Cause 1 : Proxy ou CDN bufferise les données

**Diagnostic :** La réponse s'affiche d'un coup à la fin au lieu de s'afficher progressivement.

**Solution :** Vérifiez la configuration du reverse proxy :
```nginx
# Nginx — Désactiver le buffering pour les routes SSE
location /api/conversations/ {
    proxy_pass http://engine:8000;
    proxy_buffering off;
    proxy_cache off;
    proxy_set_header Connection '';
    proxy_http_version 1.1;
    chunked_transfer_encoding off;
    add_header X-Accel-Buffering no;
}
```

### Cause 2 : EventSource déconnecté

**Diagnostic :** Message "Connexion perdue" dans l'interface.

**Solution :**
- Le navigateur tente automatiquement de se reconnecter toutes les 3 secondes
- Si le problème persiste, vérifiez votre connexion réseau
- Rafraîchissez la page si la reconnexion échoue après 30 secondes

### Cause 3 : Erreur CORS avec withCredentials

**Diagnostic :** Erreur dans la console navigateur : "Access to fetch at ... has been blocked by CORS policy"

**Solution :**
- Vérifiez que l'URL de l'application est dans la variable `CORS_ORIGINS`
- L'API doit répondre avec `Access-Control-Allow-Credentials: true`
- L'EventSource doit utiliser `{ withCredentials: true }`

### Cause 4 : Timeout de connexion

**Diagnostic :** La connexion SSE se ferme après 60 secondes sans données.

**Solution :**
- Le serveur envoie des heartbeat (`event: ping`) toutes les 15 secondes
- Vérifiez que le proxy ne coupe pas les connexions idle
- AWS ALB : augmentez le `idle_timeout` à 120 secondes minimum

## Symptôme : Erreurs réseau intermittentes

### Cause : Limite de connexions HTTP/1.1

Les navigateurs limitent à 6 connexions simultanées par domaine en HTTP/1.1.

**Solution :**
- Activez HTTP/2 sur votre reverse proxy (multiplexage automatique)
- Fermez les onglets ModularMind inutilisés
- Utilisez un seul onglet par conversation active

## Outils de diagnostic

1. **DevTools > Network > EventStream** : Visualisez les événements SSE en temps réel
2. **curl** pour tester directement :
```bash
curl -N -H "Cookie: access_token=YOUR_TOKEN"   "https://api.modularmind.io/conversations/CONV_ID/messages/stream?content=test"
```