import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
CATALOG = json.loads((STATIC / "data" / "catalog.json").read_text(encoding="utf-8"))
ROOMS = {
    path.stem: json.loads(path.read_text(encoding="utf-8"))
    for path in sorted((STATIC / "data" / "rooms").glob("*.json"))
}
CATALOG_BY_ID = {item["id"]: item for item in CATALOG["items"]}


def _registered_names(path: Path, pattern: str) -> set[str]:
    return set(re.findall(pattern, path.read_text(encoding="utf-8"), re.M))


BUILDERS = _registered_names(STATIC / "js/three/props/index.js", r"^\s+(\w+): build\w+,")
INTERACTIONS = _registered_names(STATIC / "js/ui/interactions.js", r"^\s+(\w+): \(")
PERMISSION_LEVELS = {"everyone", "followers", "friends", "owner"}


def _presets(name: str) -> set[str]:
    source = (STATIC / "js/three/room-config.js").read_text(encoding="utf-8")
    block = re.search(rf"export const {name} = Object\.freeze\(\{{(.*?)\n\}}\);", source, re.S)
    assert block, f"{name} not found in room-config.js"
    return set(re.findall(r"^  (\w+): \{", block.group(1), re.M))


APPEARANCE_PRESETS = {
    "theme": _presets("THEMES"),
    "wallpaper": _presets("WALLPAPERS"),
    "floor": _presets("FLOORS"),
    "lighting": _presets("LIGHTING_MOODS"),
}
ROOM_OBJECTS = [(room_id, obj) for room_id, room in ROOMS.items() for obj in room["objects"]]


def test_registries_were_parsed():
    assert {"rug", "door", "window", "pictureFrame", "guestbook"} <= BUILDERS
    assert {"photograph", "guestbook", "lamp"} <= INTERACTIONS


def test_catalog_ids_are_unique():
    ids = [item["id"] for item in CATALOG["items"]]
    assert len(ids) == len(set(ids))


@pytest.mark.parametrize("item", CATALOG["items"], ids=lambda item: item["id"])
def test_catalog_item_is_valid(item):
    assert item["name"]
    assert item["category"] in {
        "furniture",
        "decorations",
        "personal",
        "entertainment",
        "social",
        "environment",
    }
    assert bool(item.get("model")) != bool(item.get("builder")), "exactly one of model or builder"
    if item.get("model"):
        model = STATIC / "models" / item["model"]
        assert model.is_file(), f"missing model {model}"
        assert model.read_bytes()[:4] == b"glTF", "model must be binary glTF (.glb)"
    else:
        assert item["builder"] in BUILDERS, f"unknown builder {item['builder']}"
    if "interaction" in item:
        assert item["interaction"] in INTERACTIONS, f"no handler for {item['interaction']}"
    if "light" in item:
        assert item["light"]["intensity"] > 0
        assert len(item["light"]["position"]) == 3


def test_every_vendored_model_is_in_the_catalog():
    used = {item["model"] for item in CATALOG["items"] if "model" in item}
    shipped = {f"furniture/{p.name}" for p in (STATIC / "models" / "furniture").glob("*.glb")}
    assert shipped == used


def test_third_party_model_license_is_included():
    license_text = (STATIC / "models" / "furniture" / "LICENSE-kenney.txt").read_text()
    assert "CC0" in license_text


def test_registries_and_presets_were_parsed():
    assert {"cozy"} == APPEARANCE_PRESETS["theme"]
    assert {"cream", "midnight"} <= APPEARANCE_PRESETS["wallpaper"]
    assert {"oak", "walnut"} <= APPEARANCE_PRESETS["floor"]
    assert {"day", "night"} <= APPEARANCE_PRESETS["lighting"]


def test_there_are_at_least_two_rooms():
    assert {"mira", "jun"} <= set(ROOMS)


@pytest.mark.parametrize("room_id", sorted(ROOMS))
def test_room_metadata_is_valid(room_id):
    room = ROOMS[room_id]
    assert room["roomId"] == room_id
    assert room["name"]
    owner = room["owner"]
    assert owner["username"] == room_id
    assert owner["displayName"] and owner["bio"]
    assert isinstance(owner["online"], bool)
    assert all(isinstance(tag, str) for tag in owner["interests"])
    for key, value in room["appearance"].items():
        assert value in APPEARANCE_PRESETS[key], f"unknown {key} {value!r}"


@pytest.mark.parametrize("room_id", sorted(ROOMS))
def test_room_object_ids_are_unique(room_id):
    ids = [obj["id"] for obj in ROOMS[room_id]["objects"]]
    assert len(ids) == len(set(ids))


@pytest.mark.parametrize("room_id", sorted(ROOMS))
def test_room_has_exactly_one_door(room_id):
    doors = [obj for obj in ROOMS[room_id]["objects"] if obj["catalogId"] == "door"]
    assert len(doors) == 1


@pytest.mark.parametrize(
    ("room_id", "obj"), ROOM_OBJECTS, ids=[f"{r}:{o['id']}" for r, o in ROOM_OBJECTS]
)
def test_room_object_is_valid(room_id, obj):
    assert obj["catalogId"] in CATALOG_BY_ID, f"unknown catalogue item {obj['catalogId']}"
    for key in ("position", "rotation", "scale"):
        vector = obj[key]
        assert set(vector) == {"x", "y", "z"}
        assert all(isinstance(v, int | float) for v in vector.values())
    assert -5 <= obj["position"]["x"] <= 5
    assert 0 <= obj["position"]["y"] <= 4
    assert -5 <= obj["position"]["z"] <= 5
    assert all(v > 0 for v in obj["scale"].values())
    if "permissions" in obj:
        assert obj["permissions"]["interact"] in PERMISSION_LEVELS

    entry = CATALOG_BY_ID[obj["catalogId"]]
    custom = obj.get("customData", {})
    if entry.get("interaction") == "photograph":
        assert custom.get("imageUrl", "").startswith("/static/"), "photos need a local imageUrl"
        assert custom.get("caption")
    if image := custom.get("imageUrl"):
        assert (ROOT / image.lstrip("/")).is_file(), f"missing image {image}"
    if entry.get("interaction") == "guestbook":
        for entry_ in custom.get("entries", []):
            assert entry_["author"] and entry_["message"]


def test_main_demo_room_uses_every_interaction():
    used = {CATALOG_BY_ID[obj["catalogId"]].get("interaction") for obj in ROOMS["mira"]["objects"]}
    assert INTERACTIONS <= used
