"""Pipeline consumer — runs inside the worker process.

Reads from Redis Streams and dispatches to pipeline handlers
(extractor → embedder). This is NOT a standalone process anymore;
it's started by the worker runner alongside the scheduler.
"""

# TODO: Implement consumer that:
# - Creates consumer groups for 'memory:raw' and 'memory:extracted'
# - Dispatches events to extractor and embedder handlers
# - Handles errors with retry + DLQ
# - Runs as an asyncio task within the worker process
