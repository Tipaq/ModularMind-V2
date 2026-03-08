"""
CLI commands for ModularMind Runtime.

Usage:
    python -m src.cli create-admin --email admin@example.com
    python -m src.cli reset-admin --email admin@example.com
    python -m src.cli reload-config
    python -m src.cli add-agent --name "Bot" --model "openai:gpt-4o" --prompt "..."
    python -m src.cli add-user --email user@acme.com --role operator --groups hr,finance
    python -m src.cli add-group --name "HR" --description "Human Resources"
    python -m src.cli convert-configs --config-dir /data/config
"""

import asyncio
import json
import secrets
import string
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import click
import yaml

from src.auth import AuthService, UserCreate, UserRole
from src.domain_config import get_config_provider
from src.infra.database import async_session_maker


def generate_password(length: int = 16) -> str:
    """Generate a secure random password meeting AuthService strength requirements."""
    alphabet = string.ascii_letters + string.digits + string.punctuation
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(length))
        try:
            AuthService.validate_password_strength(pw)
            return pw
        except ValueError:
            continue  # Regenerate until valid


async def _create_admin_async(email: str, password: str | None = None) -> str:
    """Create owner user and return password."""
    async with async_session_maker() as session:
        auth_service = AuthService(session)

        existing = await auth_service.get_user_by_email(email)
        if existing:
            raise click.ClickException(f"User already exists: {email}")

        password = password or generate_password()

        # CLI bypass: skip password strength validation when explicitly provided
        from src.auth.models import User

        user = User(
            email=email,
            hashed_password=auth_service.hash_password(password),
            role=UserRole.OWNER,
            is_active=True,
        )
        session.add(user)
        await session.commit()

        return password


async def _reset_admin_async(email: str) -> str:
    """Reset admin password and return new password."""
    async with async_session_maker() as session:
        auth_service = AuthService(session)

        user = await auth_service.get_user_by_email(email)
        if not user:
            raise click.ClickException(f"User not found: {email}")

        # Generate new password
        password = generate_password()

        # Update password
        await auth_service.update_password(user, password)
        await session.commit()

        return password


@click.group()
def cli() -> None:
    """ModularMind Runtime CLI."""
    pass


# ─── Existing Commands ────────────────────────────────────────────────────────


@cli.command()
@click.option("--email", required=True, help="Admin email address")
@click.option("--password", default=None, help="Password (random if omitted)")
def create_admin(email: str, password: str | None) -> None:
    """Create a local owner user (bootstrap).

    In production, users are synced from the platform via the sync-service.
    Use this command only for initial setup or emergency access.
    """
    password = asyncio.run(_create_admin_async(email, password))

    click.echo()
    click.echo("=" * 50)
    click.echo("Admin user created successfully!")
    click.echo("=" * 50)
    click.echo()
    click.echo(f"  Email:    {email}")
    click.echo(f"  Password: {password}")
    click.echo()
    click.echo("IMPORTANT: Save this password now!")
    click.echo("It will not be shown again.")
    click.echo("=" * 50)


@cli.command()
@click.option("--email", required=True, help="Admin email address")
def reset_admin(email: str) -> None:
    """Reset an admin user's password.

    Generates a new secure random password and displays it once.
    """
    password = asyncio.run(_reset_admin_async(email))

    click.echo()
    click.echo("=" * 50)
    click.echo("Password reset successfully!")
    click.echo("=" * 50)
    click.echo()
    click.echo(f"  Email:        {email}")
    click.echo(f"  New Password: {password}")
    click.echo()
    click.echo("IMPORTANT: Save this password now!")
    click.echo("It will not be shown again.")
    click.echo("=" * 50)


@cli.command()
def reload_config() -> None:
    """Reload agent and graph configurations.

    Triggers a reload of all configuration files from disk.
    """
    provider = get_config_provider()
    provider.reload()

    # Load configs to verify
    async def _count_configs() -> tuple[int, int]:
        agents = await provider.list_agents()
        graphs = await provider.list_graphs()
        return len(agents), len(graphs)

    agent_count, graph_count = asyncio.run(_count_configs())

    click.echo()
    click.echo("Configuration reloaded successfully!")
    click.echo(f"  Agents: {agent_count}")
    click.echo(f"  Graphs: {graph_count}")


@cli.command()
def version() -> None:
    """Show version information."""
    from src.infra.config import get_settings

    settings = get_settings()
    click.echo(f"{settings.APP_NAME} v{settings.APP_VERSION}")


# ─── Add Agent ────────────────────────────────────────────────────────────────


