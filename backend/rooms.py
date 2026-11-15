"""Room documents: demo rooms, the starter room for new members, and validation of
layouts sent by the editor. A room document has the same shape as
static/data/rooms/*.json: { roomId, name, description, owner, appearance, objects }.
"""

import copy
import json
import math
import re
from functools import lru_cache
from pathlib import Path

USERNAME = re.compile(r"^[a-z0-9][a-z0-9_-]{2,19}$")
# Words that can't be usernames, because they are (or may become) site paths.
RESERVED_USERNAMES = frozenset(
    {
        "about", "admin", "api", "auth", "doors", "hallway", "healthz", "help", "me", "new",
        "photos", "room", "rooms", "settings", "signin", "signout", "static", "support", "welcome",
    }
)  # fmt: skip
OBJECT_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$")
PHOTO_REF = re.compile(
    r"^(/static/images/[\w\-/]+\.(svg|png|jpe?g|webp)|photo:[0-9a-f-]{36}|upload:[\w-]{8,64})$"
)
SAFE_EMBED = re.compile(r"^https://www\.youtube-nocookie\.com/embed/[\w-]{6,20}$")
# Songs and videos are stored as references, never URLs (see static/js/media.js).
MEDIA_FIELDS = {"song": {"youtube", "spotify", "soundcloud"}, "video": {"youtube"}}
SPOTIFY_KINDS = frozenset({"track", "album", "playlist", "episode", "show", "artist"})
MEDIA_IDS = {
    "youtube": re.compile(r"^[\w-]{11}$"),
    "spotify": re.compile(r"^[A-Za-z0-9]{22}$"),
    "soundcloud": re.compile(r"^[a-z0-9_-]{1,64}/(sets/)?[a-z0-9_-]{1,120}$"),
}
PERMISSION_LEVELS = frozenset({"everyone", "followers", "friends", "owner"})
APPEARANCE_KEYS = {
    "theme": "THEMES",
    "wallpaper": "WALLPAPERS",
    "floor": "FLOORS",
    "lighting": "LIGHTING_MOODS",
    "landscape": "LANDSCAPES",
}
MAX_OBJECTS = 300
MAX_OBJECT_BYTES = 16_000
MAX_LAYOUT_BYTES = 256_000
# The room is 10 x 4 x 10 m; allow a little slack for things hanging on walls.
BOUNDS = {"y": (-0.5, 4.5)}


class LayoutError(ValueError):
    """A layout the editor sent isn't valid."""


@lru_cache(maxsize=4)
def presets(static_folder: str) -> dict[str, frozenset[str]]:
    """Appearance preset names, read from room-config.js so there's one source of truth."""
    source = (Path(static_folder) / "js" / "three" / "room-config.js").read_text(encoding="utf-8")
    result = {}
    for key, name in APPEARANCE_KEYS.items():
        block = re.search(rf"export const {name} = Object\.freeze\(\{{(.*?)\n\}}\);", source, re.S)
        if not block:
            raise RuntimeError(f"{name} not found in room-config.js")
        result[key] = frozenset(re.findall(r"^  (\w+): \{", block.group(1), re.M))
    return result


@lru_cache(maxsize=4)
def catalog_ids(static_folder: str) -> frozenset[str]:
    data = json.loads((Path(static_folder) / "data" / "catalog.json").read_text(encoding="utf-8"))
    return frozenset(item["id"] for item in data["items"])


@lru_cache(maxsize=4)
def city_ids(static_folder: str) -> frozenset[str]:
    data = json.loads((Path(static_folder) / "data" / "cities.json").read_text(encoding="utf-8"))
    return frozenset(city["id"] for city in data["cities"])


def check_city(value: object, static_folder: str) -> str | None:
    """A city id from the list, or None to not say."""
    if value in (None, ""):
        return None
    if not isinstance(value, str) or value not in city_ids(static_folder):
        raise LayoutError("Pick a city from the list.")
    return value


def demo_rooms(static_folder: str) -> list[dict]:
    rooms_dir = Path(static_folder) / "data" / "rooms"
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(rooms_dir.glob("*.json"))]


def starter_room(static_folder: str, username: str, display_name: str) -> dict:
    """A furnished first room for a new member."""
    path = Path(static_folder) / "data" / "templates" / "starter.json"
    template = json.loads(path.read_text(encoding="utf-8"))
    room = copy.deepcopy(template)
    room["roomId"] = username
    room["name"] = f"{display_name or username}'s room"
    return room


def check_username(username: object) -> str:
    if not isinstance(username, str) or not USERNAME.fullmatch(username):
        raise LayoutError(
            "Usernames are 3–20 characters: lowercase letters, numbers, - and _, "
            "starting with a letter or number."
        )
    if username in RESERVED_USERNAMES:
        raise LayoutError("That username is reserved. Try another.")
    return username


def clean_text(value: object, max_length: int) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:max_length]


def _vector(value: object, name: str, low: float, high: float) -> dict:
    if not isinstance(value, dict):
        raise LayoutError(f"{name} must be an object with x, y, and z.")
    result = {}
    for axis in "xyz":
        number = value.get(axis)
        if isinstance(number, bool) or not isinstance(number, int | float):
            raise LayoutError(f"{name}.{axis} must be a number.")
        number = float(number)
        if not math.isfinite(number) or not low <= number <= high:
            raise LayoutError(f"{name}.{axis} is out of range.")
        result[axis] = number
    return result


