import re
from pathlib import Path

from flask import Blueprint, abort, current_app, jsonify, render_template

pages_bp = Blueprint("pages", __name__)

DEFAULT_ROOM = "mira"
ROOM_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")


def _mock_room_exists(room_id: str) -> bool:
    # Mock rooms live in static/data/rooms until Milestone 4 moves them into the database.
    if not ROOM_ID_PATTERN.fullmatch(room_id):
        return False
    return (Path(current_app.static_folder) / "data" / "rooms" / f"{room_id}.json").is_file()


@pages_bp.get("/")
def index():
    return render_template("index.html")


@pages_bp.get("/room", defaults={"room_id": DEFAULT_ROOM})
@pages_bp.get("/room/<room_id>")
def room(room_id: str):
    if not _mock_room_exists(room_id):
        abort(404)
    return render_template("room.html", room_id=room_id)


@pages_bp.get("/healthz")
def healthz():
    return jsonify(status="ok", version=current_app.config["APP_VERSION"])
