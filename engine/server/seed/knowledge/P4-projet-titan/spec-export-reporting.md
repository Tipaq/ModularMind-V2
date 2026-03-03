# Spécification — Export & Reporting (Projet Titan Phase 3)

## Vue d'ensemble

Le module d'export permet aux utilisateurs de générer des rapports périodiques sur l'utilisation de ModularMind. Les rapports sont disponibles en PDF (branded) et CSV (données brutes).

## Types de Rapports

### 1. Rapport d'Utilisation Mensuel

**Audience :** Management, Product
**Contenu :**
- Résumé exécutif (KPIs clés du mois)
- Nombre de conversations et messages
- Répartition par agent et par canal
- Taux de satisfaction utilisateur
- Tendances vs mois précédent

### 2. Rapport de Coûts LLM

**Audience :** Finance, CTO, Engineering
**Contenu :**
- Coût total par provider et modèle
- Tokens consommés (input vs output)
- Coût moyen par conversation
- Top 10 agents les plus coûteux
- Projection de coûts pour le mois suivant
- Recommandations d'optimisation

### 3. Rapport de Qualité

**Audience :** Product, Support
**Contenu :**
- Score de qualité moyen par agent
- Taux de satisfaction (thumbs up/down)
- Taux d'escalation
- Top 10 questions les plus fréquentes
- Conversations problématiques (score < 0.5)

### 4. Rapport Technique

**Audience :** Engineering, DevOps
**Contenu :**
- Latence P50/P95/P99 par endpoint
- Taux d'erreur et breakdown par type
- Uptime et incidents
- Performance RAG (précision des recherches)
- Utilisation mémoire et storage

## Architecture Export

```python
class ReportGenerator:
    """Génère des rapports en PDF et CSV."""

    async def generate(
        self,
        report_type: ReportType,
        tenant_id: str,
        period: DateRange,
        format: Literal["pdf", "csv"] = "pdf",
    ) -> ReportOutput:
        # 1. Fetch des données depuis les continuous aggregates
        data = await self.analytics_repo.get_report_data(
            report_type, tenant_id, period
        )

        # 2. Génération du rapport
        if format == "pdf":
            return await self._generate_pdf(report_type, data, period)
        else:
            return await self._generate_csv(report_type, data, period)

    async def _generate_pdf(self, report_type, data, period):
        # Rendu HTML avec Jinja2
        template = self.jinja_env.get_template(f"reports/{report_type.value}.html")
        html = template.render(data=data, period=period, generated_at=datetime.utcnow())

        # Conversion HTML → PDF avec WeasyPrint
        pdf_bytes = weasyprint.HTML(string=html).write_pdf()

        return ReportOutput(
            filename=f"modularmind-{report_type.value}-{period.start:%Y-%m}.pdf",
            content_type="application/pdf",
            data=pdf_bytes,
        )

    async def _generate_csv(self, report_type, data, period):
        # Streaming CSV pour gros volumes
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=data.columns)
        writer.writeheader()
        for row in data.rows:
            writer.writerow(row)

        return ReportOutput(
            filename=f"modularmind-{report_type.value}-{period.start:%Y-%m}.csv",
            content_type="text/csv",
            data=output.getvalue().encode(),
        )
```

## Rapports Programmés

### Configuration

```json
{
  "id": "sched_abc123",
  "report_type": "usage_monthly",
  "format": "pdf",
  "schedule": "0 8 1 * *",
  "recipients": [
    {"email": "cto@modularmind.io", "type": "email"},
    {"webhook_url": "https://slack.com/...", "type": "slack"}
  ],
  "filters": {
    "agent_ids": null,
    "channels": null
  },
  "active": true
}
```

### Schedules Prédéfinis

| Fréquence | Cron | Livraison |
|-----------|------|-----------|
| Quotidien | `0 8 * * *` | 8h00, rapport du jour précédent |
| Hebdomadaire | `0 8 * * 1` | Lundi 8h00, rapport de la semaine |
| Mensuel | `0 8 1 * *` | 1er du mois 8h00, rapport du mois précédent |

### Livraison

- **Email** : PDF en pièce jointe + résumé dans le corps du mail
- **Slack** : Message avec lien de téléchargement (expiration 7j)
- **S3/Webhook** : Upload vers un bucket S3 ou envoi via webhook

## API Endpoints

### POST /analytics/reports/generate

Génération on-demand d'un rapport.

```json
{
  "report_type": "cost_llm",
  "format": "pdf",
  "period": {
    "start": "2026-02-01",
    "end": "2026-02-28"
  },
  "filters": {
    "agent_ids": ["agt_support01"],
    "models": ["gpt-4o", "gpt-4o-mini"]
  }
}
```

**Response (202):**
```json
{
  "report_id": "rpt_abc123",
  "status": "generating",
  "estimated_completion": "2026-03-01T10:00:30Z"
}
```

### GET /analytics/reports/{report_id}

Récupérer le statut/lien du rapport.

```json
{
  "report_id": "rpt_abc123",
  "status": "ready",
  "download_url": "/analytics/reports/rpt_abc123/download",
  "expires_at": "2026-03-08T10:00:00Z",
  "metadata": {
    "format": "pdf",
    "size_bytes": 245000,
    "pages": 8,
    "generated_at": "2026-03-01T10:00:28Z"
  }
}
```

### POST /analytics/reports/schedules

Créer un rapport programmé.

### GET /analytics/reports/schedules

Lister les rapports programmés.

## Template PDF

Le rapport PDF utilise un template HTML/CSS avec le branding ModularMind :

- **Header** : logo ModularMind + titre du rapport + période
- **Résumé exécutif** : 3-4 KPIs principaux dans des cards colorées
- **Graphiques** : charts statiques générés avec matplotlib
- **Tableaux** : données détaillées avec pagination
- **Footer** : "Generated by ModularMind Analytics — Confidential"

### Exemple Structure (Rapport Coûts)

```
Page 1: Couverture
  - Logo + "Rapport de Coûts LLM"
  - Période: Mars 2026
  - Généré le: 01/04/2026

Page 2: Résumé Exécutif
  - Coût total: $1,247.50
  - Variation: +12% vs Février
  - Modèle le plus utilisé: gpt-4o-mini (72% des appels)
  - Modèle le plus coûteux: gpt-4o (71% du coût)

Page 3: Répartition par Modèle
  - Bar chart horizontal
  - Tableau: modèle, appels, tokens, coût, %

Page 4: Répartition par Agent
  - Pie chart
  - Tableau: agent, modèle principal, conversations, coût, coût/conv

Page 5: Tendance Quotidienne
  - Line chart (30 jours)
  - Annotation des pics avec causes identifiées

Page 6: Recommandations
  - "Envisagez de migrer l'agent Support vers gpt-4o-mini (-$320/mois)"
  - "L'agent Sales utilise 40% de tokens en system prompt — optimisez le prompt"
```
