"""JSON API used by the room, sign-in, and welcome pages. All responses are JSON; errors
look like { "error": { "code": "...", "message": "..." } }."""

import uuid

from flask import Blueprint, current_app, jsonify, request

from backend.auth import current_user, require_user
from backend.photos import EXTENSIONS, PhotoError, sniff
from backend.rooms import LayoutError, check_username, clean_text, starter_room, validate_layout
from backend.store import NotFound, StoreError

api_bp = Blueprint("api", __name__, url_prefix="/api")

GIFTS = frozenset({"flower", "cookie", "star", "tea"})
MAX_MESSAGE = 280


def store():
    return current_app.extensions["doors.store"]


def photo_storage():
    return current_app.extensions["doors.photos"]


def error(code: str, message: str, status: int):
    return jsonify(error={"code": code, "message": message}), status


@api_bp.errorhandler(StoreError)
def handle_store_error(exc: StoreError):
    return error(exc.code, exc.message, exc.status)


@api_bp.errorhandler(LayoutError)
@api_bp.errorhandler(PhotoError)
def handle_bad_input(exc: ValueError):
    return error("invalid", str(exc), 400)


def body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise LayoutError("Send a JSON object.")
    return data


def profile_json(profile: dict | None) -> dict | None:
    if not profile:
        return None
    return {
        "username": profile["username"],
        "displayName": profile.get("display_name") or profile["username"],
        "bio": profile.get("bio", ""),
        "status": profile.get("status", ""),
        "interests": list(profile.get("interests") or []),
    }


def _author(user) -> str:
    profile = store().profile(user)
    if not profile:
        raise StoreError("Choose a username first, so people know who it's from.")
    return profile.get("display_name") or profile["username"]


# ---- Me ----


@api_bp.get("/me")
@require_user
def me():
    user = current_user()
    return jsonify(
        user={"id": user.id, "email": user.email}, profile=profile_json(store().profile(user))
    )


@api_bp.post("/me/profile")
@require_user
def create_profile():
    data = body()
    username = check_username(str(data.get("username", "")).strip().lower())
    display_name = clean_text(data.get("displayName"), 40) or username
    starter = starter_room(current_app.static_folder, username, display_name)
    profile = store().create_profile(current_user(), username, display_name, starter)
    return jsonify(profile=profile_json(profile), roomUrl=f"/room/{username}"), 201


@api_bp.patch("/me/profile")
@require_user
def update_profile():
    data = body()
    fields = {}
    if "displayName" in data:
        fields["display_name"] = clean_text(data["displayName"], 40)
    if "bio" in data:
        fields["bio"] = clean_text(data["bio"], 280)
    if "status" in data:
        fields["status"] = clean_text(data["status"], 80)
    if "interests" in data:
        interests = data["interests"] if isinstance(data["interests"], list) else []
        fields["interests"] = [t for t in (clean_text(i, 30) for i in interests[:12]) if t]
    if not fields:
        raise LayoutError("Nothing to change.")
    return jsonify(profile=profile_json(store().update_profile(current_user(), fields)))


# ---- Rooms ----


@api_bp.get("/rooms/<room_id>")
def get_room(room_id: str):
    # The room page gets everything it needs in one request (one database query).
    found = store().room(room_id, current_user(), with_visitors=True)
    if not found:
        raise NotFound("No such room.")
    room, viewer, visitors = found
    return jsonify(room=room, viewer=viewer, visitors=visitors)


@api_bp.put("/rooms/<room_id>/layout")
@require_user
def save_layout(room_id: str):
    # Check the room and the right to edit it before looking at what was sent.
    found = store().room(room_id, current_user())
    if not found:
        raise NotFound("No such room.")
    if not found[1]["canEdit"]:
        return error("forbidden", "Only the owner can change this room.", 403)
    appearance, objects = validate_layout(body(), current_app.static_folder)
    store().save_layout(room_id, current_user(), appearance, objects)
    return jsonify(saved=True, objects=len(objects))


@api_bp.get("/rooms/<room_id>/<any(notes, gifts):kind>")
def list_entries(room_id: str, kind: str):
    entries = store().list_entries(kind, room_id)
    if entries is None:
        raise NotFound("No such room.")
    return jsonify(entries=entries)


@api_bp.post("/rooms/<room_id>/<any(notes, gifts):kind>")
@require_user
def add_entry(room_id: str, kind: str):
    data = body()
    if kind == "notes":
        value = clean_text(data.get("message"), MAX_MESSAGE)
        if not value:
            raise LayoutError("Write something first.")
    else:
        value = data.get("gift")
        if value not in GIFTS:
            raise LayoutError("Unknown gift.")
    entry = store().add_entry(kind, room_id, current_user(), _author(current_user()), value)
    return jsonify(entry=entry), 201


# ---- Photos ----


def photo_json(row: dict) -> dict:
    return {"ref": f"photo:{row['id']}", "url": f"/photos/{row['id']}", "name": row.get("name", "")}


@api_bp.post("/photos")
@require_user
def upload_photo():
    file = request.files.get("photo")
    if not file:
        raise PhotoError("Choose a photo to upload.")
    data = file.read(2 * 1024 * 1024 + 1)
    content_type = sniff(data)
    user = current_user()
    photo_id = str(uuid.uuid4())
    record = {
        "id": photo_id,
        "path": f"{user.id}/{photo_id}.{EXTENSIONS[content_type]}",
        "content_type": content_type,
        "byte_size": len(data),
        "name": clean_text(request.form.get("name") or file.filename or "Photo", 80),
    }
    # Upload the file first: a stray file is harmless, a record without a file isn't.
    photo_storage().put(record["path"], data, content_type)
    row = store().add_photo(user, record)
    return jsonify(photo=photo_json(row)), 201


@api_bp.get("/photos")
@require_user
def list_photos():
    return jsonify(photos=[photo_json(row) for row in store().list_photos(current_user())])
