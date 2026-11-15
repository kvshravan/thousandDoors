"""Row-level security and the Postgres store, against a real database.

Runs when TEST_DATABASE_URL is set; otherwise skipped. Every test runs inside a
transaction that is always rolled back, so it leaves nothing behind. With
TEST_DATABASE_SHIM=1 (CI's plain Postgres), the Supabase parts migrations rely on
are created first and the migrations applied.
"""

import json
import os
import uuid
from contextlib import contextmanager
from pathlib import Path

import psycopg
import pytest
from psycopg import errors
from psycopg.rows import dict_row

from backend.auth import User
from backend.migrations import applied, migration_files, seed_demo_rooms, upgrade
from backend.store import Conflict, Forbidden, PostgresStore

ROOT = Path(__file__).resolve().parent.parent
DB_URL = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DB_URL, reason="TEST_DATABASE_URL is not set")
STARTER = json.loads((ROOT / "static/data/templates/starter.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def migrated():
    with psycopg.connect(DB_URL, autocommit=True, prepare_threshold=None) as conn:
        if os.getenv("TEST_DATABASE_SHIM"):
            conn.execute((ROOT / "tests/sql/supabase_shim.sql").read_text(encoding="utf-8"))
            upgrade(conn)
            seed_demo_rooms(conn, str(ROOT / "static"))
        pending = {p.name for p in migration_files()} - applied(conn)
        if pending:
            pytest.skip(f"run `flask db upgrade` first (pending: {sorted(pending)})")


@pytest.fixture
def db(migrated):
    conn = psycopg.connect(DB_URL, autocommit=True, prepare_threshold=None, row_factory=dict_row)
    with conn.transaction(force_rollback=True):
        yield conn
    conn.close()


@pytest.fixture
def store(db):
    @contextmanager
    def connect():
        yield db

    return PostgresStore(connect)


def make_user(db, name: str) -> User:
    user = User(id=str(uuid.uuid4()), email=f"{name}-{uuid.uuid4().hex[:6]}@example.com")
    db.execute(
        "insert into auth.users (id, email, aud, role) "
        "values (%s, %s, 'authenticated', 'authenticated')",
        [user.id, user.email],
    )
    return user


@contextmanager
def acting_as(db, user: User | None):
    """Runs statements as a signed-in user or anon, exactly as the Data API would."""
    with db.transaction():
        db.execute("set local role authenticated" if user else "set local role anon")
        claims = user.claims() if user else {"role": "anon"}
        db.execute("select set_config('request.jwt.claims', %s, true)", [json.dumps(claims)])
        yield
        db.execute("reset role")


def username() -> str:
    return f"t{uuid.uuid4().hex[:10]}"


@pytest.fixture
def two_rooms(db, store):
    owner, other = make_user(db, "owner"), make_user(db, "other")
    owner_name, other_name = username(), username()
    store.create_profile(owner, owner_name, "Owner", STARTER)
    store.create_profile(other, other_name, "Other", STARTER)
    return owner, owner_name, other, other_name


# ---- The store, through the same policies ----


def test_owner_saves_and_others_cannot(store, two_rooms):
    owner, room_id, other, _ = two_rooms
    room, viewer = store.room(room_id, owner)
    assert viewer["canEdit"] is True
    assert store.room(room_id, other)[1]["canEdit"] is False

    appearance = {**room["appearance"], "landscape": "snow"}
    store.save_layout(room_id, owner, appearance, room["objects"])
    assert store.room(room_id, None)[0]["appearance"]["landscape"] == "snow"

    with pytest.raises(Forbidden):
        store.save_layout(room_id, other, appearance, [])
    with pytest.raises(Forbidden):
        store.save_layout("mira", owner, appearance, [])


def test_usernames_are_unique(db, store, two_rooms):
    _, taken, _, _ = two_rooms
    with pytest.raises(Conflict):
        store.create_profile(make_user(db, "late"), taken, "Late", STARTER)


def test_notes_and_photos_through_the_store(db, store, two_rooms):
    owner, room_id, other, _ = two_rooms
    store.add_entry("notes", room_id, other, "Other", "Hello!")
    store.add_entry("gifts", room_id, other, "Other", "tea")
    assert [n["message"] for n in store.list_entries("notes", room_id)] == ["Hello!"]
    assert [g["gift"] for g in store.list_entries("gifts", room_id)] == ["tea"]

    photo_id = str(uuid.uuid4())
    record = {
        "id": photo_id,
        "path": f"{owner.id}/{photo_id}.jpg",
        "content_type": "image/jpeg",
        "byte_size": 1234,
        "name": "me.jpg",
    }
    store.add_photo(owner, record)
    assert [str(p["id"]) for p in store.list_photos(owner)] == [photo_id]
    assert store.list_photos(other) == []
    assert str(store.photo(photo_id)["owner_id"]) == owner.id


# ---- Policies, attacked directly (as someone using the Data API) ----


def test_people_cannot_change_someone_elses_room(db, two_rooms):
    _, room_id, other, _ = two_rooms
    with acting_as(db, other):
        hijack = db.execute("update public.rooms set name = 'mine now' where id = %s", [room_id])
        assert hijack.rowcount == 0
        demo = db.execute("update public.rooms set name = 'mine now' where id = 'mira'")
        assert demo.rowcount == 0


def test_owners_cannot_move_their_room_or_take_another_id(db, two_rooms):
    owner, room_id, _, _ = two_rooms
    with pytest.raises(errors.InsufficientPrivilege), acting_as(db, owner):
        db.execute(
            "update public.rooms set owner_id = null, is_demo = true where id = %s", [room_id]
        )
    with pytest.raises(errors.InsufficientPrivilege), acting_as(db, owner):
        db.execute("update public.rooms set id = 'mira2' where id = %s", [room_id])


def test_a_room_can_only_be_created_for_your_own_username(db, two_rooms):
    _, _, other, _ = two_rooms
    with pytest.raises(errors.InsufficientPrivilege), acting_as(db, other):
        db.execute(
            "insert into public.rooms (id, owner_id, name) values (%s, %s, 'Fake')",
            [username(), other.id],
        )


def test_profiles_are_yours_alone(db, two_rooms):
    owner, _, other, _ = two_rooms
    with acting_as(db, other):
        assert (
            db.execute(
                "update public.profiles set bio = 'hacked' where id = %s", [owner.id]
            ).rowcount
            == 0
        )
    with pytest.raises(errors.InsufficientPrivilege), acting_as(db, owner):
        db.execute("update public.profiles set username = 'mira' where id = %s", [owner.id])


def test_notes_are_signed_by_their_real_author(db, two_rooms):
    owner, room_id, other, _ = two_rooms
    with pytest.raises(errors.InsufficientPrivilege), acting_as(db, other):
        db.execute(
            "insert into public.notes (room_id, author_id, author_name, message) "
            "values (%s, %s, 'Owner', 'fake')",
            [room_id, owner.id],
        )
    with pytest.raises(errors.InsufficientPrivilege), acting_as(db, None):
        db.execute(
            "insert into public.notes (room_id, author_id, author_name, message) "
            "values (%s, %s, 'Anon', 'hi')",
            [room_id, other.id],
        )


def test_room_owners_can_remove_notes_but_strangers_cannot(db, store, two_rooms):
    owner, room_id, other, _ = two_rooms
    stranger = make_user(db, "stranger")
    store.add_entry("notes", room_id, other, "Other", "Hello!")
    with acting_as(db, stranger):
        assert db.execute("delete from public.notes where room_id = %s", [room_id]).rowcount == 0
    with acting_as(db, owner):
        assert db.execute("delete from public.notes where room_id = %s", [room_id]).rowcount == 1


def test_photos_can_only_be_filed_under_your_own_folder(db, two_rooms):
    owner, _, other, _ = two_rooms
    with pytest.raises(errors.InsufficientPrivilege), acting_as(db, other):
        db.execute(
            "insert into public.photos (owner_id, path, content_type, byte_size) "
            "values (%s, %s, 'image/jpeg', 10)",
            [other.id, f"{owner.id}/x.jpg"],
        )


def test_the_migrations_table_is_private(db):
    with pytest.raises(errors.InsufficientPrivilege), acting_as(db, None):
        db.execute("select * from public.schema_migrations")


def test_everyone_can_read_rooms_and_notes(db, two_rooms):
    _, room_id, _, _ = two_rooms
    with acting_as(db, None):
        assert db.execute("select id from public.rooms where id = %s", [room_id]).fetchone()
        assert (
            db.execute("select count(*) as n from public.rooms where is_demo").fetchone()["n"] >= 2
        )


def test_the_hallway_lists_doors_with_their_colour(store, two_rooms):
    owner, room_id, _, other_id = two_rooms
    room, _ = store.room(room_id, owner)
    objects = [
        {**o, "customData": {"color": "plum"}} if o["catalogId"] == "door" else o
        for o in room["objects"]
    ]
    store.save_layout(room_id, owner, room["appearance"], objects)

    doors = store.list_doors()
    ids = [d["id"] for d in doors]
    # Both rooms were changed in this test's transaction, where now() doesn't move.
    assert room_id in ids[:2] and other_id in ids[:2], "the newest changes come first"
    assert ids.index("mira") > 1, "demo rooms come last"
    door = next(d for d in doors if d["id"] == room_id)
    assert door == {
        "id": room_id,
        "name": "Owner",
        "status": "",
        "color": "plum",
        "demo": False,
        "visits": 0,
        "city": None,
    }


def test_visits_count_once_and_cannot_be_forged(db, store, two_rooms):
    owner, room_id, other, _ = two_rooms
    assert store.room(room_id, owner, visitor=f"u:{owner.id}")[0]["visits"] == 0, "not the owner"
    assert store.room(room_id, other, visitor=f"u:{other.id}")[0]["visits"] == 1
    assert store.room(room_id, other, visitor=f"u:{other.id}")[0]["visits"] == 1, "only once"
    assert store.room(room_id, None, visitor="a:" + "0" * 32)[0]["visits"] == 2
    assert store.room("no-such-room", None, visitor="a:" + "1" * 32) is None

    # Visits live where Supabase's Data API can't reach, and the count isn't editable.
    for user in (None, other, owner):
        with pytest.raises(errors.InsufficientPrivilege), acting_as(db, user):
            db.execute("select * from private.room_visits")
    with pytest.raises(errors.InsufficientPrivilege), acting_as(db, owner):
        db.execute("update public.rooms set visits = 999 where id = %s", [room_id])
