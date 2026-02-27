"""Embedder handler — memory:extracted → Qdrant + PostgreSQL.

Generates embeddings for extracted+scored facts and stores in vector DB + relational DB.
This is the final stage of the 2-stage memory pipeline.
"""

# TODO: Implement embedding generation and dual storage
# - Reads from stream 'memory:extracted'
# - Generates embeddings via embedding provider
# - Stores vectors in Qdrant (memory collection)
# - Stores metadata in PostgreSQL (MemoryEntry table)