@cli.command("add-agent")
@click.option("--name", required=True, help="Agent name")
@click.option("--model", required=True, help="Model ID (e.g., 'openai:gpt-4o')")
@click.option("--prompt", required=True, help="System prompt")
@click.option("--config-dir", default=None, help="Config directory")
def add_agent(name: str, model: str, prompt: str, config_dir: str | None) -> None:
    """Create a new agent YAML file in the config directory."""
    from src.infra.config import get_settings

    settings = get_settings()
    base = Path(config_dir or settings.CONFIG_DIR)
    agents_dir = base / "agents"
    agents_dir.mkdir(parents=True, exist_ok=True)

    agent_id = str(uuid4())
    agent_config = {
        "id": agent_id,
        "name": name,
        "model_id": model,
        "system_prompt": prompt,
        "version": "1.0.0",
        "temperature": 0.7,
        "max_tokens": 2048,
        "rag_config": {
            "enabled": False,
            "collection_ids": [],
            "retrieval_count": 5,
            "similarity_threshold": 0.7,
        },
    }

    agent_path = agents_dir / f"{agent_id}.yaml"
    agent_path.write_text(
        yaml.dump(agent_config, default_flow_style=False, allow_unicode=True, sort_keys=False)
    )

    click.echo(f"Agent '{name}' created: {agent_path}")


# ─── Add User ─────────────────────────────────────────────────────────────────


@cli.command("add-user")
@click.option("--email", required=True, help="User email")
@click.option(
    "--role",
    required=True,
    type=click.Choice(["owner", "admin", "user"]),
    help="User role",
)
@click.option("--groups", default="", help="Comma-separated group slugs")
def add_user(email: str, role: str, groups: str) -> None:
    """Create a new user in the database with optional group memberships.

    Requires a running PostgreSQL database.
    Groups must already exist (use add-group first).
    """
    group_slugs = [g.strip() for g in groups.split(",") if g.strip()] if groups else []

    async def _create() -> None:
        async with async_session_maker() as session:
            auth_service = AuthService(session)

            existing = await auth_service.get_user_by_email(email)
            if existing:
                raise click.ClickException(f"User already exists: {email}")

            password = generate_password()

            user = await auth_service.create_user(
                UserCreate(
                    email=email,
                    password=password,
                    role=UserRole(role),
                )
            )

            # Add group memberships
            if group_slugs:
                from sqlalchemy import select

                from src.groups.models import UserGroup, UserGroupMember

                for slug in group_slugs:
                    result = await session.execute(select(UserGroup).where(UserGroup.slug == slug))
                    group = result.scalar_one_or_none()
                    if not group:
                        click.echo(f"  Warning: group '{slug}' not found, skipping.")
                        continue

                    member = UserGroupMember(
                        user_id=user.id,
                        group_id=group.id,
                        role="member",
                    )
                    session.add(member)

            await session.commit()

            click.echo()
            click.echo(f"User '{email}' created (role: {role})")
            if group_slugs:
                click.echo(f"  Groups: {', '.join(group_slugs)}")
            click.echo(f"  Password: {password}")
            click.echo("  Save this password now!")

    asyncio.run(_create())


# ─── Add Group ────────────────────────────────────────────────────────────────


@cli.command("add-group")
@click.option("--name", required=True, help="Group display name")
@click.option("--description", default="", help="Group description")
def add_group(name: str, description: str) -> None:
    """Create a new user group in the database.

    Requires a running PostgreSQL database.
    The slug is auto-generated from the name.
    """
    import re

    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

    async def _create() -> None:
        from sqlalchemy import select

        from src.groups.models import UserGroup

        async with async_session_maker() as session:
            result = await session.execute(select(UserGroup).where(UserGroup.slug == slug))
            if result.scalar_one_or_none():
                raise click.ClickException(f"Group '{slug}' already exists.")

            group = UserGroup(
                id=str(uuid4()),
                name=name,
                slug=slug,
                description=description,
            )
            session.add(group)
            await session.commit()
            click.echo(f"Group '{name}' (slug: {slug}) created.")

    asyncio.run(_create())


# ─── Convert Configs ──────────────────────────────────────────────────────────


@cli.command("convert-configs")
@click.option("--config-dir", default=None, help="Config directory")
@click.option("--keep-json", is_flag=True, help="Keep original JSON files as backup")
def convert_configs(config_dir: str | None, keep_json: bool) -> None:
    """Convert existing JSON config files to YAML.

    Scans agents/, graphs/, models/ for *.json files
    and writes equivalent *.yaml files.
    """
    from src.infra.config import get_settings

    settings = get_settings()
    base = Path(config_dir or settings.CONFIG_DIR)

    converted = 0
    for subdir in ("agents", "graphs", "models"):
        resource_dir = base / subdir
        if not resource_dir.exists():
            continue

        for json_file in resource_dir.glob("*.json"):
            try:
                data = json.loads(json_file.read_text())
                yaml_file = json_file.with_suffix(".yaml")
                yaml_file.write_text(
                    yaml.dump(data, default_flow_style=False, allow_unicode=True, sort_keys=False)
                )

                if not keep_json:
                    json_file.unlink()

                click.echo(f"  Converted {subdir}/{json_file.name} -> {subdir}/{yaml_file.name}")
                converted += 1
            except Exception as e:
                click.echo(f"  Error converting {json_file}: {e}", err=True)

    click.echo(f"\n{converted} files converted.")
    if keep_json:
        click.echo("Original JSON files kept as backup.")


