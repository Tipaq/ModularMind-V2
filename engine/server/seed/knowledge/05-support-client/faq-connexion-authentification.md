# FAQ — Connexion et authentification

## Questions fréquentes

### Q : Je n'arrive pas à me connecter, que faire ?

**R :** Vérifiez les points suivants :
1. Assurez-vous que votre adresse email est correctement saisie
2. Vérifiez que les majuscules/minuscules de votre mot de passe sont correctes
3. Si vous avez oublié votre mot de passe, cliquez sur "Mot de passe oublié"
4. Après 5 tentatives échouées, votre compte est temporairement bloqué pendant 5 minutes

### Q : Comment configurer l'authentification SSO ?

**R :** ModularMind supporte le SSO via SAML 2.0 et OIDC :
1. Contactez votre administrateur pour obtenir la configuration SSO
2. Dans la console d'administration, allez dans **Paramètres > Authentification > SSO**
3. Renseignez les métadonnées SAML ou les endpoints OIDC
4. Configurez le mapping des attributs (email, nom, groupes)
5. Testez avec un compte de test avant d'activer pour tous les utilisateurs

### Q : Ma session expire trop rapidement, comment la prolonger ?

**R :** Par défaut, la session dure 7 jours avec rafraîchissement automatique. Si vous êtes déconnecté fréquemment :
- Vérifiez que votre navigateur accepte les cookies tiers
- Désactivez les extensions de blocage de cookies (Privacy Badger, uBlock Origin peuvent bloquer les cookies d'authentification)
- L'administrateur peut ajuster la durée de session dans **Paramètres > Sécurité > Durée de session**

### Q : Comment activer l'authentification à deux facteurs (2FA) ?

**R :** Pour activer le 2FA :
1. Connectez-vous à votre compte
2. Allez dans **Mon profil > Sécurité**
3. Cliquez sur "Activer le 2FA"
4. Scannez le QR code avec votre application d'authentification (Google Authenticator, Authy, 1Password)
5. Entrez le code de vérification pour confirmer
6. Sauvegardez les codes de récupération en lieu sûr

### Q : J'ai perdu l'accès à mon application 2FA, comment me connecter ?

**R :** Utilisez un de vos codes de récupération. Si vous n'en avez plus, contactez votre administrateur pour réinitialiser le 2FA sur votre compte.

### Q : Pourquoi je reçois une erreur CORS ?

**R :** Les erreurs CORS surviennent quand votre navigateur bloque les requêtes cross-origin :
- Vérifiez que l'URL de l'application est dans la liste `CORS_ORIGINS` de la configuration
- En développement, utilisez `http://localhost:5173` (pas `127.0.0.1`)
- Les cookies d'authentification nécessitent `withCredentials: true` côté client

### Q : Comment changer mon mot de passe ?

**R :** Allez dans **Mon profil > Sécurité > Changer le mot de passe**. Le nouveau mot de passe doit contenir au minimum 8 caractères, une majuscule, une minuscule et un chiffre.