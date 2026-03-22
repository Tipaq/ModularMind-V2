"""Image generation tools — generate images via LLM providers."""

from __future__ import annotations

import json
import logging
from typing import Any
from uuid import uuid4

logger = logging.getLogger(__name__)


def get_image_generation_tool_definitions() -> list[dict[str, Any]]:
    """Return tool definitions for image generation category."""
    return [
        {
            "type": "function",
            "function": {
                "name": "image_generate",
                "description": (
                    "Generate an image from a text prompt using an AI image model. "
                    "Returns a URL to the generated image stored in the file system."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "prompt": {
                            "type": "string",
                            "description": "Text description of the image to generate.",
                        },
                        "model_id": {
                            "type": "string",
                            "description": "Image model ID (e.g., 'openai:dall-e-3'). Uses default if omitted.",
                        },
                        "size": {
                            "type": "string",
                            "enum": ["256x256", "512x512", "1024x1024", "1024x1792", "1792x1024"],
                            "description": "Image size (default: 1024x1024).",
                        },
                    },
                    "required": ["prompt"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "image_list_models",
                "description": "List available image generation models.",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            },
        },
    ]


async def execute_image_generation_tool(
    name: str,
    args: dict[str, Any],
    object_store: Any | None = None,
) -> str:
    """Execute an image generation tool."""
    if name == "image_generate":
        return await _image_generate(args, object_store)
    if name == "image_list_models":
        return _image_list_models()
    return f"Error: unknown image tool '{name}'"


async def _image_generate(args: dict, object_store: Any | None) -> str:
    """Generate an image via OpenAI DALL-E API."""
    prompt = args.get("prompt", "").strip()
    if not prompt:
        return "Error: prompt is required."

    size = args.get("size", "1024x1024")

    try:
        import httpx

        from src.infra.config import get_settings

        settings = get_settings()
        api_key = settings.OPENAI_API_KEY
        if not api_key:
            return "Error: OpenAI API key not configured for image generation."

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/images/generations",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": "dall-e-3",
                    "prompt": prompt,
                    "n": 1,
                    "size": size,
                    "response_format": "b64_json",
                },
            )
            response.raise_for_status()
            data = response.json()

        image_b64 = data["data"][0]["b64_json"]
        revised_prompt = data["data"][0].get("revised_prompt", prompt)

        import base64

        image_bytes = base64.b64decode(image_b64)

        if object_store:
            file_id = str(uuid4())
            s3_key = f"generated-images/{file_id}.png"
            await object_store.upload("agent-files", s3_key, image_bytes, "image/png")
            url = await object_store.presigned_url("agent-files", s3_key)
            return json.dumps({
                "url": url,
                "size": len(image_bytes),
                "revised_prompt": revised_prompt,
            })

        return json.dumps({
            "status": "generated",
            "size": len(image_bytes),
            "revised_prompt": revised_prompt,
            "note": "Image generated but no storage configured for URL.",
        })

    except Exception as e:
        logger.exception("Image generation failed")
        return f"Error generating image: {e}"


def _image_list_models() -> str:
    """List available image generation models."""
    models = [
        {"id": "openai:dall-e-3", "name": "DALL-E 3", "sizes": ["1024x1024", "1024x1792", "1792x1024"]},
        {"id": "openai:dall-e-2", "name": "DALL-E 2", "sizes": ["256x256", "512x512", "1024x1024"]},
    ]
    return json.dumps(models)
