# Guide RGPD — Traitement des données personnelles

## Rôle de ModularMind

ModularMind agit en tant que **sous-traitant** (Data Processor) pour le compte de ses clients (responsables de traitement / Data Controllers). Un contrat de sous-traitance (DPA — Data Processing Agreement) est signé avec chaque client.

## Données personnelles traitées

| Catégorie | Données | Base légale | Durée de conservation |
|-----------|---------|-------------|----------------------|
| Utilisateurs | Email, nom, rôle, groupes | Exécution du contrat | Durée du contrat + 1 an |
| Conversations | Messages, métadonnées | Intérêt légitime du client | Configurable (défaut: 1 an) |
| Mémoire IA | Faits extraits, préférences | Intérêt légitime du client | Configurable (défaut: 6 mois) |
| Documents RAG | Contenu des documents uploadés | Exécution du contrat | Jusqu'à suppression |
| Logs techniques | IP, User-Agent, timestamps | Intérêt légitime (sécurité) | 90 jours |
| Analytics | Usage agrégé (anonymisé) | Intérêt légitime | 2 ans |

## Droits des personnes concernées

### Procédures RGPD

| Droit | Procédure | Délai |
|-------|-----------|-------|
| Accès (Art. 15) | Export des données via API ou console Ops | 30 jours |
| Rectification (Art. 16) | Modification via console Ops ou API | 30 jours |
| Effacement (Art. 17) | Suppression soft (expired_at) puis hard delete | 30 jours |
| Portabilité (Art. 20) | Export JSON/CSV via API | 30 jours |
| Opposition (Art. 21) | Désactivation du compte, suppression des mémoires | 30 jours |

### Processus de demande

1. Le client reçoit la demande de l'individu
2. Le client transmet la demande à ModularMind via dpo@modularmind.io
3. ModularMind exécute la demande sous 30 jours
4. Confirmation envoyée au client

## Mesures techniques

### Chiffrement
- **En transit** : TLS 1.3 pour toutes les communications
- **Au repos** : Chiffrement AES-256 pour les volumes de base de données (EBS/RDS)
- **Mots de passe** : Hachage bcrypt avec coût 12

### Pseudonymisation
- Les données de mémoire sont liées par `user_id` (UUID), pas par email
- Les logs techniques ne contiennent pas de contenu de messages
- Les métriques sont agrégées et anonymisées

### Minimisation
- Seules les données nécessaires au fonctionnement sont collectées
- Les données de conversation peuvent être supprimées par l'utilisateur
- Les mémoires ont une durée de vie configurable avec soft-delete

## Sous-traitants ultérieurs

| Sous-traitant | Service | Localisation | DPA signé |
|---------------|---------|-------------|-----------|
| OVHcloud | Hébergement infrastructure | France (Strasbourg) | Oui |
| OpenAI | API LLM (si configuré) | USA | Oui (DPA standard) |
| Anthropic | API LLM (si configuré) | USA | Oui (DPA standard) |
| Sentry | Monitoring d'erreurs | UE (Francfort) | Oui |

**Note** : Les clients utilisant uniquement Ollama (self-hosted) n'ont aucun sous-traitant ultérieur en dehors de l'hébergeur.

## DPO

**Délégué à la Protection des Données** : Sophie Bernard
- Email : dpo@modularmind.io
- Téléphone : +33 1 XX XX XX XX