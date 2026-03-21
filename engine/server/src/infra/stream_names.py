"""Canonical Redis stream names — import from here, don't use string literals."""

# Task queues
STREAM_EXECUTIONS = "tasks:executions"
STREAM_MODELS = "tasks:models"
STREAM_DOCUMENTS = "tasks:documents"

# Memory pipeline
STREAM_MEMORY_RAW = "memory:raw"
STREAM_MEMORY_EXTRACTED = "memory:extracted"
STREAM_MEMORY_SCORED = "memory:scored"

# RAG pipeline
STREAM_RAG_EXTRACTED = "rag:extracted"
STREAM_RAG_EMBEDDED = "rag:embedded"

# Scheduled tasks
STREAM_SCHEDULED_TASK_TRIGGER = "tasks:scheduled_task_trigger"

# Dead letter queue
STREAM_DLQ = "dead_letter"
