"""Object storage client — async S3-compatible wrapper (MinIO / AWS S3).

Provides upload, download, delete, and presigned URL generation for
RAG documents and chat attachments. Uses aiobotocore for non-blocking I/O.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from aiobotocore.session import get_session

logger = logging.getLogger(__name__)

_object_store: ObjectStore | None = None


class ObjectStore:
    """Async S3-compatible object storage client."""

    def __init__(
        self,
        endpoint_url: str,
        access_key: str,
        secret_key: str,
        region: str = "us-east-1",
    ) -> None:
        self._endpoint_url = endpoint_url
        self._access_key = access_key
        self._secret_key = secret_key
        self._region = region
        self._session = get_session()

    @asynccontextmanager
    async def _client(self):
        async with self._session.create_client(
            "s3",
            endpoint_url=self._endpoint_url,
            aws_access_key_id=self._access_key,
            aws_secret_access_key=self._secret_key,
            region_name=self._region,
        ) as client:
            yield client

    async def ensure_buckets(self, bucket_names: list[str]) -> None:
        """Create buckets if they don't exist (idempotent)."""
        async with self._client() as client:
            response = await client.list_buckets()
            existing = {b["Name"] for b in response.get("Buckets", [])}

            for bucket in bucket_names:
                if bucket not in existing:
                    try:
                        await client.create_bucket(Bucket=bucket)
                        logger.info("Created S3 bucket: %s", bucket)
                    except client.exceptions.BucketAlreadyOwnedByYou:
                        pass
                    except (OSError, ConnectionError) as exc:
                        logger.error("Failed to create bucket %s: %s", bucket, exc)
                        raise

    async def upload(
        self,
        bucket: str,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload an object. Returns the object key."""
        async with self._client() as client:
            await client.put_object(
                Bucket=bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
            )
        logger.debug("Uploaded %s/%s (%d bytes)", bucket, key, len(data))
        return key

    async def download(self, bucket: str, key: str) -> bytes:
        """Download an object's full content."""
        async with self._client() as client:
            response = await client.get_object(Bucket=bucket, Key=key)
            async with response["Body"] as stream:
                return await stream.read()

    async def download_stream(
        self, bucket: str, key: str, chunk_size: int = 64 * 1024,
    ) -> AsyncIterator[bytes]:
        """Stream an object in chunks (for large file downloads)."""
        async with self._client() as client:
            response = await client.get_object(Bucket=bucket, Key=key)
            async with response["Body"] as stream:
                while True:
                    chunk = await stream.read(chunk_size)
                    if not chunk:
                        break
                    yield chunk

    async def delete(self, bucket: str, key: str) -> None:
        """Delete an object."""
        async with self._client() as client:
            await client.delete_object(Bucket=bucket, Key=key)
        logger.debug("Deleted %s/%s", bucket, key)

    async def delete_many(self, bucket: str, keys: list[str]) -> None:
        """Delete multiple objects in a single request."""
        if not keys:
            return
        async with self._client() as client:
            await client.delete_objects(
                Bucket=bucket,
                Delete={"Objects": [{"Key": k} for k in keys]},
            )
        logger.debug("Deleted %d objects from %s", len(keys), bucket)

    async def head(self, bucket: str, key: str) -> dict[str, Any]:
        """Get object metadata (size, content_type) without downloading."""
        async with self._client() as client:
            response = await client.head_object(Bucket=bucket, Key=key)
            return {
                "content_type": response.get("ContentType", "application/octet-stream"),
                "content_length": response.get("ContentLength", 0),
                "last_modified": response.get("LastModified"),
            }

    async def presigned_url(
        self, bucket: str, key: str, expires_in: int = 3600,
    ) -> str:
        """Generate a presigned download URL."""
        async with self._client() as client:
            url = await client.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket, "Key": key},
                ExpiresIn=expires_in,
            )
            return url

    async def list_objects(
        self, bucket: str, prefix: str = "", max_keys: int = 1000,
    ) -> list[dict[str, Any]]:
        """List objects in a bucket with optional prefix."""
        async with self._client() as client:
            response = await client.list_objects_v2(
                Bucket=bucket, Prefix=prefix, MaxKeys=max_keys,
            )
            return response.get("Contents", [])

    async def exists(self, bucket: str, key: str) -> bool:
        """Check if an object exists."""
        try:
            await self.head(bucket, key)
            return True
        except (OSError, ConnectionError):
            return False


def get_object_store() -> ObjectStore:
    """Get or create the singleton ObjectStore instance."""
    global _object_store
    if _object_store is None:
        from src.infra.config import get_settings

        settings = get_settings()
        _object_store = ObjectStore(
            endpoint_url=settings.S3_ENDPOINT,
            access_key=settings.S3_ACCESS_KEY,
            secret_key=settings.S3_SECRET_KEY,
            region=settings.S3_REGION,
        )
    return _object_store
