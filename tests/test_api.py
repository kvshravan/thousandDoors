import copy
import io
import json
import time
from pathlib import Path

import jwt
import pytest

from app import create_app
from backend.auth import TokenVerifier

ROOT = Path(__file__).resolve().parent.parent
MIRA = json.loads((ROOT / "static/data/rooms/mira.json").read_text(encoding="utf-8"))
DEMO_IDS = {p.stem for p in (ROOT / "static/data/rooms").glob("*.json")}
SAM = "00000000-0000-4000-8000-00000000000a"
ALEX = "00000000-0000-4000-8000-00000000000b"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


@pytest.fixture
def app():
    return create_app("testing")


@pytest.fixture
def client(app):
    return app.test_client()


def headers(app, user_id: str = SAM, email: str = "sam@example.com") -> dict:
    token, _ = app.extensions["doors.signer"].token(user_id, email)
    return {"Authorization": f"Bearer {token}"}


def make_room(client, app, user_id=SAM, username="sam", name="Sam") -> dict:
    response = client.post(
        "/api/me/profile",
        headers=headers(app, user_id),
        json={"username": username, "displayName": name},
    )
    assert response.status_code == 201, response.json
    return response.json


def layout_of(client, room_id: str) -> dict:
    room = client.get(f"/api/rooms/{room_id}").json["room"]
    return {"appearance": room["appearance"], "objects": room["objects"]}


# ---- Accounts ----


def test_me_requires_a_valid_token(client, app):
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/me", headers={"Authorization": "Bearer nonsense"}).status_code == 401
    response = client.get("/api/me", headers=headers(app))
    assert response.status_code == 200
    assert response.json == {"user": {"id": SAM, "email": "sam@example.com"}, "profile": None}


def test_creating_a_profile_builds_a_starter_room(client, app):
    data = make_room(client, app, username="Sam", name="Sam <b>")
    assert data["roomUrl"] == "/room/sam", "usernames are lowercase"
    assert data["profile"]["displayName"] == "Sam <b>", "stored as text; the page escapes it"

    room = client.get("/api/rooms/sam").json
    assert room["room"]["name"] == "Sam <b>'s room"
    assert room["room"]["owner"]["username"] == "sam"
    assert sum(o["catalogId"] == "door" for o in room["room"]["objects"]) == 1
    assert client.get("/room/sam").status_code == 200
    assert client.get("/api/me", headers=headers(app)).json["profile"]["username"] == "sam"


@pytest.mark.parametrize(
    ("username", "message"),
    [
        ("ab", "3–20 characters"),
        ("sam!", "3–20 characters"),
        ("sam smith", "3–20 characters"),
        ("-sam", "3–20 characters"),
        ("a" * 21, "3–20 characters"),
        ("admin", "reserved"),
        ("mira", "taken"),
    ],
)
def test_bad_or_taken_usernames_are_refused(client, app, username, message):
    response = client.post("/api/me/profile", headers=headers(app), json={"username": username})
    assert response.status_code in (400, 409)
    assert message in response.json["error"]["message"]


def test_one_room_per_person_and_per_name(client, app):
    make_room(client, app)
    again = client.post("/api/me/profile", headers=headers(app), json={"username": "sam2"})
    assert again.status_code == 409
    taken = client.post("/api/me/profile", headers=headers(app, ALEX), json={"username": "sam"})
    assert taken.status_code == 409


def test_profile_updates_are_cleaned(client, app):
    make_room(client, app)
    response = client.patch(
        "/api/me/profile",
        headers=headers(app),
        json={"bio": "  Hello\n\nthere  " + "x" * 400, "interests": ["art", "", "  plants  "] * 10},
    )
    profile = response.json["profile"]
    assert profile["bio"].startswith("Hello there") and len(profile["bio"]) == 280
    assert profile["interests"][:2] == ["art", "plants"] and len(profile["interests"]) <= 12
    assert client.get("/api/rooms/sam").json["room"]["owner"]["bio"] == profile["bio"]


