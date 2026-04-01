"""Seed script — reads YAML definitions and creates them via the Engine API.

Usage:
    python seeds/seed.py --url http://localhost:8000 --email user@example.com --password secret
"""

import argparse
from pathlib import Path

import requests
import yaml

SEEDS_DIR = Path(__file__).parent


def login(base_url: str, email: str, password: str) -> requests.Session:
    session = requests.Session()
    resp = session.post(
        f"{base_url}/api/v1/auth/login",
        data={"username": email, "password": password},
    )
    resp.raise_for_status()
    return session


def _get_existing_agents(session: requests.Session, base_url: str) -> dict[str, str]:
    resp = session.get(f"{base_url}/api/v1/agents")
    resp.raise_for_status()
    return {a["name"]: a["id"] for a in resp.json()}


def _get_existing_graphs(session: requests.Session, base_url: str) -> dict[str, str]:
    resp = session.get(f"{base_url}/api/v1/graphs")
    resp.raise_for_status()
    return {g["name"]: g["id"] for g in resp.json()}


def seed_agents(session: requests.Session, base_url: str) -> dict[str, str]:
    agents_dir = SEEDS_DIR / "agents"
    agent_ids: dict[str, str] = {}
    existing = _get_existing_agents(session, base_url)

    for yaml_file in sorted(agents_dir.glob("*.yaml")):
        with open(yaml_file) as f:
            data = yaml.safe_load(f)

        ref_name = yaml_file.stem
        name = data["name"]

        if name in existing:
            agent_ids[ref_name] = existing[name]
            print(f"  Agent: {name} -> {existing[name]} (already exists, skipped)")
            continue

        payload = {
            "name": name,
            "description": data.get("description", ""),
            "model_id": data["model_id"],
            "system_prompt": data.get("system_prompt", ""),
            "tool_categories": data.get("tool_categories", {}),
        }

        resp = session.post(
            f"{base_url}/api/v1/agents",
            json=payload,
        )
        resp.raise_for_status()
        agent = resp.json()
        agent_ids[ref_name] = agent["id"]
        print(f"  Agent: {name} -> {agent['id']}")

    return agent_ids


def seed_graphs(
    session: requests.Session, base_url: str, agent_ids: dict[str, str],
) -> None:
    graphs_dir = SEEDS_DIR / "graphs"
    existing = _get_existing_graphs(session, base_url)

    for yaml_file in sorted(graphs_dir.glob("*.yaml")):
        with open(yaml_file) as f:
            data = yaml.safe_load(f)

        name = data["name"]
        if name in existing:
            print(f"  Graph: {name} -> {existing[name]} (already exists, skipped)")
            continue

        for node in data.get("nodes", []):
            agent_ref = node.get("data", {}).pop("agent_ref", None)
            if agent_ref and agent_ref in agent_ids:
                node["data"]["agent_id"] = agent_ids[agent_ref]

        payload = {
            "name": name,
            "description": data.get("description", ""),
            "timeout_seconds": data.get("timeout_seconds", 300),
            "entry_node_id": data.get("entry_node_id"),
            "nodes": data.get("nodes", []),
            "edges": data.get("edges", []),
        }

        resp = session.post(
            f"{base_url}/api/v1/graphs",
            json=payload,
        )
        resp.raise_for_status()
        graph = resp.json()
        print(f"  Graph: {name} -> {graph['id']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed agents and graphs")
    parser.add_argument("--url", default="http://localhost:8000")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    args = parser.parse_args()

    print(f"Logging in as {args.email}...")
    session = login(args.url, args.email, args.password)

    print("Seeding agents...")
    agent_ids = seed_agents(session, args.url)

    print("Seeding graphs...")
    seed_graphs(session, args.url, agent_ids)

    print("Done!")


if __name__ == "__main__":
    main()
