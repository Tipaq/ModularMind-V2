# Cas d'usage — Chatbot de service client avec ModularMind

## Contexte

Ce guide montre comment configurer un chatbot de service client intelligent avec ModularMind, capable de répondre aux questions fréquentes, consulter une base de connaissances, et escalader vers un humain si nécessaire.

## Architecture

```
Client Web ──→ ModularMind Agent ──→ RAG (FAQ + docs)
                    │                       │
                    ├── Mémoire ←───────────┘
                    │   (historique client)
                    │
                    ├── Outil: create_jira_ticket
                    │   (escalade)
                    │
                    └── Outil: send_slack_message
                        (notification équipe)
```

## Étape 1 : Créer la base de connaissances

### Collection FAQ

Créez une collection "FAQ Support" avec scope `GROUP` et groupes `["support", "sales"]` :

1. Console Ops > Base de connaissances > Nouvelle collection
2. Nom : "FAQ Support Client"
3. Scope : Group, Groupes : support, sales
4. Uploadez vos documents FAQ (Markdown ou PDF)

### Exemples de documents FAQ

- Politique de retour et remboursement
- Guide de dépannage des problèmes courants
- Tarifs et plans d'abonnement
- Processus d'onboarding client
- SLA et temps de réponse

## Étape 2 : Configurer l'agent

### Prompt système recommandé

```
Tu es l'assistant de support client de ModularMind. Ton rôle est d'aider les clients avec leurs questions techniques et commerciales.

Règles :
1. Réponds toujours en français, de manière professionnelle et empathique
2. Utilise la base de connaissances pour fournir des réponses précises
3. Si tu n'es pas sûr de la réponse, dis-le honnêtement et propose d'escalader
4. Pour les problèmes techniques complexes, crée un ticket Jira
5. Ne donne jamais d'information sur l'infrastructure interne
6. Demande des précisions si la question est ambiguë

Format de réponse :
- Commence par reformuler le problème du client
- Donne la solution étape par étape
- Termine par une question pour vérifier que le problème est résolu
```

### Paramètres recommandés

| Paramètre | Valeur | Justification |
|-----------|--------|---------------|
| Modèle | gpt-4o-mini | Bon rapport qualité/prix pour le support |
| Température | 0.3 | Réponses cohérentes et factuelles |
| Max tokens | 1000 | Réponses détaillées mais pas trop longues |
| RAG threshold | 0.75 | Haute pertinence pour éviter les faux positifs |
| RAG limit | 3 | 3 sources maximum pour le contexte |

## Étape 3 : Créer le graphe de workflow

### Workflow recommandé

```
Entrée → RAG Lookup → Mémoire Client → LLM Réponse → Condition
                                                          │
                                              ┌───────────┤
                                              ▼           ▼
                                          Répondre    Escalader
                                              │           │
                                              │      Créer Ticket
                                              │           │
                                              └─────┬─────┘
                                                    ▼
                                            Sauver Mémoire → Sortie
```

### Condition d'escalade

Le nœud Condition évalue si l'agent a pu répondre ou s'il doit escalader :
- Si le score RAG max < 0.6 → Escalade (pas assez d'information)
- Si le message contient des mots-clés d'urgence → Escalade
- Si le client demande explicitement un humain → Escalade

## Étape 4 : Métriques de succès

| Métrique | Objectif | Mesure |
|----------|----------|--------|
| Taux de résolution au premier contact | > 70% | % de conversations sans escalade |
| Satisfaction client (CSAT) | > 4.2/5 | Survey post-conversation |
| Temps de première réponse | < 3 secondes | Latence P95 |
| Taux d'escalade | < 30% | % de conversations escaladées |
| Volume de tickets évités | > 50% | Comparaison avec la période précédente |

## Bonnes pratiques

1. **Mettez à jour la FAQ régulièrement** — Ajoutez les nouvelles questions fréquentes chaque semaine
2. **Analysez les escalades** — Identifiez les sujets manquants dans la base de connaissances
3. **Testez avec de vrais clients** — Faites un pilote avec un petit groupe avant le déploiement complet
4. **Formez l'équipe support** — Ils doivent comprendre quand et comment le chatbot escalade
5. **Itérez sur le prompt** — Affinez les instructions en fonction des retours clients