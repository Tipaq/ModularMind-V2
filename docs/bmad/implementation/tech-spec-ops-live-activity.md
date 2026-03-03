---
title: 'Ops Monitoring — Live Activity & LLM Dashboard'
slug: 'ops-live-activity'
created: '2026-03-02'
status: 'ready-for-dev'
stepsCompleted: []
tech_stack:
  - React + Zustand + shadcn/ui (Ops SPA)
  - '@modularmind/api-client'
  - FastAPI endpoints (already exist, no backend changes needed)
files_to_modify:
  - apps/ops/src/pages/Monitoring.tsx
code_patterns:
  - useApi hook for polling (same pattern as existing Monitoring.tsx)
  - PageHeader + semantic color tokens
  - No hardcoded Tailwind colors
---

# Tech-Spec: Ops Monitoring — Live Activity & LLM Dashboard

**Created:** 2026-03-02
**Status:** ready-for-dev

---

## Overview

### Problem Statement

La page `/ops/monitoring` affiche CPU, mémoire, disque, uptime et les Redis Streams,
mais ignore les données opérationnelles clés déjà disponibles dans les endpoints backend :

- Nombre d'exécutions actives en temps réel (`scheduler.active_slots`)
- Saturation du scheduler (`backpressure`)
- Modèles LLM chargés en VRAM (noms, taille, expiration)
- Performance LLM : latence moyenne, tokens/sec, TTFT, requêtes/h
- Connexions SSE actives (`streaming.active_streams`)
- Alertes actives (`alerts.active_alerts`)
- État Redis et Ollama (`infrastructure`)

De plus, la page requiert un rafraîchissement manuel — pas adapté pour du monitoring live.

### Solution

Enrichir `Monitoring.tsx` avec :

1. **Auto-refresh** toutes les 10 secondes (remplace le bouton manuel)
2. **Section "Live Activity"** — tuiles temps réel depuis `/internal/monitoring`
3. **Section "LLM & GPU"** — depuis `/internal/llm-gpu`
4. **Section "Infrastructure"** — Redis, DB, Ollama depuis `/internal/monitoring`
5. **Section "Alerts"** — alertes actives depuis `/internal/monitoring`

Aucune modification backend requise — tous les endpoints existent.

---

## Data Sources

### `/internal/monitoring` (déjà appelé)

Champs supplémentaires à exploiter :

| Champ | Usage |
|---|---|
| `scheduler.active_slots` | Tuile "Active Executions" |
| `scheduler.global_max` | Progress bar slots |
| `scheduler.backpressure` | Badge warning |
| `streaming.active_streams` | Tuile "SSE Streams" |
| `infrastructure.redis_healthy` | Status badge Redis |
| `infrastructure.redis_latency_ms` | Latence Redis |
| `infrastructure.ollama_status` | Status badge Ollama |
| `infrastructure.ollama_running_models` | Liste modèles actifs |
| `alerts.active_count` | Badge alerte dans header |
| `alerts.active_alerts[]` | Section alertes détaillée |

### `/internal/llm-gpu` (nouveau call)

| Champ | Usage |
|---|---|
| `gpu_vram.used_vram_percent` | Progress bar VRAM |
| `gpu_vram.used_vram_gb` / `total_vram_gb` | Label VRAM |
| `gpu_vram.loaded_models[]` | Table modèles en VRAM |
| `gpu_vram.model_count` | Tuile "Models in VRAM" |
| `llm_performance.avg_latency_ms` | Tuile latence LLM |
| `llm_performance.avg_tokens_per_second` | Tuile tokens/sec |
| `llm_performance.avg_ttft_ms` | Tuile TTFT |
| `llm_performance.total_requests_last_hour` | Tuile requêtes/h |
| `model_events[]` | Feed d'événements load/unload |

---

## UI Layout

```
┌─────────────────────────────────────────────────────┐
│ PageHeader: Monitoring          [⚠ 2 alerts]  [10s ↻]│
└─────────────────────────────────────────────────────┘

── System Resources ─────────────────────────────────
[CPU %] [Memory %] [Disk %] [Uptime]   ← existant

── Live Activity ────────────────────────────────────
[Active Executions  ]  [SSE Streams ]  [Queue Depth ]
[ 3 / 10 slots      ]  [ 5 active   ]  [ 2 pending  ]
[████░░░░░░]           [■■■■■□□□□□ ]  [■□□□□□□□□□ ]
[⚠ Backpressure active]  ← si backpressure=true

── LLM & GPU ────────────────────────────────────────
[Avg Latency  ] [Tokens/sec ] [TTFT     ] [Req/hour ]
[  342 ms     ] [  48.2 t/s ] [ 180 ms  ] [   127   ]

VRAM Usage: 6.2 GB / 16 GB  [████████░░░░░░░░] 38.7%

Loaded Models:
┌──────────────────┬──────────┬─────────┬──────────┐
│ Model            │ VRAM     │ Quant   │ Expires  │
├──────────────────┼──────────┼─────────┼──────────┤
│ llama3.2:latest  │ 4.1 GB   │ Q4_K_M  │ 5m       │
│ nomic-embed-text │ 2.1 GB   │ F16     │ 1h       │
└──────────────────┴──────────┴─────────┴──────────┘

Recent Events:
  ↑ llama3.2:latest loaded   14:32:01
  ↓ mistral:7b   unloaded    14:28:44

── Infrastructure ───────────────────────────────────
[Redis: ✓ ok  2.1ms] [DB pool: 5/20] [Ollama: ✓ ok]

── Alerts ───────────────────────────────────────────
⚠ Memory usage at 87.3% exceeds threshold of 85%   ← si alerts

── Worker Status ────────────────────────────────────
  existant (streams + scheduler backpressure)

── Pipeline Health ──────────────────────────────────
  existant (table streams)
```

