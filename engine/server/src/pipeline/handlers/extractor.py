"""Extractor handler — memory:raw → memory:extracted.

Reads raw conversation turns, extracts and scores facts using LLM.
Merged extractor + scorer into a single LLM call for efficiency.

Produces: { facts: [{ text, importance, novelty }] }
"""

# TODO: Migrate from V1 memory/fact_extractor.py
# - Single LLM call to extract facts AND score importance/novelty
# - Reads from stream 'memory:raw'
# - Publishes to stream 'memory:extracted'