def _check_refs(custom: dict) -> None:
    image = custom.get("imageUrl")
    if image is not None and not (isinstance(image, str) and PHOTO_REF.fullmatch(image)):
        raise LayoutError("A frame's photo must be a bundled image or one of your photos.")
    photos = custom.get("photos")
    if photos is not None:
        if not isinstance(photos, list) or len(photos) > 6:
            raise LayoutError("A photo string holds at most 6 photos.")
        if not all(isinstance(ref, str) and PHOTO_REF.fullmatch(ref) for ref in photos):
            raise LayoutError("Photos must be bundled images or your own photos.")
    media = custom.get("media")
    if isinstance(media, dict) and "embedUrl" in media:
        if not (isinstance(media["embedUrl"], str) and SAFE_EMBED.fullmatch(media["embedUrl"])):
            raise LayoutError("Only privacy-enhanced YouTube embeds are allowed.")
    for field, providers in MEDIA_FIELDS.items():
        if field in custom and not _is_media_ref(custom[field], providers):
            raise LayoutError("That song or video link isn't one we can play.")


def _is_media_ref(ref: object, providers: set[str]) -> bool:
    if not isinstance(ref, dict) or set(ref) != {"provider", "kind", "id"}:
        return False
    provider, kind, ident = ref["provider"], ref["kind"], ref["id"]
    if provider not in providers or not isinstance(ident, str):
        return False
    if not MEDIA_IDS[provider].fullmatch(ident):
        return False
    if provider == "youtube":
        return kind == "video"
    if provider == "spotify":
        return kind in SPOTIFY_KINDS
    return kind == ("playlist" if "/sets/" in ident else "track")


def validate_layout(data: object, static_folder: str) -> tuple[dict, list[dict]]:
    """Checks a layout ({ appearance, objects }) and returns a cleaned copy."""
    if not isinstance(data, dict):
        raise LayoutError("Send a layout object.")
    if len(json.dumps(data)) > MAX_LAYOUT_BYTES:
        raise LayoutError("That room is too big to save.")

    appearance_in = data.get("appearance") or {}
    if not isinstance(appearance_in, dict):
        raise LayoutError("appearance must be an object.")
    known = presets(static_folder)
    appearance = {}
    for key, value in appearance_in.items():
        if key not in known:
            raise LayoutError(f"Unknown appearance setting {key!r}.")
        if value not in known[key]:
            raise LayoutError(f"Unknown {key} {value!r}.")
        appearance[key] = value

    objects_in = data.get("objects")
    if not isinstance(objects_in, list):
        raise LayoutError("objects must be a list.")
    if len(objects_in) > MAX_OBJECTS:
        raise LayoutError(f"A room holds at most {MAX_OBJECTS} things.")
    ids = catalog_ids(static_folder)
    seen = set()
    objects = []
    for raw in objects_in:
        if not isinstance(raw, dict):
            raise LayoutError("Each object must be an object.")
        object_id = raw.get("id")
        if not isinstance(object_id, str) or not OBJECT_ID.fullmatch(object_id):
            raise LayoutError("Each object needs a simple id.")
        if object_id in seen:
            raise LayoutError(f"Duplicate object id {object_id!r}.")
        seen.add(object_id)
        if raw.get("catalogId") not in ids:
            raise LayoutError(f"{object_id}: unknown catalogue item.")
        position = _vector(raw.get("position"), "position", -5.5, 5.5)
        if not BOUNDS["y"][0] <= position["y"] <= BOUNDS["y"][1]:
            raise LayoutError("position.y is out of range.")
        obj = {
            "id": object_id,
            "catalogId": raw["catalogId"],
            "position": position,
            "rotation": _vector(raw.get("rotation"), "rotation", -7, 7),
            "scale": _vector(raw.get("scale"), "scale", 0.25, 4),
        }
        custom = raw.get("customData")
        if custom is not None:
            if not isinstance(custom, dict):
                raise LayoutError(f"{object_id}: customData must be an object.")
            if len(json.dumps(custom)) > MAX_OBJECT_BYTES:
                raise LayoutError(f"{object_id}: too much data.")
            _check_refs(custom)
            if custom:
                obj["customData"] = custom
        permissions = raw.get("permissions")
        if permissions is not None:
            level = permissions.get("interact") if isinstance(permissions, dict) else "?"
            if level is not None and level not in PERMISSION_LEVELS:
                raise LayoutError(f"{object_id}: unknown permission level.")
            if level:
                obj["permissions"] = {"interact": level}
        objects.append(obj)
    if not any(obj["catalogId"] == "door" for obj in objects):
        raise LayoutError("Every room keeps its door.")
    return appearance, objects


def owner_card(profile: dict | None, demo_owner: dict | None = None) -> dict:
    """The owner shown on a room's nameplate, door, and desk."""
    if demo_owner:
        return demo_owner
    profile = profile or {}
    return {
        "username": profile.get("username", ""),
        "displayName": profile.get("display_name") or profile.get("username", ""),
        "bio": profile.get("bio", ""),
        "status": profile.get("status", ""),
        "online": False,
        "interests": list(profile.get("interests") or []),
        "city": profile.get("city"),
    }
