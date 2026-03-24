"""
Seed script for the ModularMind RAG Knowledge Base.

Creates collections with appropriate scopes/groups and uploads all
markdown documents from the seed/knowledge/ subdirectories.

Usage:
    # From engine/server directory, with venv activated and infra running:
    python -m seed.knowledge.seed_knowledge

    # Or via the engine CLI if integrated:
    python -m src.cli seed-knowledge
"""

import asyncio
import sys
from pathlib import Path
from uuid import uuid4

from sqlalchemy import func, select, update

# Add engine/server to path for imports
ENGINE_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ENGINE_ROOT))

from src.infra.database import async_session_maker  # noqa: E402
from src.rag.models import (  # noqa: E402
    RAGChunk,
    RAGCollection,
    RAGDocument,
    RAGScope,
)

# ---------------------------------------------------------------------------
# Collection definitions
# ---------------------------------------------------------------------------

COLLECTIONS = [
    {
        "dir": "01-documentation-produit",
        "name": "Documentation Produit",
        "description": "Guides utilisateur, manuels et documentation technique de ModularMind",
        "scope": RAGScope.GLOBAL,
        "allowed_groups": [],
    },
    {
        "dir": "02-api-reference",
        "name": "API Reference",
        "description": (
            "Documentation de l'API REST ModularMind"
            " (auth, conversations, RAG, memory, webhooks)"
        ),
        "scope": RAGScope.GLOBAL,
        "allowed_groups": [],
    },
    {
        "dir": "03-architecture-adrs",
        "name": "Architecture & ADRs",
        "description": "Architecture Decision Records et documentation technique interne",
        "scope": RAGScope.GROUP,
        "allowed_groups": ["engineering", "backend", "frontend", "devops"],
    },
    {
        "dir": "04-procedures-devops",
        "name": "Procédures DevOps",
        "description": "Runbooks, procédures de déploiement, CI/CD et monitoring",
        "scope": RAGScope.GROUP,
        "allowed_groups": ["engineering", "devops", "backend"],
    },
    {
        "dir": "05-support-client",
        "name": "Base de connaissances Support",
        "description": "FAQ, troubleshooting et guides d'intégration pour le support client",
        "scope": RAGScope.GROUP,
        "allowed_groups": ["support", "sales", "product"],
    },
    {
        "dir": "06-politiques-rh",
        "name": "Politiques RH & Entreprise",
        "description": "Onboarding, télétravail, congés, formation, code de conduite",
        "scope": RAGScope.GLOBAL,
        "allowed_groups": [],
    },
    {
        "dir": "07-release-notes",
        "name": "Release Notes",
        "description": "Changelogs et guides de migration de chaque version de ModularMind",
        "scope": RAGScope.GLOBAL,
        "allowed_groups": [],
    },
    {
        "dir": "08-standards-dev",
        "name": "Standards de Développement",
        "description": (
            "Guides de style Python/TypeScript,"
            " conventions Git, code review, tests, accessibilité"
        ),
        "scope": RAGScope.GROUP,
        "allowed_groups": ["engineering", "backend", "frontend", "qa"],
    },
    {
        "dir": "09-securite-conformite",
        "name": "Sécurité & Conformité",
        "description": (
            "Charte sécurité, gestion des secrets,"
            " RGPD, SOC 2, plan de réponse incidents"
        ),
        "scope": RAGScope.GROUP,
        "allowed_groups": ["security", "engineering", "devops", "management"],
    },
    {
        "dir": "10-onboarding-technique",
        "name": "Onboarding Technique",
        "description": "Setup environnement, architecture codebase, accès outils, premiers pas",
        "scope": RAGScope.GROUP,
        "allowed_groups": ["engineering", "backend", "frontend", "devops", "qa", "data"],
    },
    {
        "dir": "11-specifications-produit",
        "name": "Spécifications Produit",
        "description": "PRDs (mémoire, RAG, graphes, monitoring, marketplace) et roadmap",
        "scope": RAGScope.GROUP,
        "allowed_groups": ["product", "engineering", "management"],
    },
    {
        "dir": "12-donnees-analytics",
        "name": "Données & Analytics",
        "description": "Schéma DB, pipeline embedding, Qdrant, métriques, export et reporting",
        "scope": RAGScope.GROUP,
        "allowed_groups": ["data", "engineering", "backend", "devops"],
    },
    {
        "dir": "13-commercial-pricing",
        "name": "Commercial & Pricing",
        "description": "Grille tarifaire, argumentaires commerciaux, comparatif concurrentiel",
        "scope": RAGScope.GROUP,
        "allowed_groups": ["sales", "marketing", "management"],
    },
    {
        "dir": "14-post-mortems",
        "name": "Post-Mortems & Incidents",
        "description": "Rapports post-mortem d'incidents passés et template",
        "scope": RAGScope.GROUP,
        "allowed_groups": ["engineering", "devops", "security", "backend"],
    },
    {
        "dir": "15-formation-certifications",
        "name": "Formation & Certifications",
        "description": "Formations IA, prompt engineering, sécurité IA, catalogue certifications",
        "scope": RAGScope.GLOBAL,
        "allowed_groups": [],
    },
    # --- Projets internes ---
    {
        "dir": "P1-projet-phoenix",
        "name": "Projet Phoenix — Refonte UI v4",
        "description": (
            "Brief, architecture, comptes-rendus et plan de tests"
            " du projet Phoenix (refonte interface)"
        ),
        "scope": RAGScope.GROUP,
        "allowed_groups": ["engineering", "frontend", "product"],
        "category": "project",
    },
    {
        "dir": "P2-projet-atlas",
        "name": "Projet Atlas — Migration Kubernetes",
        "description": (
            "Brief, architecture K8s, runbooks et bilans"
            " du projet Atlas (migration infrastructure)"
        ),
        "scope": RAGScope.GROUP,
        "allowed_groups": ["engineering", "devops", "backend"],
        "category": "project",
    },
    {
        "dir": "P3-projet-mercury",
        "name": "Projet Mercury — API Gateway & Marketplace",
        "description": (
            "Brief, architecture API Gateway, spec marketplace"
            " et plans de tests du projet Mercury"
        ),
        "scope": RAGScope.GROUP,
        "allowed_groups": ["engineering", "backend", "product"],
        "category": "project",
    },
    {
        "dir": "P4-projet-titan",
        "name": "Projet Titan — Analytics & Reporting",
        "description": (
            "Brief, architecture pipeline analytics,"
            " spécifications export et plan de tests du projet Titan"
        ),
        "scope": RAGScope.GROUP,
        "allowed_groups": ["engineering", "data", "backend"],
        "category": "project",
    },
    {
        "dir": "P5-projet-orion",
        "name": "Projet Orion — Application Mobile",
        "description": (
            "Brief, architecture React Native, spec notifications push"
            " et plan de tests du projet Orion"
        ),
        "scope": RAGScope.GROUP,
        "allowed_groups": ["engineering", "frontend", "product"],
        "category": "project",
    },
]


