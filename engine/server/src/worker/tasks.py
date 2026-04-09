"""Task registry — re-exports all task handlers for runner.py."""
from src.worker.document_task import document_process_handler
from src.worker.execution_task import graph_execution_handler
from src.worker.model_task import model_pull_handler

__all__ = [
    "graph_execution_handler",
    "document_process_handler",
    "model_pull_handler",
]
