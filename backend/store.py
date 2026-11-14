"""Where rooms, profiles, notes, gifts, and photo records live.

MemoryStore keeps everything in memory (tests, and running without a database).
PostgresStore uses Supabase Postgres. It runs every query as the requesting user
(role "authenticated" plus their JWT claims, or "anon"), so the row-level security
policies in migrations/ apply on top of the checks here.
"""

import atexit
import copy
import json
import threading
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta

from psycopg import errors
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from backend.auth import User
from backend.rooms import demo_rooms, owner_card

MAX_LISTED = 100
# Notes or gifts one person may leave in one room per hour.
HOURLY_LIMIT = 20


class StoreError(Exception):
    status = 400
    code = "bad_request"

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class NotFound(StoreError):
    status = 404
    code = "not_found"


class Forbidden(StoreError):
    status = 403
    code = "forbidden"


class Conflict(StoreError):
    status = 409
    code = "conflict"


class TooMany(StoreError):
    status = 429
    code = "too_many"


def _document(row: dict, profile: dict | None) -> dict:
    return {
        "roomId": row["id"],
        "name": row["name"],
        "description": row["description"],
        "owner": owner_card(profile, row.get("demo_owner")),
        "appearance": row["appearance"],
        "objects": row["objects"],
    }


def _viewer(row: dict, user: User | None) -> dict:
    # Postgres returns UUID objects; tokens carry strings.
    owner_id = row.get("owner_id")
    owner = bool(user and owner_id is not None and str(owner_id) == user.id)
    return {
        "relationship": "owner" if owner else "stranger",
        "canEdit": owner,
        "signedIn": bool(user),
    }


def _entry(row: dict, value_key: str) -> dict:
    created = row["created_at"]
    return {
        "id": row["id"],
        "author": row["author_name"],
        value_key: row[value_key],
        "createdAt": created.isoformat() if isinstance(created, datetime) else created,
    }


class MemoryStore:
    def __init__(self, static_folder: str):
        self._lock = threading.Lock()
        self.rooms: dict[str, dict] = {}
        self.profiles: dict[str, dict] = {}
        self.entries: dict[str, list[dict]] = {"notes": [], "gifts": []}
        self.photos: dict[str, dict] = {}
        self._next_id = 1
        for room in demo_rooms(static_folder):
            self.rooms[room["roomId"]] = {
                "id": room["roomId"],
                "owner_id": None,
                "is_demo": True,
                "name": room["name"],
                "description": room.get("description", ""),
                "appearance": room["appearance"],
                "objects": room["objects"],
                "demo_owner": room["owner"],
            }

    # ---- Rooms ----

    def room_exists(self, room_id: str) -> bool:
        return room_id in self.rooms

    def room(self, room_id: str, user: User | None) -> tuple[dict, dict] | None:
        row = self.rooms.get(room_id)
        if not row:
            return None
        profile = self._profile_by_id(row["owner_id"])
        return copy.deepcopy(_document(row, profile)), _viewer(row, user)

    def save_layout(self, room_id: str, user: User, appearance: dict, objects: list) -> None:
        with self._lock:
            row = self.rooms.get(room_id)
            if not row:
                raise NotFound("No such room.")
            if row["owner_id"] != user.id:
                raise Forbidden("Only the owner can change this room.")
            row["appearance"] = copy.deepcopy(appearance)
            row["objects"] = copy.deepcopy(objects)

    # ---- Profiles ----

    def profile(self, user: User) -> dict | None:
        return copy.deepcopy(self.profiles.get(user.id))

    def create_profile(self, user: User, username: str, display_name: str, starter: dict) -> dict:
        with self._lock:
            if user.id in self.profiles:
                raise Conflict("You already have a room.")
            if username in self.rooms or any(
                p["username"] == username for p in self.profiles.values()
            ):
                raise Conflict("That username is taken.")
            profile = {
                "id": user.id,
                "username": username,
                "display_name": display_name,
                "bio": "",
                "status": "",
                "interests": [],
            }
            self.profiles[user.id] = profile
            self.rooms[username] = {
                "id": username,
                "owner_id": user.id,
                "is_demo": False,
                "name": starter["name"],
                "description": starter.get("description", ""),
                "appearance": starter["appearance"],
                "objects": starter["objects"],
                "demo_owner": None,
            }
            return copy.deepcopy(profile)

    def update_profile(self, user: User, fields: dict) -> dict:
        with self._lock:
            profile = self.profiles.get(user.id)
            if not profile:
                raise NotFound("Create your room first.")
            profile.update(copy.deepcopy(fields))
            return copy.deepcopy(profile)

    def _profile_by_id(self, user_id: str | None) -> dict | None:
        return self.profiles.get(user_id) if user_id else None

    # ---- Notes and gifts ----

    def list_entries(self, kind: str, room_id: str) -> list[dict]:
        value_key = "message" if kind == "notes" else "gift"
        rows = [e for e in self.entries[kind] if e["room_id"] == room_id]
        return [_entry(row, value_key) for row in rows[-MAX_LISTED:]]

    def add_entry(self, kind: str, room_id: str, user: User, author: str, value: str) -> dict:
        value_key = "message" if kind == "notes" else "gift"
        with self._lock:
            if room_id not in self.rooms:
                raise NotFound("No such room.")
            hour_ago = datetime.now(UTC) - timedelta(hours=1)
            recent = [
                e
                for e in self.entries[kind]
                if e["room_id"] == room_id
                and e["author_id"] == user.id
                and e["created_at"] > hour_ago
            ]
            if len(recent) >= HOURLY_LIMIT:
                raise TooMany("That's plenty for now. Try again later.")
            row = {
                "id": self._next_id,
                "room_id": room_id,
                "author_id": user.id,
                "author_name": author,
                value_key: value,
                "created_at": datetime.now(UTC),
            }
            self._next_id += 1
            self.entries[kind].append(row)
            return _entry(row, value_key)

    # ---- Photos ----

    def add_photo(self, user: User, photo: dict) -> dict:
        with self._lock:
            row = {**photo, "owner_id": user.id, "created_at": datetime.now(UTC)}
            self.photos[photo["id"]] = row
            return copy.deepcopy(row)

    def list_photos(self, user: User) -> list[dict]:
        rows = [p for p in self.photos.values() if p["owner_id"] == user.id]
        return copy.deepcopy(sorted(rows, key=lambda p: p["created_at"], reverse=True))

    def photo(self, photo_id: str) -> dict | None:
        return copy.deepcopy(self.photos.get(photo_id))