async def seed_collections_and_documents():
    """Create RAG collections and document records from seed files.

    This script creates the collections and document entries in PostgreSQL.
    Documents are created with status='pending' — to actually process them
    (chunking + embedding + Qdrant), run the worker or call process_document().
    """
    knowledge_dir = Path(__file__).parent

    async with async_session_maker() as session:
        created_collections = 0
        created_documents = 0
        skipped_collections = 0

        for col_def in COLLECTIONS:
            doc_dir = knowledge_dir / col_def["dir"]
            if not doc_dir.is_dir():
                print(f"  SKIP: {col_def['dir']}/ not found")
                continue

            # Check if collection already exists by name
            existing = await session.execute(
                select(RAGCollection).where(RAGCollection.name == col_def["name"])
            )
            collection = existing.scalar_one_or_none()

            if collection:
                print(f"  EXISTS: {col_def['name']} (id={collection.id})")
                skipped_collections += 1
            else:
                meta = {"chunk_strategy": "token_aware", "seed": True}
                if col_def.get("category"):
                    meta["category"] = col_def["category"]
                collection = RAGCollection(
                    id=str(uuid4()),
                    name=col_def["name"],
                    description=col_def["description"],
                    scope=col_def["scope"],
                    allowed_groups=col_def["allowed_groups"],
                    chunk_size=500,
                    chunk_overlap=50,
                    metadata=meta,
                )
                session.add(collection)
                await session.flush()
                created_collections += 1
                print(f"  CREATED: {col_def['name']} (id={collection.id})")

            # Create document records for each .md file
            md_files = sorted(doc_dir.glob("*.md"))
            for md_file in md_files:
                # Check if document already exists in this collection
                existing_doc = await session.execute(
                    select(RAGDocument).where(
                        RAGDocument.collection_id == collection.id,
                        RAGDocument.filename == md_file.name,
                    )
                )
                if existing_doc.scalar_one_or_none():
                    print(f"    EXISTS: {md_file.name}")
                    continue

                file_content = md_file.read_bytes()
                doc = RAGDocument(
                    id=str(uuid4()),
                    collection_id=collection.id,
                    filename=md_file.name,
                    content_type="text/markdown",
                    size_bytes=len(file_content),
                    status="pending",
                    metadata={"seed": True},
                )
                session.add(doc)
                created_documents += 1
                print(f"    ADDED: {md_file.name} ({len(file_content)} bytes)")

            # Update collection document count
            doc_count = await session.execute(
                select(func.count(RAGDocument.id)).where(RAGDocument.collection_id == collection.id)
            )
            count = doc_count.scalar() or 0
            await session.execute(
                update(RAGCollection)
                .where(RAGCollection.id == collection.id)
                .values(document_count=count)
            )

        await session.commit()

        print(f"\n{'=' * 60}")
        print("Seed complete!")
        print(f"  Collections created: {created_collections}")
        print(f"  Collections skipped: {skipped_collections}")
        print(f"  Documents added: {created_documents}")
        print(f"{'=' * 60}")
        print()
        print("NOTE: Documents are in 'pending' status.")
        print("To process them (chunk + embed + index in Qdrant),")
        print("run the document processing pipeline:")
        print()
        print("  python -m seed.knowledge.process_seed_documents")
        print()
        print("Or upload them via the Ops console for async processing.")