# ---- Rooms ----


def test_anyone_can_view_a_room_but_only_the_owner_can_edit(client, app):
    make_room(client, app)
    assert client.get("/api/rooms/sam").json["viewer"] == {
        "relationship": "stranger",
        "canEdit": False,
        "signedIn": False,
    }
    owner = client.get("/api/rooms/sam", headers=headers(app)).json["viewer"]
    assert owner == {"relationship": "owner", "canEdit": True, "signedIn": True}

    layout = layout_of(client, "sam")
    layout["appearance"]["landscape"] = "beach"
    assert client.put("/api/rooms/sam/layout", json=layout).status_code == 401
    assert (
        client.put("/api/rooms/sam/layout", headers=headers(app, ALEX), json=layout).status_code
        == 403
    )
    assert (
        client.put("/api/rooms/mira/layout", headers=headers(app), json=layout).status_code == 403
    )
    assert (
        client.put("/api/rooms/nobody/layout", headers=headers(app), json=layout).status_code == 404
    )

    response = client.put("/api/rooms/sam/layout", headers=headers(app), json=layout)
    assert response.status_code == 200
    assert client.get("/api/rooms/sam").json["room"]["appearance"]["landscape"] == "beach"


def test_unknown_rooms_are_404(client):
    assert client.get("/api/rooms/nobody").status_code == 404
    assert client.get("/api/rooms/nobody").json["error"]["code"] == "not_found"


def _bad(layout, change):
    bad = copy.deepcopy(layout)
    change(bad)
    return bad


def _first(bad):
    return next(o for o in bad["objects"] if o["catalogId"] != "door")


def _frame(bad):
    return next(o for o in bad["objects"] if o["catalogId"] == "picture-frame")


BAD_LAYOUTS = {
    "unknown catalogue item": lambda b: _first(b).update(catalogId="spaceship"),
    "out of range": lambda b: _first(b)["position"].update(x=40),
    "must be a number": lambda b: _first(b)["scale"].update(y="big"),
    "duplicate": lambda b: b["objects"].append(copy.deepcopy(_first(b))),
    "keeps its door": lambda b: b.update(
        objects=[o for o in b["objects"] if o["catalogId"] != "door"]
    ),
    "unknown landscape": lambda b: b["appearance"].update(landscape="moon"),
    "simple id": lambda b: _first(b).update(id="<script>"),
    "bundled image or one of your photos": lambda b: _frame(b)["customData"].update(
        imageUrl="https://evil.example/x.png"
    ),
    "privacy-enhanced": lambda b: _first(b).update(
        customData={"media": {"embedUrl": "javascript:alert(1)"}}
    ),
    "permission": lambda b: _first(b).update(permissions={"interact": "everybody"}),
    "at most 300": lambda b: b.update(
        objects=b["objects"] + [dict(_first(b), id=f"x{i}") for i in range(300)]
    ),
}


@pytest.mark.parametrize("message", BAD_LAYOUTS)
def test_invalid_layouts_are_refused(client, app, message):
    make_room(client, app)
    bad = _bad(layout_of(client, "sam"), BAD_LAYOUTS[message])
    response = client.put("/api/rooms/sam/layout", headers=headers(app), json=bad)
    assert response.status_code == 400
    assert message in response.json["error"]["message"].lower()


def test_demo_room_data_is_a_valid_layout(app):
    from backend.rooms import validate_layout

    appearance, objects = validate_layout(
        {"appearance": MIRA["appearance"], "objects": MIRA["objects"]}, app.static_folder
    )
    assert len(objects) == len(MIRA["objects"]) and appearance == MIRA["appearance"]


