#!/usr/bin/env python3
"""Run schema migrations and idempotently load the AFC snapshot.

Run this once after provisioning Neon and Qdrant, and again whenever the
checked-in snapshot changes. It is intentionally separate from API startup so
Vercel cold starts never perform migrations, scraping, or embedding work.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.ingest import run_import  # noqa: E402


def migrate() -> None:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    command.upgrade(config, "head")


def main() -> None:
    migrate()
    result = asyncio.run(run_import())
    print(f"Cloud bootstrap complete: {result}")


if __name__ == "__main__":
    main()
