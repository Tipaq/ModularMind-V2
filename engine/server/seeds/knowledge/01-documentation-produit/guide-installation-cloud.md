# Guide de déploiement Cloud — ModularMind

## Introduction

ModularMind peut être déployé sur les principaux fournisseurs cloud (AWS, GCP, Azure) en utilisant des services managés pour réduire la charge opérationnelle. Ce guide couvre les architectures recommandées et les étapes de déploiement.

## Architecture cloud recommandée (AWS)

```
                        ┌──────────────┐
                        │  CloudFront  │
                        │    (CDN)     │
                        └──────┬───────┘
                               │
                        ┌──────┴───────┐
                        │     ALB      │
                        │ (Load Bal.)  │
                        └──────┬───────┘
                               │
                    ┌──────────┼──────────┐
                    │          │          │
              ┌─────┴────┐ ┌──┴───┐ ┌────┴─────┐
              │  ECS/EKS  │ │ ECS  │ │   S3     │
              │  Engine   │ │Worker│ │ (Static) │
              └─────┬─────┘ └──┬───┘ └──────────┘
                    │          │
         ┌──────────┼──────────┤
         │          │          │
   ┌─────┴────┐ ┌──┴────┐ ┌───┴──────┐
   │   RDS    │ │Elasti-│ │  EC2 GPU  │
   │PostgreSQL│ │Cache  │ │  Qdrant   │
   └──────────┘ └───────┘ └──────────┘
```

## Déploiement AWS avec Terraform

### Prérequis

- AWS CLI configuré avec les bonnes permissions
- Terraform v1.6+
- Un domaine DNS configuré dans Route 53

### Module Terraform principal

```hcl
module "modularmind" {
  source = "./modules/modularmind"

  environment    = "production"
  region         = "eu-west-3"  # Paris
  domain_name    = "modularmind.votreentreprise.fr"

  # Base de données
  db_instance_class    = "db.r6g.xlarge"
  db_allocated_storage = 100
  db_multi_az          = true

  # Cache Redis
  redis_node_type      = "cache.r6g.large"
  redis_num_replicas   = 2

  # Compute
  engine_cpu           = 2048  # 2 vCPU
  engine_memory        = 4096  # 4 Go
  engine_desired_count = 2
  worker_cpu           = 1024
  worker_memory        = 2048
  worker_desired_count = 1

  # GPU pour Ollama (optionnel)
  enable_ollama        = true
  gpu_instance_type    = "g4dn.xlarge"
}
```

### Variables d'environnement ECS

```json
{
  "containerDefinitions": [
    {
      "name": "engine",
      "image": "ghcr.io/modularmind/engine:latest",
      "environment": [
        { "name": "DATABASE_URL", "value": "REFERENCE_SSM_PARAMETER" },
        { "name": "REDIS_URL", "value": "REFERENCE_SSM_PARAMETER" },
        { "name": "QDRANT_URL", "value": "http://qdrant.internal:6333" }
      ],
      "secrets": [
        { "name": "JWT_SECRET", "valueFrom": "arn:aws:ssm:eu-west-3:ACCOUNT:parameter/modularmind/jwt-secret" },
        { "name": "OPENAI_API_KEY", "valueFrom": "arn:aws:ssm:eu-west-3:ACCOUNT:parameter/modularmind/openai-key" }
      ]
    }
  ]
}
```

## Déploiement GCP (Kubernetes/GKE)

### Créer le cluster GKE

```bash
gcloud container clusters create modularmind-prod \
  --region europe-west1 \
  --machine-type e2-standard-4 \
  --num-nodes 3 \
  --enable-autoscaling --min-nodes 2 --max-nodes 6
```

### Manifestes Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: modularmind-engine
spec:
  replicas: 2
  selector:
    matchLabels:
      app: engine
  template:
    spec:
      containers:
      - name: engine
        image: ghcr.io/modularmind/engine:latest
        ports:
        - containerPort: 8000
        resources:
          requests:
            cpu: "1"
            memory: "2Gi"
          limits:
            cpu: "2"
            memory: "4Gi"
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 15
          periodSeconds: 10
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: modularmind-secrets
              key: database-url
```

## Auto-scaling

### Scaling horizontal (recommandé)

Configurez le HPA (Horizontal Pod Autoscaler) basé sur le CPU et les requêtes par seconde :

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: engine-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: modularmind-engine
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

## Estimation des coûts mensuels (AWS, région eu-west-3)

| Service | Configuration | Coût estimé |
|---------|---------------|-------------|
| RDS PostgreSQL | db.r6g.xlarge, Multi-AZ | ~450€ |
| ElastiCache Redis | cache.r6g.large, 2 replicas | ~320€ |
| ECS Fargate (Engine x2) | 2 vCPU, 4 Go | ~180€ |
| ECS Fargate (Worker x1) | 1 vCPU, 2 Go | ~60€ |
| EC2 GPU (Ollama) | g4dn.xlarge | ~420€ |
| ALB + CloudFront | — | ~80€ |
| **Total estimé** | | **~1510€/mois** |

> **Note** : Le coût GPU peut être éliminé si vous utilisez exclusivement des providers cloud (OpenAI, Anthropic) au lieu d'Ollama.

## Considérations de sécurité cloud

- Utilisez des **VPC privés** pour tous les services de données (RDS, Redis, Qdrant)
- Activez le **chiffrement au repos** (KMS) pour RDS et les volumes EBS
- Configurez les **Security Groups** pour limiter le trafic inter-services
- Stockez les secrets dans **AWS SSM Parameter Store** ou **GCP Secret Manager**
- Activez les **VPC Flow Logs** et **CloudTrail** pour l'audit

## Support

Pour l'assistance au déploiement cloud, contactez l'équipe DevOps à devops@modularmind.io.
