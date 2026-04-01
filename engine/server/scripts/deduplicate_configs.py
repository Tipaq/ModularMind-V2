"""One-shot script — remove duplicate agents and graphs (keep newest per name).

Usage:
    python scripts/deduplicate_configs.py [--dry-run]

Connects to the engine DB using the same default DSN as the engine.
For each name that appears more than once among active configs, keeps the
most recently created row and deletes ALL versions of the others.
"""

import argparse
import asyncio
import os

import asyncpg

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://modularmind:modularmind@localhost:5432/modularmind",
)

FIND_DUPLICATE_AGENTS = """
    SELECT name, array_agg(id ORDER BY created_at DESC) AS ids
    FROM agent_configs
    WHERE is_active = true
    GROUP BY name
    HAVING count(*) > 1;
"""

FIND_DUPLICATE_GRAPHS = """
    SELECT name, array_agg(id ORDER BY created_at DESC) AS ids
    FROM graph_configs
    WHERE is_active = true
    GROUP BY name
    HAVING count(*) > 1;
"""

DELETE_AGENT_VERSIONS = "DELETE FROM agent_configs WHERE id = $1;"
DELETE_GRAPH_VERSIONS = "DELETE FROM graph_configs WHERE id = $1;"


async def deduplicate(dry_run: bool) -> None:
    conn = await asyncpg.connect(DATABASE_URL)

    try:
        agent_dupes = await conn.fetch(FIND_DUPLICATE_AGENTS)
        graph_dupes = await conn.fetch(FIND_DUPLICATE_GRAPHS)

        if not agent_dupes and not graph_dupes:
            print("No duplicates found — nothing to do.")
            return

        for row in agent_dupes:
            name = row["name"]
            ids = row["ids"]
            keep_id = ids[0]
            remove_ids = ids[1:]
            print(f"Agent '{name}': keeping {keep_id}, removing {len(remove_ids)} duplicate(s)")
            for dup_id in remove_ids:
                print(f"  - DELETE all versions of {dup_id}")
                if not dry_run:
                    await conn.execute(DELETE_AGENT_VERSIONS, dup_id)

        for row in graph_dupes:
            name = row["name"]
            ids = row["ids"]
            keep_id = ids[0]
            remove_ids = ids[1:]
            print(f"Graph '{name}': keeping {keep_id}, removing {len(remove_ids)} duplicate(s)")
            for dup_id in remove_ids:
                print(f"  - DELETE all versions of {dup_id}")
                if not dry_run:
                    await conn.execute(DELETE_GRAPH_VERSIONS, dup_id)

        total = sum(len(r["ids"]) - 1 for r in agent_dupes) + sum(
            len(r["ids"]) - 1 for r in graph_dupes
        )
        if dry_run:
            print(f"\n[DRY RUN] Would remove {total} duplicate(s). Re-run without --dry-run.")
        else:
            print(f"\nRemoved {total} duplicate(s).")
    finally:
        await conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Remove duplicate agents/graphs by name")
    parser.add_argument("--dry-run", action="store_true", help="Preview without deleting")
    args = parser.parse_args()

    asyncio.run(deduplicate(args.dry_run))


if __name__ == "__main__":
    main()
