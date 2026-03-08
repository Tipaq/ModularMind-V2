"""
Message parser for explicit routing detection.

Parses user messages for @mentions, /graph: commands, and @create directives
before the LLM routing call. If explicit routing is detected, the supervisor
skips the LLM call entirely.
"""

import logging
import re

from src.domain_config.provider import ConfigProvider

from .schemas import ParsedMessage

logger = logging.getLogger(__name__)

# Regex patterns (checked in priority order)
_CREATE_RE = re.compile(r"@create\b\s+(.+)", re.IGNORECASE | re.DOTALL)
_GRAPH_RE = re.compile(r"/graph:([\w-]+)")
_QUOTED_MENTION_RE = re.compile(r'@"([^"]{1,60})"')
_SIMPLE_MENTION_RE = re.compile(r"@([\w-]+)")


class MessageParser:
    """Parses user messages for explicit routing directives.

    Parsing order (highest priority first):
    1. @create directive — checked FIRST to avoid conflict with @agent
    2. /graph:name command
    3. @AgentName mentions (quoted then simple, after @create is excluded)
    """

    def __init__(self, config_provider: ConfigProvider):
        self.config_provider = config_provider

    async def parse(self, content: str) -> ParsedMessage:
        """Parse user message for explicit routing directives.

        Args:
            content: Raw user message

        Returns:
            ParsedMessage with routing directives extracted
        """
        raw_content = content
        clean = content
        explicit_agent: str | None = None
        explicit_graph: str | None = None
        create_directive = False
        create_instructions: str | None = None
        matched_agent_ids: list[str] = []

        # 1. Check @create FIRST (before @agent patterns)
        create_match = _CREATE_RE.search(clean)
        if create_match:
            create_directive = True
            create_instructions = create_match.group(1).strip()
            clean = clean[: create_match.start()] + clean[create_match.end() :]
            clean = clean.strip()
            return ParsedMessage(
                raw_content=raw_content,
                clean_content=clean,
                create_directive=create_directive,
                create_instructions=create_instructions,
            )

        # 2. Check /graph:name
        graph_match = _GRAPH_RE.search(clean)
        if graph_match:
            graph_name = graph_match.group(1)
            graph_id = await self._resolve_graph(graph_name)
            if graph_id:
                explicit_graph = graph_id
                clean = clean[: graph_match.start()] + clean[graph_match.end() :]
                clean = clean.strip()

        # 3. Check @mentions (quoted first, then simple)
        # Build agent name lookup once
        agents = await self.config_provider.list_agents()
        name_to_id: dict[str, str] = {a.name.lower(): str(a.id) for a in agents}

        # Quoted mentions: @"Agent With Spaces"
        for match in _QUOTED_MENTION_RE.finditer(clean):
            candidate = match.group(1).strip().lower()
            agent_id = name_to_id.get(candidate)
            if agent_id:
                matched_agent_ids.append(agent_id)
                clean = clean[: match.start()] + clean[match.end() :]

        # Simple mentions: @AgentName (skip if already matched via quotes)
        remaining = clean
        for match in _SIMPLE_MENTION_RE.finditer(remaining):
            candidate = match.group(1).strip().lower()
            # Skip "create" — already handled above
            if candidate == "create":
                continue
            agent_id = name_to_id.get(candidate)
            if agent_id and agent_id not in matched_agent_ids:
                matched_agent_ids.append(agent_id)
                clean = clean.replace(match.group(0), "", 1)

        clean = re.sub(r"\s{2,}", " ", clean).strip()

        if len(matched_agent_ids) == 1:
            explicit_agent = matched_agent_ids[0]
        elif len(matched_agent_ids) > 1:
            # Multiple mentions — will trigger MULTI_ACTION in supervisor
            explicit_agent = matched_agent_ids[0]

        return ParsedMessage(
            raw_content=raw_content,
            clean_content=clean,
            explicit_agent=explicit_agent,
            explicit_graph=explicit_graph,
        )

    @property
    def matched_agent_ids(self) -> list[str]:
        """Access the last parsed message's matched agent IDs.

        Used by the supervisor to detect MULTI_ACTION from multiple mentions.
        """
        return getattr(self, "_last_matched_ids", [])

    async def parse_multi(self, content: str) -> tuple[ParsedMessage, list[str]]:
        """Parse and also return all matched agent IDs for MULTI_ACTION detection.

        Returns:
            Tuple of (ParsedMessage, list of matched agent_ids)
        """
        raw_content = content
        clean = content
        matched_ids: list[str] = []

        # 1. @create check
        create_match = _CREATE_RE.search(clean)
        if create_match:
            instructions = create_match.group(1).strip()
            clean = clean[: create_match.start()] + clean[create_match.end() :]
            return ParsedMessage(
                raw_content=raw_content,
                clean_content=clean.strip(),
                create_directive=True,
                create_instructions=instructions,
            ), []

        # 2. /graph:name
        explicit_graph = None
        graph_match = _GRAPH_RE.search(clean)
        if graph_match:
            graph_name = graph_match.group(1)
            graph_id = await self._resolve_graph(graph_name)
            if graph_id:
                explicit_graph = graph_id
                clean = clean[: graph_match.start()] + clean[graph_match.end() :]

        # 3. @mentions
        agents = await self.config_provider.list_agents()
        name_to_id = {a.name.lower(): str(a.id) for a in agents}

        for match in _QUOTED_MENTION_RE.finditer(clean):
            candidate = match.group(1).strip().lower()
            agent_id = name_to_id.get(candidate)
            if agent_id:
                matched_ids.append(agent_id)
                clean = clean[: match.start()] + clean[match.end() :]

        remaining = clean
        for match in _SIMPLE_MENTION_RE.finditer(remaining):
            candidate = match.group(1).strip().lower()
            if candidate == "create":
                continue
            agent_id = name_to_id.get(candidate)
            if agent_id and agent_id not in matched_ids:
                matched_ids.append(agent_id)
                clean = clean.replace(match.group(0), "", 1)

        clean = re.sub(r"\s{2,}", " ", clean).strip()

        explicit_agent = matched_ids[0] if matched_ids else None

        parsed = ParsedMessage(
            raw_content=raw_content,
            clean_content=clean,
            explicit_agent=explicit_agent,
            explicit_graph=explicit_graph,
        )
        return parsed, matched_ids

    async def _resolve_graph(self, name: str) -> str | None:
        """Resolve a graph name to its ID (case-insensitive)."""
        graphs = await self.config_provider.list_graphs()
        for g in graphs:
            if g.name.lower() == name.lower():
                return str(g.id)
        return None
