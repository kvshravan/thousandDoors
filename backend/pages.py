import re

from flask import (
    Blueprint,
    Response,
    abort,
    current_app,
    jsonify,
    redirect,
    render_template,
    request,
)

from config import OAUTH_PROVIDERS

pages_bp = Blueprint("pages", __name__)

DEFAULT_ROOM = "mira"
ROOM_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{1,39}$")
PHOTO_ID_PATTERN = re.compile(r"^[0-9a-f-]{36}$")


def _store():
    return current_app.extensions["doors.store"]


@pages_bp.get("/")
def index():
    return render_template("index.html")


@pages_bp.get("/room", defaults={"room_id": DEFAULT_ROOM})
@pages_bp.get("/room/<room_id>")
def room(room_id: str):
    if not ROOM_ID_PATTERN.fullmatch(room_id) or not _store().room_exists(room_id):
        abort(404)
    return render_template("room.html", room_id=room_id)


@pages_bp.get("/hallway")
def hallway():
    # The doors come with the page: one database query, no extra request.
    return render_template("hallway.html", doors=_store().list_doors())


@pages_bp.get("/signin")
def signin():
    providers = [(key, OAUTH_PROVIDERS[key]) for key in current_app.config["AUTH_PROVIDERS"]]
    return render_template("signin.html", providers=providers)


@pages_bp.get("/welcome")
def welcome():
    return render_template("welcome.html")


@pages_bp.get("/photos/<photo_id>")
def photo(photo_id: str):
    if not PHOTO_ID_PATTERN.fullmatch(photo_id):
        abort(404)
    row = _store().photo(photo_id)
    if not row:
        abort(404)
    storage = current_app.extensions["doors.photos"]
    url = storage.public_url(row["path"])
    if url:
        return redirect(url, code=302)
    stored = storage.get(row["path"])
    if not stored:
        abort(404)
    data, content_type = stored
    return Response(data, mimetype=content_type, headers={"Cache-Control": "max-age=3600"})


@pages_bp.get("/healthz")
def healthz():
    return jsonify(status="ok", version=current_app.config["APP_VERSION"])


test_bp = Blueprint("test_support", __name__)


@test_bp.post("/__test__/reset")
def test_reset():
    """Empties the in-memory store between browser tests (registered only when TESTING)."""
    from backend.photos import MemoryPhotoStorage
    from backend.store import MemoryStore

    current_app.extensions["doors.store"] = MemoryStore(current_app.static_folder)
    current_app.extensions["doors.photos"] = MemoryPhotoStorage()
    return jsonify(reset=True)


@test_bp.post("/__test__/session")
def test_session():
    """Signs in a test user without email (registered only when TESTING)."""
    data = request.get_json(silent=True) or {}
    user_id = str(data.get("id") or "00000000-0000-4000-8000-000000000001")
    email = str(data.get("email") or "tester@example.com")
    token, expires = current_app.extensions["doors.signer"].token(
        user_id, email, name=data.get("name")
    )
    return jsonify(
        access_token=token,
        refresh_token="test-refresh",
        expires_at=expires,
        user={"id": user_id, "email": email},
    )
