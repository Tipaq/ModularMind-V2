"""
Shared BM25 tokenization for Qdrant sparse vectors.

Stateless and deterministic — the same text always produces the same
sparse vector regardless of process or restart.
"""

from __future__ import annotations

import re
from collections import Counter

import mmh3
from qdrant_client import models

# Common English stop words (~150)
_STOP_WORDS: frozenset[str] = frozenset({
    "a", "about", "above", "after", "again", "against", "all", "am", "an",
    "and", "any", "are", "aren't", "as", "at", "be", "because", "been",
    "before", "being", "below", "between", "both", "but", "by", "can",
    "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does",
    "doesn't", "doing", "don't", "down", "during", "each", "few", "for",
    "from", "further", "get", "got", "had", "hadn't", "has", "hasn't",
    "have", "haven't", "having", "he", "her", "here", "hers", "herself",
    "him", "himself", "his", "how", "i", "if", "in", "into", "is", "isn't",
    "it", "it's", "its", "itself", "just", "let's", "me", "might", "more",
    "most", "mustn't", "my", "myself", "no", "nor", "not", "of", "off",
    "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves",
    "out", "over", "own", "s", "same", "shall", "shan't", "she", "should",
    "shouldn't", "so", "some", "such", "t", "than", "that", "the", "their",
    "theirs", "them", "themselves", "then", "there", "these", "they", "this",
    "those", "through", "to", "too", "under", "until", "up", "very", "was",
    "wasn't", "we", "were", "weren't", "what", "when", "where", "which",
    "while", "who", "whom", "why", "will", "with", "won't", "would",
    "wouldn't", "you", "your", "yours", "yourself", "yourselves",
})

_WORD_RE = re.compile(r"\w+")
_MOD = 2**31  # unsigned mmh3 output range


def tokenize_bm25(text: str) -> models.SparseVector:
    """Convert *text* into a Qdrant sparse vector for BM25 search.

    Pipeline: lowercase -> extract words -> remove stop words ->
    mmh3 unsigned hash -> term frequency counts -> SparseVector.
    """
    tokens = _WORD_RE.findall(text.lower())
    filtered = [t for t in tokens if t not in _STOP_WORDS]
    if not filtered:
        return models.SparseVector(indices=[], values=[])

    freq: Counter[int] = Counter()
    for token in filtered:
        idx = mmh3.hash(token, signed=False) % _MOD
        freq[idx] += 1

    indices = sorted(freq.keys())
    values = [float(freq[i]) for i in indices]

    assert all(i >= 0 for i in indices), "Sparse vector indices must be non-negative"
    return models.SparseVector(indices=indices, values=values)