async def process_seed_documents():
    """Process all pending seed documents through the RAG pipeline.

    This reads each pending document, calls the processor directly,
    and updates the status to 'ready'.
    """
    knowledge_dir = Path(__file__).parent

    async with async_session_maker() as session:
        # Dynamically import processor to avoid import errors if deps missing
        try:
            from src.rag.processor import process_document
        except ImportError as e:
            print(f"ERROR: Cannot import RAG processor: {e}")
            print("Make sure all dependencies are installed and Qdrant is running.")
            return

        # Get all pending seed documents
        result = await session.execute(
            select(RAGDocument, RAGCollection)
            .join(RAGCollection, RAGDocument.collection_id == RAGCollection.id)
            .where(RAGDocument.status == "pending")
            .where(RAGDocument.meta["seed"].as_boolean() == True)  # noqa: E712
        )
        rows = result.all()

        if not rows:
            print("No pending seed documents found.")
            return

        print(f"Processing {len(rows)} pending seed documents...\n")

        success = 0
        failed = 0

        for doc, collection in rows:
            # Find the source file
            col_dir_name = None
            for col_def in COLLECTIONS:
                if col_def["name"] == collection.name:
                    col_dir_name = col_def["dir"]
                    break

            if not col_dir_name:
                print(f"  SKIP: Cannot find dir for collection '{collection.name}'")
                continue

            file_path = knowledge_dir / col_dir_name / doc.filename
            if not file_path.exists():
                print(f"  SKIP: File not found: {file_path}")
                continue

            try:
                file_content = file_path.read_bytes()
                chunk_count = await process_document(
                    document_id=doc.id,
                    collection_id=collection.id,
                    file_content=file_content,
                    filename=doc.filename,
                    db_session=session,
                    chunk_size=collection.chunk_size or 500,
                    chunk_overlap=collection.chunk_overlap or 50,
                )

                await session.execute(
                    update(RAGDocument)
                    .where(RAGDocument.id == doc.id)
                    .values(status="ready", chunk_count=chunk_count)
                )

                # Update collection chunk count
                total_chunks = await session.execute(
                    select(func.count(RAGChunk.id)).where(RAGChunk.collection_id == collection.id)
                )
                await session.execute(
                    update(RAGCollection)
                    .where(RAGCollection.id == collection.id)
                    .values(chunk_count=total_chunks.scalar() or 0)
                )

                await session.commit()
                success += 1
                print(f"  OK: {doc.filename} -> {chunk_count} chunks")

            except Exception as e:
                await session.rollback()
                failed += 1
                print(f"  FAIL: {doc.filename} -> {e}")

                # Mark as failed
                async with async_session_maker() as err_session:
                    await err_session.execute(
                        update(RAGDocument)
                        .where(RAGDocument.id == doc.id)
                        .values(status="failed", error_message=str(e)[:500])
                    )
                    await err_session.commit()

        print(f"\nProcessing complete: {success} success, {failed} failed")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Seed ModularMind knowledge base")
    parser.add_argument(
        "--process",
        action="store_true",
        help="Also process documents (chunk + embed + index). Requires Qdrant + Ollama.",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("ModularMind Knowledge Base Seed")
    print("=" * 60)
    print()

    asyncio.run(seed_collections_and_documents())

    if args.process:
        print("\n" + "=" * 60)
        print("Processing documents...")
        print("=" * 60 + "\n")
        asyncio.run(process_seed_documents())
