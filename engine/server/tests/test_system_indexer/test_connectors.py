"""Tests for built-in connectors."""

import pytest

from src.system_indexer.connectors.rest_api import RestApiConnector

PETSTORE_SPEC = {
    "openapi": "3.0.0",
    "info": {"title": "Petstore", "version": "1.0.0"},
    "paths": {
        "/pets": {
            "get": {
                "operationId": "listPets",
                "summary": "List all pets",
                "parameters": [
                    {"name": "limit", "in": "query", "schema": {"type": "integer"}}
                ],
            },
            "post": {
                "operationId": "createPet",
                "summary": "Create a pet",
            },
        },
        "/pets/{petId}": {
            "get": {
                "operationId": "showPetById",
                "summary": "Info for a specific pet",
                "parameters": [
                    {"name": "petId", "in": "path", "schema": {"type": "string"}}
                ],
            },
        },
    },
    "components": {
        "schemas": {
            "Pet": {
                "type": "object",
                "description": "A pet in the store",
                "properties": {
                    "id": {"type": "integer"},
                    "name": {"type": "string"},
                    "owner": {"$ref": "#/components/schemas/Owner"},
                },
            },
            "Owner": {
                "type": "object",
                "description": "Pet owner",
                "properties": {
                    "name": {"type": "string"},
                },
            },
        }
    },
}


class TestRestApiConnector:
    @pytest.mark.asyncio
    async def test_discover_structure_from_spec(self):
        connector = RestApiConnector()
        connector._spec = PETSTORE_SPEC

        units = await connector.discover_structure()
        endpoint_units = [u for u in units if u.kind == "endpoint"]
        field_units = [u for u in units if u.kind == "field"]
        entity_units = [u for u in units if u.kind == "entity"]

        assert len(endpoint_units) == 3
        assert len(entity_units) == 2
        assert any(u.name == "listPets" for u in endpoint_units)
        assert any(u.name == "Pet" for u in entity_units)
        assert any(u.name == "limit" for u in field_units)

    @pytest.mark.asyncio
    async def test_discover_relationships_finds_refs(self):
        connector = RestApiConnector()
        connector._spec = PETSTORE_SPEC
        await connector.discover_structure()

        relationships = await connector.discover_relationships()
        ref_rels = [r for r in relationships if r.kind == "references"]
        assert len(ref_rels) == 1
        assert ref_rels[0].metadata["property"] == "owner"

    @pytest.mark.asyncio
    async def test_health_check_true_with_spec(self):
        connector = RestApiConnector()
        connector._spec = PETSTORE_SPEC
        assert await connector.health_check()

    @pytest.mark.asyncio
    async def test_health_check_false_without_spec(self):
        connector = RestApiConnector()
        assert not await connector.health_check()

    @pytest.mark.asyncio
    async def test_connect_returns_false_without_url(self):
        connector = RestApiConnector()
        result = await connector.connect({})
        assert result is False


class TestRestApiConnectorEmptySpec:
    @pytest.mark.asyncio
    async def test_empty_paths(self):
        connector = RestApiConnector()
        connector._spec = {"openapi": "3.0.0", "paths": {}}
        units = await connector.discover_structure()
        assert units == []

    @pytest.mark.asyncio
    async def test_no_components(self):
        connector = RestApiConnector()
        connector._spec = {
            "openapi": "3.0.0",
            "paths": {"/test": {"get": {"summary": "Test"}}},
        }
        units = await connector.discover_structure()
        assert len(units) == 1
        assert units[0].kind == "endpoint"
