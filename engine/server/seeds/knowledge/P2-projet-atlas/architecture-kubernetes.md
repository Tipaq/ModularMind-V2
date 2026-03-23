# Architecture Kubernetes — Projet Atlas

## Cluster Configuration

### Node Pools

| Pool | Type | Nodes | Purpose |
|------|------|-------|---------|
| `system` | b2-7 | 2 | K8s system (kube-system, cert-manager, ingress) |
| `app` | b2-30 | 3-6 | Engine, Worker, Nginx pods |
| `data` | b2-30 | 3 | PostgreSQL, Redis, Qdrant |
| `gpu` | t1-45 | 1 | Ollama (GPU inference) |

### Namespaces

```yaml
# Production workloads
apiVersion: v1
kind: Namespace
metadata:
  name: mm-production
  labels:
    environment: production
    team: engineering
---
# Staging workloads
apiVersion: v1
kind: Namespace
metadata:
  name: mm-staging
  labels:
    environment: staging
---
# Shared infrastructure
apiVersion: v1
kind: Namespace
metadata:
  name: mm-infra
  labels:
    component: infrastructure
---
# Monitoring stack
apiVersion: v1
kind: Namespace
metadata:
  name: mm-monitoring
```

## Helm Charts

### Structure

```
deploy/helm/
├── charts/
│   ├── modularmind/          # Umbrella chart
│   │   ├── Chart.yaml
│   │   ├── values.yaml
│   │   └── values-staging.yaml
│   ├── engine/               # Engine API + Worker
│   │   ├── templates/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   ├── hpa.yaml
│   │   │   ├── pdb.yaml
│   │   │   └── configmap.yaml
│   │   └── values.yaml
│   ├── nginx/                # Static SPAs + reverse proxy
│   ├── postgresql/           # CloudNativePG cluster
│   ├── redis/                # Redis Sentinel
│   └── qdrant/               # Qdrant cluster
```

### Engine Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: engine
  namespace: mm-production
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  selector:
    matchLabels:
      app: engine
  template:
    metadata:
      labels:
        app: engine
    spec:
      containers:
        - name: engine
          image: registry.modularmind.io/engine:{{ .Values.image.tag }}
          ports:
            - containerPort: 8000
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              cpu: 2000m
              memory: 2Gi
          readinessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 10
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 30
            periodSeconds: 15
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: mm-secrets
                  key: database-url
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: mm-secrets
                  key: redis-url
```

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: engine-hpa
  namespace: mm-production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: engine
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 2
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Pods
          value: 1
          periodSeconds: 120
```

## Database (CloudNativePG)

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: mm-postgres
  namespace: mm-infra
spec:
  instances: 3
  primaryUpdateStrategy: unsupervised
  storage:
    size: 100Gi
    storageClass: csi-cinder-high-speed
  resources:
    requests:
      memory: 2Gi
      cpu: 1000m
    limits:
      memory: 4Gi
      cpu: 2000m
  postgresql:
    parameters:
      max_connections: "200"
      shared_buffers: "1GB"
      work_mem: "16MB"
  backup:
    barmanObjectStore:
      destinationPath: s3://mm-backups/postgres/
      s3Credentials:
        accessKeyId:
          name: s3-creds
          key: ACCESS_KEY_ID
        secretAccessKey:
          name: s3-creds
          key: SECRET_ACCESS_KEY
    retentionPolicy: "30d"
  monitoring:
    enablePodMonitor: true
```

## Network Policies

```yaml
# Only allow Engine pods to reach PostgreSQL
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: postgres-access
  namespace: mm-infra
spec:
  podSelector:
    matchLabels:
      app: postgresql
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              environment: production
          podSelector:
            matchLabels:
              app: engine
        - namespaceSelector:
            matchLabels:
              environment: production
          podSelector:
            matchLabels:
              app: worker
      ports:
        - port: 5432
          protocol: TCP
```

## Ingress Configuration

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: mm-ingress
  namespace: mm-production
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "120"
spec:
  tls:
    - hosts:
        - app.modularmind.io
        - api.modularmind.io
      secretName: mm-tls
  rules:
    - host: app.modularmind.io
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: nginx
                port:
                  number: 80
    - host: api.modularmind.io
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: engine
                port:
                  number: 8000
```

## Monitoring

### Prometheus ServiceMonitor

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: engine-metrics
  namespace: mm-monitoring
spec:
  selector:
    matchLabels:
      app: engine
  namespaceSelector:
    matchNames:
      - mm-production
  endpoints:
    - port: http
      path: /metrics
      interval: 15s
```

### Alerting Rules

| Alert | Condition | Severity |
|-------|-----------|----------|
| EnginePodCrashLoop | restarts > 3 in 5m | critical |
| EngineHighLatency | p99 > 5s for 5m | warning |
| EngineHighErrorRate | 5xx > 5% for 2m | critical |
| PostgresReplicationLag | lag > 10s | warning |
| QdrantDiskUsage | usage > 85% | warning |
| WorkerStreamLag | pending > 1000 | warning |