# ─── Seed Configs ────────────────────────────────────────────────────────────


@cli.command("seed-configs")
@click.option("--seed-dir", required=True, help="Directory containing seed YAML files")
@click.option("--config-dir", default=None, help="Target config directory (default: CONFIG_DIR)")
@click.option("--force", is_flag=True, help="Overwrite existing files")
def seed_configs(seed_dir: str, config_dir: str | None, force: bool) -> None:
    """Copy seed configuration files into the config directory.

    Copies agents, graphs, models, and manifest from the seed directory
    into the runtime config directory. Skips files that already exist
    unless --force is used.

    This command is called automatically on first boot by entrypoint.sh.
    """
    import shutil

    from src.infra.config import get_settings

    settings = get_settings()
    source = Path(seed_dir)
    target = Path(config_dir or settings.CONFIG_DIR)

    if not source.exists():
        raise click.ClickException(f"Seed directory not found: {source}")

    copied = 0
    skipped = 0

    # Copy manifest.yaml (only if not present)
    manifest_src = source / "manifest.yaml"
    manifest_dst = target / "manifest.yaml"
    if manifest_src.exists():
        if not manifest_dst.exists() or force:
            # Add created timestamp
            manifest_data = yaml.safe_load(manifest_src.read_text())
            manifest_data["created"] = datetime.now(UTC).isoformat()
            target.mkdir(parents=True, exist_ok=True)
            manifest_dst.write_text(
                yaml.dump(
                    manifest_data, default_flow_style=False, allow_unicode=True, sort_keys=False
                )
            )
            click.echo("  Seeded manifest.yaml")
            copied += 1
        else:
            skipped += 1

    # Copy resource directories (agents, graphs, models)
    for subdir in ("agents", "graphs", "models"):
        src_subdir = source / subdir
        if not src_subdir.exists():
            continue

        dst_subdir = target / subdir
        dst_subdir.mkdir(parents=True, exist_ok=True)

        for src_file in src_subdir.glob("*.yaml"):
            dst_file = dst_subdir / src_file.name
            if dst_file.exists() and not force:
                click.echo(f"  Skipped {subdir}/{src_file.name} (already exists)")
                skipped += 1
                continue

            shutil.copy2(src_file, dst_file)
            click.echo(f"  Seeded {subdir}/{src_file.name}")
            copied += 1

    click.echo(f"\nSeed complete: {copied} files copied, {skipped} skipped.")


# ─── Qdrant Commands ─────────────────────────────────────────────────────────


@cli.command("qdrant-snapshot")
def qdrant_snapshot() -> None:
    """Create Qdrant knowledge collection snapshot for backup."""

    async def _run() -> None:
        from src.infra.config import get_settings
        from src.infra.qdrant import qdrant_factory

        settings = get_settings()
        name = settings.QDRANT_COLLECTION_KNOWLEDGE
        try:
            snapshot_name = await qdrant_factory.create_snapshot(name)
            click.echo(f"Snapshot created: {name} -> {snapshot_name}")
        except Exception as e:
            click.echo(f"ERROR: Failed to snapshot {name}: {e}", err=True)

        await qdrant_factory.close()

    asyncio.run(_run())


