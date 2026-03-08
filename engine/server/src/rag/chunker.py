"""
Advanced chunking strategies for RAG document processing.

Provides multiple chunker implementations:
- RecursiveChunker: Character-based recursive splitting (legacy default)
- TokenAwareChunker: Token-based splitting using tiktoken
- ParentChildChunker: Hierarchical parent/child chunks
- SemanticChunker: Groups sentences by embedding similarity (requires nltk)
- ChunkerFactory: Factory for instantiating chunkers by strategy name
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from uuid import uuid4

import tiktoken

_ENCODING = tiktoken.encoding_for_model("gpt-4")


@dataclass
class Chunk:
    """Represents one text chunk with position and metadata."""

    content: str
    position: int
    parent_id: str | None = None
    chunk_level: int = 0  # 0=parent/standalone, 1=child
    metadata: dict = field(default_factory=dict)


class BaseChunker(ABC):
    """Abstract base class for chunking strategies."""

    @abstractmethod
    def split(self, text: str) -> list[Chunk]:
        """Split text into chunks."""
        ...


class RecursiveChunker(BaseChunker):
    """Recursive character text splitter (legacy default)."""

    def __init__(
        self,
        chunk_size: int = 500,
        chunk_overlap: int = 50,
        separators: list[str] | None = None,
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.separators = separators or ["\n\n", "\n", ". ", " ", ""]

    def split(self, text: str) -> list[Chunk]:
        if not text or not text.strip():
            return []

        text = _clean_text(text)
        splits = self._split_text(text, self.separators)
        merged = self._merge_splits(splits)

        return [Chunk(content=c, position=i) for i, c in enumerate(merged)]

    def _split_text(self, text: str, separators: list[str]) -> list[str]:
        if not separators:
            return [text[i : i + self.chunk_size] for i in range(0, len(text), self.chunk_size)]

        separator = separators[0]
        remaining = separators[1:]

        if separator == "":
            return [text[i : i + self.chunk_size] for i in range(0, len(text), self.chunk_size)]

        splits = text.split(separator)
        result = []
        for s in splits:
            if len(s) <= self.chunk_size:
                result.append(s)
            else:
                result.extend(self._split_text(s, remaining))

        return [s for s in result if s.strip()]

    def _merge_splits(self, splits: list[str]) -> list[str]:
        if not splits:
            return []

        chunks: list[str] = []
        current = ""

        for s in splits:
            test = (current + " " + s) if current else s
            if len(test) <= self.chunk_size:
                current = test
            else:
                if current:
                    chunks.append(current)
                if chunks and self.chunk_overlap > 0:
                    prev = chunks[-1]
                    overlap_start = max(0, len(prev) - self.chunk_overlap)
                    current = prev[overlap_start:] + " " + s
                else:
                    current = s
                while len(current) > self.chunk_size:
                    chunks.append(current[: self.chunk_size])
                    current = current[self.chunk_size - self.chunk_overlap :]

        if current:
            chunks.append(current)

        return [c.strip() for c in chunks if c.strip()]


class TokenAwareChunker(BaseChunker):
    """Token-based chunker using tiktoken (cl100k_base)."""

    def __init__(
        self,
        chunk_size_tokens: int = 256,
        overlap_tokens: int = 32,
        separators: list[str] | None = None,
    ):
        self.chunk_size_tokens = chunk_size_tokens
        self.overlap_tokens = overlap_tokens
        self.separators = separators or ["\n\n", "\n", ". ", " "]

    def split(self, text: str) -> list[Chunk]:
        if not text or not text.strip():
            return []

        text = _clean_text(text)
        segments = self._recursive_split(text, self.separators)
        merged = self._merge_by_tokens(segments)

        return [Chunk(content=c, position=i) for i, c in enumerate(merged)]

    def _recursive_split(self, text: str, separators: list[str]) -> list[str]:
        if not separators:
            return self._force_split_by_tokens(text)

        separator = separators[0]
        remaining = separators[1:]

        parts = text.split(separator)
        result = []
        for part in parts:
            if _token_count(part) <= self.chunk_size_tokens:
                result.append(part)
            else:
                result.extend(self._recursive_split(part, remaining))

        return [s for s in result if s.strip()]

    def _force_split_by_tokens(self, text: str) -> list[str]:
        """Force-split text by token count when no separator works."""
        tokens = _ENCODING.encode(text)
        chunks = []
        for i in range(0, len(tokens), self.chunk_size_tokens):
            chunk_tokens = tokens[i : i + self.chunk_size_tokens]
            chunks.append(_ENCODING.decode(chunk_tokens))
        return chunks

    def _merge_by_tokens(self, segments: list[str]) -> list[str]:
        if not segments:
            return []

        chunks: list[str] = []
        current = ""
        current_tokens = 0

        for seg in segments:
            seg_tokens = _token_count(seg)
            test_tokens = current_tokens + seg_tokens + (1 if current else 0)

            if test_tokens <= self.chunk_size_tokens:
                current = (current + " " + seg) if current else seg
                current_tokens = test_tokens
            else:
                if current:
                    chunks.append(current)

                # Apply overlap from previous chunk
                if chunks and self.overlap_tokens > 0:
                    prev_tokens = _ENCODING.encode(chunks[-1])
                    overlap_tokens = prev_tokens[-self.overlap_tokens :]
                    overlap_text = _ENCODING.decode(overlap_tokens)
                    current = overlap_text + " " + seg
                    current_tokens = _token_count(current)
                else:
                    current = seg
                    current_tokens = seg_tokens

                # Handle segments larger than chunk size
                while current_tokens > self.chunk_size_tokens:
                    tokens = _ENCODING.encode(current)
                    chunks.append(_ENCODING.decode(tokens[: self.chunk_size_tokens]))
                    remaining_tokens = tokens[self.chunk_size_tokens - self.overlap_tokens :]
                    current = _ENCODING.decode(remaining_tokens)
                    current_tokens = len(remaining_tokens)

        if current:
            chunks.append(current)

        return [c.strip() for c in chunks if c.strip()]


class ParentChildChunker(BaseChunker):
    """Hierarchical parent/child chunker.

    Creates parent chunks, then splits each into children.
    Both are stored in Qdrant — children for search, parents for context.
    """

    def __init__(
        self,
        parent_size_tokens: int = 1024,
        child_size_tokens: int = 256,
    ):
        self.parent_size_tokens = parent_size_tokens
        self.child_size_tokens = child_size_tokens
        self._parent_chunker = TokenAwareChunker(
            chunk_size_tokens=parent_size_tokens, overlap_tokens=0
        )
        self._child_chunker = TokenAwareChunker(
            chunk_size_tokens=child_size_tokens, overlap_tokens=32
        )

    def split(self, text: str) -> list[Chunk]:
        if not text or not text.strip():
            return []

        text = _clean_text(text)
        parent_chunks = self._parent_chunker.split(text)

        all_chunks: list[Chunk] = []
        child_pos = 0

        for parent in parent_chunks:
            parent_id = str(uuid4())
            # Store parent chunk (chunk_level=0)
            all_chunks.append(
                Chunk(
                    content=parent.content,
                    position=parent.position,
                    parent_id=None,
                    chunk_level=0,
                    metadata={"chunk_id": parent_id},
                )
            )

            # Split parent into children
            children = self._child_chunker.split(parent.content)
            for child in children:
                all_chunks.append(
                    Chunk(
                        content=child.content,
                        position=child_pos,
                        parent_id=parent_id,
                        chunk_level=1,
                    )
                )
                child_pos += 1

        return all_chunks


class SemanticChunker(BaseChunker):
    """Semantic chunker — groups consecutive sentences by embedding similarity.

    Splits text into sentences via nltk.sent_tokenize(), embeds all sentences
    in a single batch, then groups consecutive sentences while cosine similarity
    between adjacent embeddings stays above threshold.
    """

    def __init__(
        self,
        embedding_provider,
        similarity_threshold: float = 0.5,
        max_chunk_tokens: int = 512,
    ):
        self._embedding_provider = embedding_provider
        self.similarity_threshold = similarity_threshold
        self.max_chunk_tokens = max_chunk_tokens

    def split(self, text: str) -> list[Chunk]:
        """Synchronous wrapper — runs the async pipeline in a new event loop."""
        import asyncio

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            # We're inside an async context — create a new thread
            import concurrent.futures

            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(asyncio.run, self._split_async(text))
                return future.result()
        else:
            return asyncio.run(self._split_async(text))

    async def _split_async(self, text: str) -> list[Chunk]:
        if not text or not text.strip():
            return []

        text = _clean_text(text)

        # Sentence tokenization via nltk
        from nltk.tokenize import sent_tokenize

        sentences = sent_tokenize(text)
        if not sentences:
            return []

        if len(sentences) == 1:
            return [Chunk(content=sentences[0], position=0)]

        # Batch embed all sentences
        embeddings = await self._embedding_provider.embed_texts(sentences)

        # Group consecutive sentences by cosine similarity
        groups: list[list[int]] = [[0]]
        for i in range(1, len(sentences)):
            sim = _cosine_similarity(embeddings[i - 1], embeddings[i])
            current_group = groups[-1]

            # Check token limit for current group
            group_text = " ".join(sentences[j] for j in current_group) + " " + sentences[i]
            group_tokens = _token_count(group_text)

            if sim >= self.similarity_threshold and group_tokens <= self.max_chunk_tokens:
                current_group.append(i)
            else:
                groups.append([i])

        # Build chunks
        chunks: list[Chunk] = []
        for pos, group in enumerate(groups):
            content = " ".join(sentences[j] for j in group)
            # Enforce max token limit even for single-sentence groups
            if _token_count(content) > self.max_chunk_tokens:
                sub_chunker = TokenAwareChunker(
                    chunk_size_tokens=self.max_chunk_tokens, overlap_tokens=32
                )
                sub_chunks = sub_chunker.split(content)
                for sc in sub_chunks:
                    chunks.append(Chunk(content=sc.content, position=len(chunks)))
            else:
                chunks.append(Chunk(content=content, position=pos))

        return chunks


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    import math

    dot = sum(x * y for x, y in zip(a, b, strict=False))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


class ChunkerFactory:
    """Factory for creating chunker instances by strategy name."""

    @staticmethod
    def get_chunker(
        strategy: str,
        embedding_provider=None,
        **kwargs,
    ) -> BaseChunker:
        """Return a chunker for the given strategy.

        Args:
            strategy: "recursive", "token_aware", "parent_child", "semantic"
            embedding_provider: Required only for "semantic" strategy (Task 27)
            **kwargs: Passed to the chunker constructor

        Raises:
            ValueError: If strategy is unknown or missing requirements.
        """
        if strategy == "recursive":
            return RecursiveChunker(
                chunk_size=kwargs.get("chunk_size", 500),
                chunk_overlap=kwargs.get("chunk_overlap", 50),
            )
        elif strategy == "token_aware":
            return TokenAwareChunker(
                chunk_size_tokens=kwargs.get("chunk_size_tokens", 256),
                overlap_tokens=kwargs.get("overlap_tokens", 32),
            )
        elif strategy == "parent_child":
            return ParentChildChunker(
                parent_size_tokens=kwargs.get("parent_size_tokens", 1024),
                child_size_tokens=kwargs.get("child_size_tokens", 256),
            )
        elif strategy == "semantic":
            if embedding_provider is None:
                raise ValueError("embedding_provider is required for semantic chunking strategy")
            return SemanticChunker(
                embedding_provider=embedding_provider,
                similarity_threshold=kwargs.get("similarity_threshold", 0.5),
                max_chunk_tokens=kwargs.get("max_chunk_tokens", 512),
            )
        else:
            raise ValueError(f"Unknown chunking strategy: {strategy}")


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _clean_text(text: str) -> str:
    """Normalize whitespace."""
    text = re.sub(r" +", " ", text)
    text = re.sub(r"\n\s*\n", "\n\n", text)
    return text.strip()


def _token_count(text: str) -> int:
    """Count tokens using tiktoken."""
    return len(_ENCODING.encode(text))
