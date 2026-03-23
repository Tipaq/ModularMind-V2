# Procédure d'audit de sécurité — ModularMind

## Calendrier des audits

| Type d'audit | Fréquence | Responsable | Dernier audit |
|-------------|-----------|-------------|---------------|
| Scan de vulnérabilités (infra) | Mensuel | DevOps | 2026-02-15 |
| Scan de dépendances (code) | Hebdomadaire (CI) | Automatique | Continu |
| Pentest externe | Annuel | Cabinet externe | 2025-10-20 |
| Revue de configuration | Trimestriel | Sécurité | 2026-01-10 |
| Audit SOC 2 | Annuel | Auditeur certifié | 2025-11-30 |

## Scan de vulnérabilités

### Infrastructure

```bash
# Scan des images Docker avec Trivy
trivy image ghcr.io/modularmind/engine:latest
trivy image ghcr.io/modularmind/nginx:latest

# Scan de la configuration Kubernetes
trivy config k8s/
```

### Dépendances

```bash
# Python (safety / pip-audit)
pip-audit --requirement requirements.txt

# Node.js (npm audit)
pnpm audit --audit-level=high

# Snyk (intégré dans le CI)
snyk test --severity-threshold=high
```

### OWASP Top 10 Checklist

| # | Vulnérabilité | Mesures en place |
|---|---------------|------------------|
| A01 | Broken Access Control | RBAC + scope-based ACL |
| A02 | Cryptographic Failures | TLS 1.3, bcrypt passwords, JWT signed |
| A03 | Injection | Parameterized queries (SQLAlchemy), input validation |
| A04 | Insecure Design | Threat modeling in ADRs, security reviews |
| A05 | Security Misconfiguration | Hardened Docker images, no default credentials |
| A06 | Vulnerable Components | Automated dependency scanning (Snyk + Trivy) |
| A07 | Auth Failures | Rate limiting, account lockout, MFA |
| A08 | Data Integrity Failures | HMAC webhook signatures, signed JWTs |
| A09 | Logging Failures | Structured logging, audit trail, no PII in logs |
| A10 | SSRF | URL validation, internal network isolation |

## Remédiation

### SLA de correction

| Sévérité | CVSS | Délai de correction |
|----------|------|---------------------|
| Critique | 9.0-10.0 | 24 heures |
| Haute | 7.0-8.9 | 7 jours |
| Moyenne | 4.0-6.9 | 30 jours |
| Basse | 0.1-3.9 | 90 jours |

### Processus

1. Vulnérabilité détectée → Ticket Jira créé automatiquement
2. Assignation au responsable selon le composant
3. Correction développée et testée
4. Review de sécurité obligatoire pour les vulnérabilités critiques/hautes
5. Déploiement prioritaire
6. Vérification post-correction

## Pentest annuel

### Périmètre

- API Engine (tous les endpoints)
- Applications web (Chat, Ops, Platform)
- Infrastructure réseau (Docker, Kubernetes)
- Mécanismes d'authentification et d'autorisation

### Méthodologie

- **Black box** : Test sans connaissance préalable du système
- **Grey box** : Test avec des comptes utilisateur de différents rôles
- **OWASP Testing Guide** v4 comme référence

### Rapport

Le rapport de pentest inclut :
- Résumé exécutif (pour la direction)
- Vulnérabilités détaillées avec preuves (POC)
- Classification par sévérité (CVSS v3)
- Recommandations de remédiation
- Suivi des remédiations (re-test inclus)

## Contact

Responsable sécurité : Lucas Girard — security@modularmind.io