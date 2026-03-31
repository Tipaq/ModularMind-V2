"""REST API connector — parses OpenAPI specs into structural units."""

from __future__ import annotations

import hashlib
import json
import logging
from uuid import uuid4

import httpx

from src.system_indexer.connector_base import BaseSystemConnector
from src.system_indexer.models import Relationship, StructuralUnit

logger = logging.getLogger(__name__)


class RestApiConnector(BaseSystemConnector):
    """Discovers endpoints, parameters, and schemas from an OpenAPI spec."""

    def __init__(self) -> None:
        self._spec: dict = {}
        self._endpoint_ids: dict[str, str] = {}
        self._schema_ids: dict[str, str] = {}

    async def connect(self, config: dict) -> bool:
        spec_url = config.get("spec_url", "")
        if not spec_url:
            return False

        openapi_url = spec_url.rstrip("/")
        candidates = [
            f"{openapi_url}/openapi.json",
            f"{openapi_url}/swagger.json",
            openapi_url,
        ]

        async with httpx.AsyncClient(timeout=30) as client:
            for url in candidates:
                try:
                    response = await client.get(url)
                    if response.status_code == 200:
                        self._spec = response.json()
                        if "paths" in self._spec or "openapi" in self._spec:
                            return True
                except (httpx.HTTPError, json.JSONDecodeError):
                    continue

        return False

    async def discover_structure(self) -> list[StructuralUnit]:
        units: list[StructuralUnit] = []

        for path, methods in self._spec.get("paths", {}).items():
            for method, operation in methods.items():
                if method.startswith("x-") or method == "parameters":
                    continue
                uid = str(uuid4())
                name = f"{method.upper()} {path}"
                op_id = operation.get("operationId", name)
                summary = operation.get("summary", operation.get("description", ""))
                params = operation.get("parameters", [])
                sig = _build_endpoint_signature(method, path, params)
                body_hash = hashlib.sha256(sig.encode()).hexdigest()[:16]

                self._endpoint_ids[name] = uid
                units.append(
                    StructuralUnit(
                        id=uid,
                        system_id="",
                        kind="endpoint",
                        name=op_id,
                        qualified_name=name,
                        summary=summary[:200] if summary else f"Endpoint {name}",
                        signature=sig,
                        body_hash=body_hash,
                        depth=0,
                        metadata={
                            "method": method.upper(),
                            "path": path,
                            "tags": operation.get("tags", []),
                        },
                    )
                )

                for param in params:
                    param_uid = str(uuid4())
                    param_name = param.get("name", "")
                    param_in = param.get("in", "query")
                    param_type = param.get("schema", {}).get("type", "string")
                    units.append(
                        StructuralUnit(
                            id=param_uid,
                            system_id="",
                            kind="field",
                            name=param_name,
                            qualified_name=f"{name}.{param_name}",
                            summary=param.get(
                                "description", f"Parameter {param_name}"
                            ),
                            signature=f"{param_in}: {param_type}",
                            depth=1,
                            parent_id=uid,
                            metadata={"in": param_in, "required": param.get("required", False)},
                        )
                    )

        for schema_name, schema_def in (
            self._spec.get("components", {}).get("schemas", {}).items()
        ):
            schema_uid = str(uuid4())
            self._schema_ids[schema_name] = schema_uid
            props = schema_def.get("properties", {})
            sig = f"Schema({', '.join(props.keys())})" if props else f"Schema {schema_name}"
            body_hash = hashlib.sha256(
                json.dumps(schema_def, sort_keys=True).encode()
            ).hexdigest()[:16]

            units.append(
                StructuralUnit(
                    id=schema_uid,
                    system_id="",
                    kind="entity",
                    name=schema_name,
                    qualified_name=f"schemas.{schema_name}",
                    summary=schema_def.get("description", f"Schema {schema_name}"),
                    signature=sig,
                    body_hash=body_hash,
                    depth=0,
                    metadata={"type": schema_def.get("type", "object")},
                )
            )

        return units

    async def discover_relationships(self) -> list[Relationship]:
        relationships: list[Relationship] = []

        for schema_name, schema_def in (
            self._spec.get("components", {}).get("schemas", {}).items()
        ):
            source_id = self._schema_ids.get(schema_name)
            if not source_id:
                continue
            for prop_name, prop_def in schema_def.get("properties", {}).items():
                ref = prop_def.get("$ref", "")
                if not ref:
                    items_ref = prop_def.get("items", {}).get("$ref", "")
                    ref = items_ref
                if ref:
                    ref_name = ref.split("/")[-1]
                    target_id = self._schema_ids.get(ref_name)
                    if target_id:
                        relationships.append(
                            Relationship(
                                source_id=source_id,
                                target_id=target_id,
                                kind="references",
                                weight=1.0,
                                metadata={"property": prop_name},
                            )
                        )

        return relationships

    async def health_check(self) -> bool:
        return bool(self._spec)


def _build_endpoint_signature(method: str, path: str, params: list) -> str:
    param_strs = [f"{p.get('name', '?')}: {p.get('in', '?')}" for p in params[:5]]
    params_sig = f"({', '.join(param_strs)})" if param_strs else "()"
    return f"{method.upper()} {path} {params_sig}"
