# Guide de configuration — Providers LLM ModularMind

## Introduction

ModularMind supporte plusieurs fournisseurs de modèles de langage (LLM) simultanément. Ce guide explique comment configurer chaque provider, optimiser les coûts, et mettre en place des chaînes de fallback.

## Providers supportés

| Provider | Modèles populaires | Hébergement | Coût |
|----------|-------------------|-------------|------|
| **Ollama** | Llama 3.1, Mistral, Gemma 2, Phi-3 | Self-hosted | Gratuit (coût GPU) |
| **OpenAI** | GPT-4o, GPT-4o-mini, o1 | Cloud | Pay-per-token |
| **Anthropic** | Claude 3.5 Sonnet, Claude 3 Opus | Cloud | Pay-per-token |
| **Azure OpenAI** | GPT-4o (déploiement dédié) | Cloud Azure | Pay-per-token |
| **Google Vertex AI** | Gemini 1.5 Pro, Gemini 1.5 Flash | Cloud GCP | Pay-per-token |

## Configuration Ollama (Self-hosted)

Ollama est le provider par défaut pour les installations on-premise.

### Installation et modèles

```bash
# Ollama est déjà inclus dans le Docker Compose
# Télécharger des modèles supplémentaires :
docker exec -it ollama ollama pull llama3.1:8b
docker exec -it ollama ollama pull llama3.1:70b
docker exec -it ollama ollama pull mistral:7b
docker exec -it ollama ollama pull nomic-embed-text  # Pour les embeddings
```

### Variables d'environnement

```env
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_TIMEOUT=120          # Timeout en secondes
OLLAMA_NUM_PARALLEL=4       # Requêtes parallèles max
OLLAMA_GPU_LAYERS=-1        # -1 = toutes les couches sur GPU
```

### Modèles recommandés par usage

| Usage | Modèle | VRAM requise | Vitesse |
|-------|--------|-------------|---------|
| Chat rapide | `llama3.1:8b` | 6 Go | ~40 tok/s |
| Chat qualité | `llama3.1:70b` | 40 Go | ~10 tok/s |
| Code | `codellama:13b` | 10 Go | ~25 tok/s |
| Embeddings | `nomic-embed-text` | 1 Go | ~200 doc/s |
| Analyse | `mistral:7b` | 5 Go | ~45 tok/s |

## Configuration OpenAI

### Variables d'environnement

```env
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxx
OPENAI_ORG_ID=org-xxxxxxxxxxxx        # Optionnel
OPENAI_BASE_URL=https://api.openai.com/v1  # Pour proxies/Azure
OPENAI_TIMEOUT=60
OPENAI_MAX_RETRIES=3
```

### Modèles disponibles

| Modèle | Input ($/1M tok) | Output ($/1M tok) | Contexte | Usage recommandé |
|--------|------------------|-------------------|----------|-----------------|
| `gpt-4o` | $2.50 | $10.00 | 128K | Tâches complexes |
| `gpt-4o-mini` | $0.15 | $0.60 | 128K | Usage quotidien |
| `o1` | $15.00 | $60.00 | 200K | Raisonnement avancé |
| `o1-mini` | $3.00 | $12.00 | 128K | Raisonnement rapide |

### Bonnes pratiques OpenAI

- Utilisez `gpt-4o-mini` par défaut pour réduire les coûts de 95%
- Réservez `gpt-4o` pour les tâches nécessitant une haute qualité
- Configurez des **rate limits** côté ModularMind en dessous de vos quotas OpenAI
- Activez le **caching de réponses** pour les requêtes identiques

## Configuration Anthropic

### Variables d'environnement

```env
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxx
ANTHROPIC_TIMEOUT=90
ANTHROPIC_MAX_RETRIES=3
```

### Modèles disponibles

| Modèle | Input ($/1M tok) | Output ($/1M tok) | Contexte | Points forts |
|--------|------------------|-------------------|----------|-------------|
| `claude-sonnet-4-6` | $3.00 | $15.00 | 200K | Meilleur rapport qualité/prix |
| `claude-opus-4-6` | $15.00 | $75.00 | 200K | Tâches les plus exigeantes |
| `claude-haiku-4-5` | $0.80 | $4.00 | 200K | Ultra-rapide, économique |

## Chaînes de fallback

Configurez des fallbacks automatiques pour garantir la disponibilité :

```yaml
# Configuration dans la console Ops > Modèles > Fallback
fallback_chains:
  - name: "Production haute disponibilité"
    primary:
      provider: openai
      model: gpt-4o
    fallbacks:
      - provider: anthropic
        model: claude-sonnet-4-6
        condition: "on_error_or_timeout"
      - provider: ollama
        model: llama3.1:70b
        condition: "on_all_cloud_unavailable"

  - name: "Économique"
    primary:
      provider: ollama
      model: llama3.1:8b
    fallbacks:
      - provider: openai
        model: gpt-4o-mini
        condition: "on_error"
```

### Conditions de fallback

| Condition | Description |
|-----------|-------------|
| `on_error` | Erreur API (5xx, timeout, rate limit) |
| `on_timeout` | Dépassement du timeout configuré |
| `on_rate_limit` | Rate limit atteint (429) |
| `on_all_cloud_unavailable` | Tous les providers cloud indisponibles |
| `on_quality_threshold` | Score de qualité en dessous du seuil |

## Optimisation des coûts

### Stratégie de routage intelligent

ModularMind peut router automatiquement les requêtes vers le modèle le plus adapté :

1. **Messages courts** (< 100 tokens) → Modèle économique (`gpt-4o-mini`, `llama3.1:8b`)
2. **Messages complexes** (raisonnement, code) → Modèle premium (`gpt-4o`, `claude-sonnet-4-6`)
3. **Extraction de données** → Modèle rapide (`claude-haiku-4-5`)

### Suivi des coûts

Consultez le dashboard de coûts dans **Ops > Monitoring > Coûts** pour :

- Coût total par jour/semaine/mois
- Répartition par provider et modèle
- Coût moyen par conversation
- Alertes de dépassement de budget

### Budget et alertes

```yaml
budget:
  monthly_limit_eur: 500
  alerts:
    - threshold: 80   # 80% du budget
      channels: ["email:admin@modularmind.io", "slack:#alerts"]
    - threshold: 100
      action: "switch_to_ollama_only"
```

## Dépannage

| Problème | Cause probable | Solution |
|----------|---------------|----------|
| Timeout fréquents Ollama | Modèle trop gros pour le GPU | Réduisez la taille du modèle ou augmentez le GPU |
| Erreur 429 OpenAI | Rate limit dépassé | Réduisez le parallélisme ou augmentez le tier |
| Réponses incohérentes | Température trop élevée | Baissez la température à 0.3-0.5 |
| Latence élevée | Premier chargement du modèle | Le modèle Ollama est mis en cache après le premier appel |