@cli.command("backfill-qdrant")
@click.option("--batch-size", default=500, help="Batch size for upsert")
def backfill_qdrant(batch_size: int) -> None:
    """Backfill existing RAG chunk embeddings to Qdrant knowledge collection."""

    async def _run() -> None:
        from sqlalchemy import text

        from src.infra.config import get_settings
        from src.infra.database import async_session_maker
        from src.rag.vector_store import ChunkData, QdrantRAGVectorStore

        settings = get_settings()

        click.echo("Backfilling RAG chunks to Qdrant knowledge collection...")
        async with async_session_maker() as session:
            # Read embeddings via raw SQL (no pgvector Python dep needed)
            result = await session.execute(
                text(
                    "SELECT c.id, c.content, c.embedding::float8[] as emb, "
                    "c.document_id, c.collection_id, c.chunk_index, c.metadata, "
                    "col.scope, col.allowed_groups, col.owner_user_id "
                    "FROM rag_chunks c "
                    "JOIN rag_collections col ON c.collection_id = col.id "
                    "WHERE c.embedding IS NOT NULL"
                )
            )
            rows = result.fetchall()

        total = len(rows)
        click.echo(f"Found {total} chunks with embeddings")

        vs = QdrantRAGVectorStore(settings.QDRANT_COLLECTION_KNOWLEDGE)
        for i in range(0, total, batch_size):
            batch_rows = rows[i : i + batch_size]
            chunks = []
            for row in batch_rows:
                scope = row.scope or "global"
                groups = list(row.allowed_groups) if row.allowed_groups else []
                agent_id = row.owner_user_id if scope == "agent" else None
                chunks.append(
                    ChunkData(
                        id=row.id,
                        content=row.content,
                        embedding=list(row.emb),
                        scope=scope,
                        group_slugs=groups,
                        agent_id=agent_id,
                        user_id=None,
                        document_id=row.document_id,
                        collection_id=row.collection_id,
                        chunk_index=row.chunk_index,
                        metadata=row.metadata or {},
                    )
                )
            await vs.upsert_chunks(chunks)
            click.echo(f"Backfilled {min(i + batch_size, total)}/{total} chunks")

        # Verify
        stats = await vs.get_collection_stats()
        click.echo(f"Qdrant knowledge: {stats['points_count']} points")
        if stats["points_count"] < total:
            click.echo(
                f"WARNING: Qdrant has {stats['points_count']} points "
                f"but PG has {total} chunks with embeddings",
                err=True,
            )
            raise SystemExit(1)

        click.echo("Backfill complete")

        from src.infra.qdrant import qdrant_factory

        await qdrant_factory.close()

    asyncio.run(_run())


# ─── Recall Testing ──────────────────────────────────────────────────────────


@cli.command("recall-test")
@click.option("--suite", required=True, help="Path to test suite YAML/JSON file")
@click.option("--collection-id", required=True, help="Collection ID to test against")
@click.option("--limit", default=5, help="Top-K results to evaluate")
@click.option("--threshold", default=0.0, help="Score threshold for search")
@click.option("--pass-threshold", default=0.8, help="Minimum avg Recall@K to pass (exit 0)")
def recall_test(
    suite: str,
    collection_id: str,
    limit: int,
    threshold: float,
    pass_threshold: float,
) -> None:
    """Run a recall test suite and print results.

    Exit code 0 if avg Recall@K >= pass-threshold, 1 otherwise.
    Useful in CI/CD to validate retrieval quality after changes.
    """

    async def _run() -> None:
        from src.recall.runner import RecallTestRunner
        from src.recall.schemas import RecallTestSuite

        runner = RecallTestRunner()
        loaded = await runner.load_suite_from_file(Path(suite))

        # Override collection_id if provided
        test_suite = RecallTestSuite(
            name=loaded.name,
            collection_id=collection_id,
            test_cases=loaded.test_cases,
        )

        result = await runner.run_suite(
            test_suite,
            search_params={"limit": limit, "threshold": threshold},
        )

        # Print results table
        click.echo()
        click.echo(f"Suite: {result.suite_name}")
        click.echo(f"{'Query':<50} {'Recall@K':>10} {'MRR':>8} {'NDCG':>8} {'Latency':>10}")
        click.echo("-" * 90)

        for r in result.results:
            query_display = (
                r.test_case.query[:47] + "..." if len(r.test_case.query) > 50 else r.test_case.query
            )
            click.echo(
                f"{query_display:<50} {r.recall_at_k:>10.3f} {r.mrr:>8.3f} "
                f"{r.ndcg:>8.3f} {r.latency_ms:>8.1f}ms"
            )

        click.echo("-" * 90)
        click.echo(
            f"{'AVERAGE':<50} {result.avg_recall_at_k:>10.3f} {result.avg_mrr:>8.3f} "
            f"{result.avg_ndcg:>8.3f} {result.avg_latency_ms:>8.1f}ms"
        )
        click.echo()

        if result.avg_recall_at_k >= pass_threshold:
            click.echo(f"PASS: avg Recall@K ({result.avg_recall_at_k:.3f}) >= {pass_threshold}")
        else:
            click.echo(f"FAIL: avg Recall@K ({result.avg_recall_at_k:.3f}) < {pass_threshold}")
            raise SystemExit(1)

        # Close Qdrant
        from src.infra.qdrant import qdrant_factory

        await qdrant_factory.close()

    asyncio.run(_run())


# ─── Entry Point ──────────────────────────────────────────────────────────────


def main() -> None:
    """CLI entry point."""
    cli()


if __name__ == "__main__":
    main()