---

## Implementation Steps

### Step 1 — Auto-refresh

Remplacer le bouton "Refresh" manuel par un intervalle de 10 secondes.

- Utiliser `useEffect` + `setInterval` pour appeler `refetchAll` toutes les 10s
- Garder le bouton refresh pour un refresh manuel immédiat
- Afficher un indicateur "dernière mise à jour il y a Xs" dans le header

### Step 2 — Nouveau call `/internal/llm-gpu`

Ajouter dans `Monitoring.tsx` :

```ts
const { data: llmGpu, refetch: refetchLlmGpu } = useApi<LlmGpuResponse>(
  () => api.get("/internal/llm-gpu"),
  [],
);
```

Inclure `refetchLlmGpu` dans `refetchAll`.

Typer la réponse avec les interfaces :

```ts
interface OllamaRunningModel {
  name: string;
  size_vram_bytes: number;
  size_vram_gb: number;
  expires_at: string | null;
  context_length: number;
  parameter_size: string;
  quantization: string;
  family: string;
}

interface LlmGpuResponse {
  gpu_vram: {
    total_vram_gb: number;
    used_vram_gb: number;
    used_vram_percent: number;
    loaded_models: OllamaRunningModel[];
    model_count: number;
  };
  llm_performance: {
    avg_latency_ms: number;
    avg_tokens_per_second: number;
    avg_ttft_ms: number;
    total_requests_last_hour: number;
  };
  model_events: { type: "load" | "unload"; model: string; ts: string }[];
}
```

### Step 3 — Section "Live Activity"

4 tuiles avec `ProgressBar` :

- **Active Executions** : `scheduler.active_slots` / `scheduler.global_max`
  — couleur `bg-success` → `bg-warning` → `bg-destructive` selon % de saturation
  — badge `⚠ Backpressure active` si `scheduler.backpressure`
- **Queue Depth** : `worker.streams["tasks:executions"].length + worker.streams["tasks:models"].length`
- **SSE Streams** : `streaming.active_streams`
- **Uptime** : déjà existant, déplacer ici

Règle couleur pour active_slots progress bar :
- < 50% → `bg-success`
- 50–80% → `bg-warning`
- > 80% → `bg-destructive`

### Step 4 — Section "LLM & GPU"

**4 stat tuiles** (même style que System Resources) :
- Avg Latency (`avg_latency_ms`)
- Tokens/sec (`avg_tokens_per_second`)
- TTFT (`avg_ttft_ms`)
- Requests / hour (`total_requests_last_hour`)

**VRAM progress bar** :
- Label : `used_vram_gb GB / total_vram_gb GB`
- Couleur : même règle que active_slots (par %)
- `model_count` affiché à droite

**Table des modèles chargés** (`loaded_models[]`) :
- Colonnes : Model | VRAM (GB) | Quantization | Family | Expires
- "Expires" : formater `expires_at` en durée relative (ex: "5m", "1h")
- Si `loaded_models` est vide → `text-muted-foreground` "No models in VRAM"

**Feed d'événements** (`model_events[]`, derniers 5) :
- Icône ↑ (load, `text-success`) / ↓ (unload, `text-muted-foreground`)
- Heure formatée (HH:mm:ss)

### Step 5 — Section "Infrastructure"

3 badges horizontaux :
- **Redis** : `redis_healthy` → ✓/✗, `redis_latency_ms` ms
- **DB Pool** : `db_pool_size` / (`db_pool_size + db_pool_max_overflow`)
- **Ollama** : `ollama_status` → ✓/✗

### Step 6 — Section "Alerts"

Affichée seulement si `alerts.active_count > 0`.

- Badge rouge dans le `PageHeader` actions : `⚠ N alerts`
- Section listant chaque alerte avec : severity badge, message, `triggered_at`
- `severity: "critical"` → `text-destructive bg-destructive/10`
- `severity: "warning"` → `text-warning bg-warning/10`

---

## Component Breakdown

Tout dans `apps/ops/src/pages/Monitoring.tsx` — pas de nouveaux fichiers.

Sous-composants locaux (dans le même fichier) :
- `StatTile` — généralise la tuile existante (icon, label, value, progressBar, color)
- `InfraStatusBadge` — badge ✓/✗ avec latence
- `ModelTable` — table des modèles VRAM
- `ModelEventFeed` — feed load/unload
- `AlertList` — liste des alertes actives

---

## Constraints

- Aucune modification backend
- Tokens Tailwind sémantiques uniquement (`bg-success`, `text-warning`, etc.)
- Auto-refresh 10s — pas de WebSocket, pas de SSE pour le monitoring lui-même
- Graceful degradation : si `/internal/llm-gpu` échoue → section masquée
- Si `ollama_status = "unavailable"` → section LLM affiche un état vide propre