def test_the_hallway_lists_every_door_newest_first(client, app):
    assert {d["id"] for d in client.get("/api/doors").json["doors"]} == DEMO_IDS

    make_room(client, app, SAM, "sam", "Sam")
    make_room(client, app, ALEX, "alex", "Alex")
    layout = layout_of(client, "sam")
    next(o for o in layout["objects"] if o["catalogId"] == "door")["customData"] = {"color": "teal"}
    assert client.put("/api/rooms/sam/layout", headers=headers(app), json=layout).status_code == 200

    doors = client.get("/api/doors").json["doors"]
    assert [d["id"] for d in doors][:2] == ["sam", "alex"], "newest first, demo rooms last"
    assert doors[0] == {
        "id": "sam",
        "name": "Sam",
        "status": "",
        "color": "teal",
        "demo": False,
        "visits": 1,  # layout_of() visited it
        "city": None,
    }
    assert doors[1]["color"] is None, "an unpainted door keeps its original colour"
    mira = next(d for d in doors if d["id"] == "mira")
    assert mira["demo"] is True and mira["name"] == "Mira"
    assert mira["city"] == "bengaluru"
    keys = {"id", "name", "status", "color", "demo", "visits", "city"}
    assert set(mira) == keys, "nothing else leaks"


def _with_custom(layout: dict, custom: dict) -> dict:
    first = next(o for o in layout["objects"] if o["catalogId"] != "door")
    first["customData"] = {**first.get("customData", {}), **custom}
    return layout


@pytest.mark.parametrize(
    "custom",
    [
        {"song": {"provider": "spotify", "kind": "track", "id": "4uLU6hMCjMI75M1A2tKUQC"}},
        {"song": {"provider": "youtube", "kind": "video", "id": "dQw4w9WgXcQ"}},
        {"song": {"provider": "soundcloud", "kind": "track", "id": "artist-name/a-song"}},
        {"song": {"provider": "soundcloud", "kind": "playlist", "id": "artist/sets/mix_2"}},
        {"video": {"provider": "youtube", "kind": "video", "id": "dQw4w9WgXcQ"}},
    ],
)
def test_song_and_video_links_are_stored_as_references(client, app, custom):
    make_room(client, app)
    layout = _with_custom(layout_of(client, "sam"), custom)
    response = client.put("/api/rooms/sam/layout", headers=headers(app), json=layout)
    assert response.status_code == 200, response.json
    saved = _with_custom(layout_of(client, "sam"), {})
    first = next(o for o in saved["objects"] if o["catalogId"] != "door")
    assert {k: first["customData"][k] for k in custom} == custom


@pytest.mark.parametrize(
    "custom",
    [
        {"song": "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"},
        {"song": {"provider": "vimeo", "kind": "video", "id": "12345678901"}},
        {"song": {"provider": "youtube", "kind": "video", "id": "javascript:x"}},
        {"song": {"provider": "spotify", "kind": "user", "id": "4uLU6hMCjMI75M1A2tKUQC"}},
        {"song": {"provider": "soundcloud", "kind": "track", "id": "../../evil.example/x"}},
        {"song": {"provider": "youtube", "kind": "video", "id": "dQw4w9WgXcQ", "url": "x"}},
        {"video": {"provider": "spotify", "kind": "track", "id": "4uLU6hMCjMI75M1A2tKUQC"}},
    ],
)
def test_bad_song_and_video_links_are_refused(client, app, custom):
    make_room(client, app)
    layout = _with_custom(layout_of(client, "sam"), custom)
    response = client.put("/api/rooms/sam/layout", headers=headers(app), json=layout)
    assert response.status_code == 400
    assert "song or video link" in response.json["error"]["message"]


def test_each_visitor_counts_once_and_the_owner_never(client, app):
    make_room(client, app)
    assert client.get("/api/rooms/sam", headers=headers(app)).json["room"]["visits"] == 0

    stranger = app.test_client()
    first = stranger.get("/api/rooms/sam")
    assert first.json["room"]["visits"] == 1
    cookie = first.headers["Set-Cookie"]
    assert "doors_visitor=" in cookie and "HttpOnly" in cookie and "SameSite=Lax" in cookie
    assert stranger.get("/api/rooms/sam").json["room"]["visits"] == 1, "same browser"
    assert "Set-Cookie" not in stranger.get("/api/rooms/sam").headers

    assert app.test_client().get("/api/rooms/sam").json["room"]["visits"] == 2, "another browser"
    member = app.test_client()
    for _ in range(2):
        room = member.get("/api/rooms/sam", headers=headers(app, ALEX, "alex@example.com")).json
    assert room["room"]["visits"] == 3, "a member counts once, whichever browser"
    assert client.get("/api/rooms/sam", headers=headers(app)).json["room"]["visits"] == 3
    door = next(d for d in client.get("/api/doors").json["doors"] if d["id"] == "sam")
    assert door["visits"] == 3


