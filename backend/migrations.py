"""SQL migrations and demo data for the Supabase Postgres database.

flask db upgrade   apply new files from migrations/ (each in its own transaction)
flask db status    list applied and pending migrations
flask db seed      create or refresh the demo rooms from static/data/rooms/
"""

from pathlib import Path

import click
import psycopg
from flask import Flask, current_app
from psycopg.types.json import Jsonb

from backend.rooms import demo_rooms

MIGRATIONS = Path(__file__).resolve().parent.parent / "migrations"

TRACKING_TABLE = """
create table if not exists public.schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
alter table public.schema_migrations enable row level security;
-- Supabase grants new public tables to anon and authenticated by default; this one is private.
revoke all on public.schema_migrations from public, anon, authenticated;
"""


def migration_files() -> list[Path]:
    return sorted(MIGRATIONS.glob("*.sql"))


def applied(conn: psycopg.Connection) -> set[str]:
    conn.execute(TRACKING_TABLE)
    return {row[0] for row in conn.execute("select name from public.schema_migrations")}


def upgrade(conn: psycopg.Connection) -> list[str]:
    """Applies pending migrations in order. Returns the names applied."""
    with conn.transaction():
        done = applied(conn)
    new = []
    for path in migration_files():
        if path.name in done:
            continue
        with conn.transaction():
            conn.execute(path.read_text(encoding="utf-8"))
            conn.execute("insert into public.schema_migrations (name) values (%s)", [path.name])
        new.append(path.name)
    return new


def seed_demo_rooms(conn: psycopg.Connection, static_folder: str) -> list[str]:
    """Creates or refreshes the ownerless demo rooms. Never touches people's rooms."""
    seeded = []
    with conn.transaction():
        for room in demo_rooms(static_folder):
            conn.execute(
                """
                insert into public.rooms
                  (id, owner_id, is_demo, name, description, appearance, objects, demo_owner)
                values (%s, null, true, %s, %s, %s, %s, %s)
                on conflict (id) do update set
                  name = excluded.name, description = excluded.description,
                  appearance = excluded.appearance, objects = excluded.objects,
                  demo_owner = excluded.demo_owner, updated_at = now()
                where public.rooms.is_demo
                """,
                [
                    room["roomId"],
                    room["name"],
                    room.get("description", ""),
                    Jsonb(room["appearance"]),
                    Jsonb(room["objects"]),
                    Jsonb(room["owner"]),
                ],
            )
            seeded.append(room["roomId"])
    return seeded


def _connect() -> psycopg.Connection:
    url = current_app.config.get("DATABASE_URL")
    if not url:
        raise click.ClickException("DATABASE_URL is not set (see .env.example).")
    return psycopg.connect(url, autocommit=True, prepare_threshold=None)


def register_cli(app: Flask) -> None:
    @app.cli.group("db")
    def db():
        """Database migrations and demo data."""

    @db.command("upgrade")
    def upgrade_command():
        with _connect() as conn:
            names = upgrade(conn)
        click.echo("\n".join(f"applied {name}" for name in names) or "Already up to date.")

    @db.command("status")
    def status_command():
        with _connect() as conn:
            done = applied(conn)
        for path in migration_files():
            click.echo(f"{'applied' if path.name in done else 'pending'}  {path.name}")

    @db.command("seed")
    def seed_command():
        with _connect() as conn:
            rooms = seed_demo_rooms(conn, current_app.static_folder)
        click.echo(f"Seeded demo rooms: {', '.join(rooms)}")