class PostgresStore:
    """`connect` is a context manager factory yielding an autocommit psycopg connection."""

    def __init__(self, connect):
        self._connect = connect

    @classmethod
    def from_url(cls, url: str) -> "PostgresStore":
        from psycopg_pool import ConnectionPool

        # Opened on first use, so importing the app (as tests and CLI commands do)
        # doesn't connect to the database.
        pool = ConnectionPool(
            url,
            min_size=1,
            max_size=8,
            open=False,
            kwargs={"autocommit": True, "prepare_threshold": None, "row_factory": dict_row},
        )
        lock = threading.Lock()

        @contextmanager
        def connect():
            if pool.closed:
                with lock:
                    if pool.closed:
                        pool.open(wait=True, timeout=15)
            with pool.connection() as conn:
                yield conn

        store = cls(connect)
        store.pool = pool
        atexit.register(lambda: pool.close(timeout=2) if not pool.closed else None)
        return store

    @contextmanager
    def _as(self, user: User | None):
        """A transaction running as `user` (or anon), so row-level security applies."""
        with self._connect() as conn:
            try:
                with conn.transaction():
                    conn.execute("set local role authenticated" if user else "set local role anon")
                    claims = user.claims() if user else {"role": "anon"}
                    conn.execute(
                        "select set_config('request.jwt.claims', %s, true)", [json.dumps(claims)]
                    )
                    yield conn
                    conn.execute("reset role")
            except errors.InsufficientPrivilege as error:
                raise Forbidden("You can't do that.") from error
            except errors.UniqueViolation as error:
                raise Conflict("That already exists.") from error
            except (errors.CheckViolation, errors.ForeignKeyViolation) as error:
                raise StoreError("That isn't allowed.") from error

    # ---- Rooms ----

    def room_exists(self, room_id: str) -> bool:
        with self._as(None) as conn:
            return bool(
                conn.execute("select 1 from public.rooms where id = %s", [room_id]).fetchone()
            )

    def room(self, room_id: str, user: User | None) -> tuple[dict, dict] | None:
        with self._as(user) as conn:
            row = conn.execute("select * from public.rooms where id = %s", [room_id]).fetchone()
            if not row:
                return None
            profile = None
            if row["owner_id"]:
                profile = conn.execute(
                    "select * from public.profiles where id = %s", [row["owner_id"]]
                ).fetchone()
        return _document(row, profile), _viewer(row, user)

    def save_layout(self, room_id: str, user: User, appearance: dict, objects: list) -> None:
        with self._as(user) as conn:
            updated = conn.execute(
                """
                update public.rooms
                set appearance = %s, objects = %s, updated_at = now()
                where id = %s
                returning id
                """,
                [Jsonb(appearance), Jsonb(objects), room_id],
            ).fetchone()
            if not updated:
                exists = conn.execute("select 1 from public.rooms where id = %s", [room_id])
                if exists.fetchone():
                    raise Forbidden("Only the owner can change this room.")
                raise NotFound("No such room.")

    # ---- Profiles ----

    def profile(self, user: User) -> dict | None:
        with self._as(user) as conn:
            return conn.execute("select * from public.profiles where id = %s", [user.id]).fetchone()

    def create_profile(self, user: User, username: str, display_name: str, starter: dict) -> dict:
        with self._as(user) as conn:
            if conn.execute("select 1 from public.profiles where id = %s", [user.id]).fetchone():
                raise Conflict("You already have a room.")
            if conn.execute("select 1 from public.rooms where id = %s", [username]).fetchone():
                raise Conflict("That username is taken.")
            try:
                with conn.transaction():
                    profile = conn.execute(
                        """
                        insert into public.profiles (id, username, display_name)
                        values (%s, %s, %s) returning *
                        """,
                        [user.id, username, display_name],
                    ).fetchone()
            except errors.UniqueViolation as error:
                raise Conflict("That username is taken.") from error
            conn.execute(
                """
                insert into public.rooms (id, owner_id, name, description, appearance, objects)
                values (%s, %s, %s, %s, %s, %s)
                """,
                [
                    username,
                    user.id,
                    starter["name"],
                    starter.get("description", ""),
                    Jsonb(starter["appearance"]),
                    Jsonb(starter["objects"]),
                ],
            )
            return profile

    def update_profile(self, user: User, fields: dict) -> dict:
        columns = {"display_name", "bio", "status", "interests"}
        sets = {key: value for key, value in fields.items() if key in columns}
        with self._as(user) as conn:
            assignments = ", ".join(f"{key} = %s" for key in sets)
            row = conn.execute(
                f"update public.profiles set {assignments}, updated_at = now() "
                "where id = %s returning *",
                [*sets.values(), user.id],
            ).fetchone()
            if not row:
                raise NotFound("Create your room first.")
            return row

    # ---- Notes and gifts (kind is "notes" or "gifts"; table names come only from here) ----

    def list_entries(self, kind: str, room_id: str) -> list[dict]:
        table, value_key = ("notes", "message") if kind == "notes" else ("gifts", "gift")
        with self._as(None) as conn:
            rows = conn.execute(
                f"select * from (select * from public.{table} where room_id = %s "
                "order by created_at desc limit %s) recent order by created_at",
                [room_id, MAX_LISTED],
            ).fetchall()
        return [_entry(row, value_key) for row in rows]

    def add_entry(self, kind: str, room_id: str, user: User, author: str, value: str) -> dict:
        table, value_key = ("notes", "message") if kind == "notes" else ("gifts", "gift")
        with self._as(user) as conn:
            if not conn.execute("select 1 from public.rooms where id = %s", [room_id]).fetchone():
                raise NotFound("No such room.")
            recent = conn.execute(
                f"select count(*) as n from public.{table} where room_id = %s "
                "and author_id = %s and created_at > now() - interval '1 hour'",
                [room_id, user.id],
            ).fetchone()["n"]
            if recent >= HOURLY_LIMIT:
                raise TooMany("That's plenty for now. Try again later.")
            row = conn.execute(
                f"insert into public.{table} (room_id, author_id, author_name, {value_key}) "
                "values (%s, %s, %s, %s) returning *",
                [room_id, user.id, author, value],
            ).fetchone()
        return _entry(row, value_key)

    # ---- Photos ----

    def add_photo(self, user: User, photo: dict) -> dict:
        with self._as(user) as conn:
            return conn.execute(
                """
                insert into public.photos (id, owner_id, path, content_type, byte_size, name)
                values (%s, %s, %s, %s, %s, %s) returning *
                """,
                [
                    photo["id"],
                    user.id,
                    photo["path"],
                    photo["content_type"],
                    photo["byte_size"],
                    photo["name"],
                ],
            ).fetchone()

    def list_photos(self, user: User) -> list[dict]:
        with self._as(user) as conn:
            return conn.execute(
                "select * from public.photos where owner_id = %s "
                "order by created_at desc limit 200",
                [user.id],
            ).fetchall()

    def photo(self, photo_id: str) -> dict | None:
        try:
            uuid.UUID(photo_id)
        except ValueError:
            return None
        with self._as(None) as conn:
            return conn.execute("select * from public.photos where id = %s", [photo_id]).fetchone()