# ---- Notes and gifts ----


def test_notes_need_a_signed_in_visitor_with_a_name(client, app):
    assert client.post("/api/rooms/mira/notes", json={"message": "hi"}).status_code == 401
    no_profile = client.post("/api/rooms/mira/notes", headers=headers(app), json={"message": "hi"})
    assert no_profile.status_code == 400 and "username" in no_profile.json["error"]["message"]

    make_room(client, app, name="Sam")
    empty = client.post("/api/rooms/mira/notes", headers=headers(app), json={"message": "   "})
    assert empty.status_code == 400
    posted = client.post(
        "/api/rooms/mira/notes", headers=headers(app), json={"message": "  hi   <b>there</b> "}
    )
    assert posted.status_code == 201
    assert posted.json["entry"]["message"] == "hi <b>there</b>"
    assert posted.json["entry"]["author"] == "Sam", "signed with the profile name"
    assert [n["message"] for n in client.get("/api/rooms/mira/notes").json["entries"]] == [
        "hi <b>there</b>"
    ]
    assert client.get("/api/rooms/jun/notes").json["entries"] == []
    assert (
        client.post(
            "/api/rooms/nobody/notes", headers=headers(app), json={"message": "x"}
        ).status_code
        == 404
    )
    assert client.get("/api/rooms/nobody/notes").status_code == 404

    # The room comes with its notes and gifts, so the page needs one request.
    visitors = client.get("/api/rooms/mira").json["visitors"]
    assert [n["message"] for n in visitors["notes"]] == ["hi <b>there</b>"]
    assert visitors["gifts"] == []


def test_gifts_and_the_hourly_limit(client, app):
    make_room(client, app)
    assert (
        client.post("/api/rooms/mira/gifts", headers=headers(app), json={"gift": "car"}).status_code
        == 400
    )
    for _ in range(20):
        assert (
            client.post(
                "/api/rooms/mira/gifts", headers=headers(app), json={"gift": "tea"}
            ).status_code
            == 201
        )
    limited = client.post("/api/rooms/mira/gifts", headers=headers(app), json={"gift": "tea"})
    assert limited.status_code == 429
    assert len(client.get("/api/rooms/mira/gifts").json["entries"]) == 20


# ---- Photos ----


def test_photo_upload_checks_the_file_and_serves_it(client, app):
    make_room(client, app)
    upload = lambda data, name="me.png": client.post(  # noqa: E731
        "/api/photos",
        headers=headers(app),
        data={"photo": (io.BytesIO(data), name)},
        content_type="multipart/form-data",
    )
    assert client.post("/api/photos").status_code == 401
    assert upload(b"<svg onload=alert(1)>", "x.png").status_code == 400, "judged by bytes, not name"
    assert upload(b"").status_code == 400
    assert upload(b"\xff\xd8\xff" + b"\x00" * (2 * 1024 * 1024)).status_code in (400, 413)

    response = upload(JPEG, "holiday.jpg")
    assert response.status_code == 201
    photo = response.json["photo"]
    assert photo["ref"].startswith("photo:") and photo["name"] == "holiday.jpg"
    served = client.get(photo["url"])
    assert served.status_code == 200 and served.mimetype == "image/jpeg" and served.data == JPEG
    assert client.get("/api/photos", headers=headers(app)).json["photos"] == [photo]
    assert client.get("/api/photos", headers=headers(app, ALEX)).json["photos"] == []
    assert client.get("/photos/not-a-photo").status_code == 404

    # The photo can go on a frame in the owner's room.
    layout = layout_of(client, "sam")
    next(o for o in layout["objects"] if o["catalogId"] == "picture-frame")["customData"][
        "imageUrl"
    ] = photo["ref"]
    assert client.put("/api/rooms/sam/layout", headers=headers(app), json=layout).status_code == 200


