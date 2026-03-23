# PRD — Pipeline RAG multi-collection

## Résumé

Le pipeline RAG (Retrieval-Augmented Generation) permet aux agents d'accéder à une base de connaissances documentaire pour fournir des réponses précises et sourcées.

## Problème

Les agents LLM ont une connaissance limitée et figée (cutoff de formation). Pour répondre à des questions spécifiques à l'entreprise (procédures internes, documentation produit, FAQ), ils doivent accéder à une base de connaissances mise à jour régulièrement.

## User Stories

1. **En tant qu'opérateur**, je veux créer des collections de documents thématiques avec des niveaux d'accès différents.
2. **En tant qu'opérateur**, je veux uploader des documents (PDF, DOCX, MD) et qu'ils soient automatiquement indexés.
3. **En tant qu'utilisateur**, je veux que l'agent cite ses sources quand il utilise la base de connaissances.
4. **En tant qu'administrateur**, je veux monitorer la qualité de la recherche (scores, taux d'utilisation).

## Architecture

```
Upload → Extraction texte → Chunking → Embedding → Qdrant
                                                      ↓
Query → Embedding query → Hybrid Search → Reranking → Résultats
                              ↓                          ↓
                        Dense + BM25              Context injection
```

## Exigences fonctionnelles

### Ingestion
- Formats supportés : PDF, DOCX, DOC, TXT, MD
- Taille max : 50 Mo par fichier
- Extraction de texte : pypdf/pdfplumber (PDF), python-docx (DOCX)
- 4 stratégies de chunking : recursive, token_aware, parent_child, semantic
- Traitement asynchrone via Redis Streams

### Recherche
- Hybrid search : dense vectors (768-dim, cosine) + sparse BM25
- Fusion par Reciprocal Rank Fusion (RRF)
- Reranking optionnel : Cohere, cross-encoder, ou noop
- Filtrage par scope (GLOBAL/GROUP/AGENT) + double-gate ACL

### Contrôle d'accès
- Collections GLOBAL : accessibles à tous
- Collections GROUP : restreintes par `allowed_groups`
- Collections AGENT : privées à un utilisateur
- Double vérification : PostgreSQL (quelles collections) + Qdrant (payload filter)

## Exigences non-fonctionnelles

| Exigence | Cible |
|----------|-------|
| Latence de recherche | < 500ms P95 |
| Temps d'indexation | < 5 min pour un PDF de 100 pages |
| Recall@10 | > 85% sur un benchmark interne |
| Disponibilité | 99.9% (fallback BM25 si Qdrant slow) |

## Timeline

| Phase | Livrable | Date |
|-------|----------|------|
| Phase 1 | Pipeline basique (recursive chunking, dense search) | v3.0 |
| Phase 2 | Multi-collection, scopes, hybrid search | v3.1 |
| Phase 3 | Semantic chunking, parent-child, reranking | v3.2 |
| Phase 4 | Auto-refresh, incremental indexing, analytics | v3.3 (planifié) |