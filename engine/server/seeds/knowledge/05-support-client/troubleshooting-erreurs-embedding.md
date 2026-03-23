# Troubleshooting — Erreurs d'embedding

## Symptôme : Les documents restent en statut "Processing" indéfiniment

### Cause 1 : Ollama non disponible

**Diagnostic :** Vérifiez les logs du Worker :
```bash
docker logs modularmind-worker --tail 50 | grep -i "embedding"
```

Si vous voyez `ConnectionError: Cannot connect to Ollama`, le service d'embedding est indisponible.

**Solution :**
1. Vérifiez que Ollama est en cours d'exécution : `docker ps | grep ollama`
2. Vérifiez que le modèle d'embedding est téléchargé :
```bash
docker exec modularmind-ollama ollama list
# Vous devez voir nomic-embed-text dans la liste
```
3. Si le modèle manque, téléchargez-le :
```bash
docker exec modularmind-ollama ollama pull nomic-embed-text
```

### Cause 2 : Erreur de dimension des vecteurs

**Diagnostic :** Erreur dans les logs : `Vector dimension mismatch: expected 768, got 384`

**Solution :** Le modèle d'embedding doit produire des vecteurs de dimension 768 (dimension par défaut de la collection Qdrant). Si vous changez de modèle d'embedding :
1. Vérifiez la dimension du nouveau modèle
2. Recréez la collection Qdrant avec la bonne dimension
3. Ré-indexez tous les documents existants

### Cause 3 : Mémoire insuffisante

**Diagnostic :** Le Worker crash avec `OutOfMemoryError` pendant l'embedding.

**Solution :**
- Réduisez la taille des batches d'embedding (par défaut : 100 chunks par batch)
- Augmentez la mémoire allouée au conteneur Worker
- Passez à un modèle d'embedding plus léger

## Symptôme : Les recherches RAG ne retournent aucun résultat

### Cause 1 : Documents pas encore indexés

Vérifiez le statut des documents :
```bash
curl http://localhost:8000/rag/collections/COL_ID/documents
```
Si le statut est `processing`, attendez la fin du traitement.

### Cause 2 : Seuil de pertinence trop élevé

Le seuil par défaut est 0.7. Essayez de le baisser à 0.5 :
```json
{
  "query": "votre recherche",
  "threshold": 0.5
}
```

### Cause 3 : Mauvaise correspondance linguistique

Si vos documents sont en français mais que le modèle d'embedding est optimisé pour l'anglais, la qualité de recherche sera dégradée. Utilisez un modèle multilingue comme `multilingual-e5-large` ou `nomic-embed-text` (qui supporte le français).

## Modèles d'embedding recommandés

| Modèle | Dimension | Langues | Performance |
|--------|-----------|---------|-------------|
| nomic-embed-text | 768 | Multi | Bonne (recommandé) |
| text-embedding-3-small (OpenAI) | 1536 | Multi | Très bonne |
| multilingual-e5-large | 1024 | Multi | Excellente |
| all-MiniLM-L6-v2 | 384 | EN principalement | Correcte |