# Charte de sécurité informatique — ModularMind

## Objet

Cette charte définit les règles de sécurité informatique applicables à tous les collaborateurs de ModularMind. Elle vise à protéger les actifs numériques de l'entreprise et les données de nos clients.

## Politique de mots de passe

### Règles
- **Longueur minimale** : 12 caractères
- **Complexité** : Au moins 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère spécial
- **Rotation** : Changement tous les 90 jours pour les accès critiques
- **Unicité** : Ne jamais réutiliser un mot de passe sur plusieurs services
- **Gestionnaire** : Utilisation obligatoire de 1Password pour stocker les mots de passe

### Authentification multi-facteurs (MFA)
Le MFA est **obligatoire** sur :
- GitHub (TOTP ou clé de sécurité)
- Console d'administration ModularMind
- Accès VPN
- Console cloud (AWS, GCP)
- Gestionnaire de mots de passe (1Password)

## Sécurité des postes de travail

### Configuration obligatoire
- Chiffrement du disque (FileVault sur Mac, BitLocker sur Windows)
- Verrouillage automatique après 5 minutes d'inactivité
- Pare-feu activé
- Antivirus à jour (Windows Defender ou CrowdStrike)
- Mises à jour OS appliquées sous 7 jours

### Bonnes pratiques
- Ne jamais laisser le poste déverrouillé sans surveillance
- Ne pas installer de logiciels non approuvés
- Ne pas connecter de clés USB inconnues
- Signaler immédiatement tout comportement suspect

## Accès réseau

### VPN
- Utilisation obligatoire pour accéder aux ressources internes depuis l'extérieur
- Client VPN : Tailscale (mesh VPN, zero-config)
- Ne jamais utiliser un WiFi public sans VPN actif

### WiFi au bureau
- Réseau employés : WPA3 Enterprise (authentification par certificat)
- Réseau invités : isolé, sans accès aux ressources internes

## Gestion des secrets

### Règles absolues
- **JAMAIS** de secrets dans le code source (API keys, mots de passe, tokens)
- **JAMAIS** de secrets dans les messages Slack ou les emails
- **TOUJOURS** utiliser les variables d'environnement ou un gestionnaire de secrets

### Outils autorisés
- **1Password** pour les secrets partagés en équipe
- **GitHub Secrets** pour les variables CI/CD
- **HashiCorp Vault** pour les secrets d'infrastructure (production)
- **AWS SSM Parameter Store** pour les secrets cloud

### Si un secret est compromis
1. Révoquez immédiatement le secret (changez le mot de passe, invalidez la clé API)
2. Notifiez l'équipe sécurité (security@modularmind.io)
3. Vérifiez les logs d'accès pour détecter toute utilisation malveillante
4. Documentez l'incident dans le registre de sécurité

## Signalement d'incidents

### Que signaler ?
- Email ou message de phishing
- Comportement suspect sur un poste de travail
- Perte ou vol de matériel
- Accès non autorisé détecté
- Fuite de données suspectée

### Comment signaler ?
1. **Urgent** : Slack #security-incidents + appel au responsable sécurité
2. **Non urgent** : Email à security@modularmind.io
3. **Anonyme** : ethique@modularmind.io (cabinet externe)

## Sanctions

Le non-respect de cette charte peut entraîner des sanctions disciplinaires proportionnées à la gravité de l'infraction, conformément au code de conduite de l'entreprise.

## Contact

Responsable sécurité : Lucas Girard — lucas@modularmind.io | #security sur Slack