# ---- Tokens ----


@pytest.fixture
def verifier(app):
    signer = app.extensions["doors.signer"]
    return signer, TokenVerifier(issuer=signer.issuer, jwks=signer.jwks)


def test_tokens_must_be_signed_by_the_project_and_current(verifier):
    signer, check = verifier
    token, _ = signer.token(SAM, "sam@example.com")
    assert check.verify(token).id == SAM

    expired, _ = signer.token(SAM, "sam@example.com", lifetime=-120)
    with pytest.raises(jwt.ExpiredSignatureError):
        check.verify(expired)

    other = TokenVerifier(issuer="https://someone-else.supabase.co/auth/v1", jwks=signer.jwks)
    with pytest.raises(jwt.InvalidIssuerError):
        other.verify(token)

    unsigned = jwt.encode(
        {"sub": SAM, "aud": "authenticated", "iss": signer.issuer, "exp": time.time() + 60},
        key=None,
        algorithm="none",
        headers={"kid": "test-key"},
    )
    with pytest.raises(jwt.InvalidTokenError):
        check.verify(unsigned)

    forged = jwt.encode(
        {"sub": SAM, "aud": "authenticated", "iss": signer.issuer, "exp": time.time() + 60},
        key="a-guessed-secret-that-is-long-enough",
        algorithm="HS256",
        headers={"kid": "test-key"},
    )
    with pytest.raises(jwt.InvalidTokenError):
        check.verify(forged)


def test_anon_tokens_are_not_users(verifier):
    signer, check = verifier
    token = jwt.encode(
        {
            "role": "anon",
            "sub": "",
            "aud": "authenticated",
            "iss": signer.issuer,
            "exp": time.time() + 60,
        },
        signer._key,
        algorithm="ES256",
        headers={"kid": "test-key"},
    )
    with pytest.raises(jwt.InvalidTokenError):
        check.verify(token)


PRODUCTION_SETTINGS = {
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_x",
    # Never connected to: the pool opens on first use.
    "DATABASE_URL": "postgresql://user:pass@127.0.0.1:1/none",
}


def test_test_endpoints_exist_only_when_testing(monkeypatch):
    monkeypatch.setattr("config.ProductionConfig.SECRET_KEY", "prod-secret")
    prod = create_app("production", **PRODUCTION_SETTINGS)
    assert prod.test_client().post("/__test__/session").status_code == 404
    assert prod.test_client().post("/__test__/reset").status_code == 404


def test_production_refuses_to_start_without_supabase(monkeypatch):
    monkeypatch.setattr("config.ProductionConfig.SECRET_KEY", "prod-secret")
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        create_app("production", **{**PRODUCTION_SETTINGS, "DATABASE_URL": None})


def test_your_city_is_optional_and_from_the_list(client, app):
    make_room(client, app)
    for bad in ("atlantis", "Mumbai", 7, ["mumbai"]):
        response = client.patch("/api/me/profile", headers=headers(app), json={"city": bad})
        assert response.status_code == 400, bad
        assert "city from the list" in response.json["error"]["message"]

    response = client.patch("/api/me/profile", headers=headers(app), json={"city": "pune"})
    assert response.json["profile"]["city"] == "pune"
    assert client.get("/api/rooms/sam").json["room"]["owner"]["city"] == "pune"
    door = next(d for d in client.get("/api/doors").json["doors"] if d["id"] == "sam")
    assert door["city"] == "pune"

    response = client.patch("/api/me/profile", headers=headers(app), json={"city": ""})
    assert response.json["profile"]["city"] is None, "choosing not to say clears it"
