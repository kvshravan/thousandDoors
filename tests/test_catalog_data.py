import json
import re
import struct
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


def _frozen_keys(path: Path, name: str) -> set[str]:
    source = path.read_text(encoding="utf-8")
    block = re.search(rf"export const {name} = Object\.freeze\(\{{(.*?)\n\}}\);", source, re.S)
    assert block, f"{name} not found in {path.name}"
    return set(re.findall(r"^  (\w+): ", block.group(1), re.M))


# Every interaction type has a verb (tooltip text); the browser tests check that the
# registry's handlers match these keys exactly.
INTERACTIONS = _frozen_keys(STATIC / "js/ui/interactions.js", "INTERACTION_VERBS")
GIFT_TYPES = _frozen_keys(STATIC / "js/ui/room-store.js", "GIFTS")
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
    "landscape": _presets("LANDSCAPES"),
}
WINDOW_SCENES = _presets("WINDOW_SCENES")
ITEM_COLORS = _presets("ITEM_COLORS")
LIGHT_COLORS = _presets("LIGHT_COLORS")
LIGHT_EFFECTS = _presets("LIGHT_EFFECTS")
ROOM_OBJECTS = [(room_id, obj) for room_id, room in ROOMS.items() for obj in room["objects"]]


def test_registries_were_parsed():
    assert {"rug", "door", "window", "pictureFrame", "noticeboard", "chest"} <= BUILDERS
    assert {"photograph", "noticeboard", "lamp", "music", "secret", "seat"} <= INTERACTIONS
    assert {"flower", "tea"} <= GIFT_TYPES
    assert {"day", "night"} <= WINDOW_SCENES


def test_catalog_ids_are_unique():
    ids = [item["id"] for item in CATALOG["items"]]
    assert len(ids) == len(set(ids))


@pytest.mark.parametrize("item", CATALOG["items"], ids=lambda item: item["id"])
def test_catalog_item_is_valid(item):
    assert item["name"]
    assert item["category"] in {
        "furniture",
        "seating",
        "lighting",
        "music",
        "tech",
        "decor",
        "wall",
        "hobbies",
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
    assert item["placement"] in {"floor", "surface", "wall", "ceiling", "fixed"}
    if item.get("flat"):
        assert item["placement"] == "floor"
    if "thumbnail" in item:
        thumb = STATIC / "models" / item["thumbnail"]
        assert thumb.is_file(), f"missing thumbnail {thumb}"
        assert thumb.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"
    if item.get("addable", True) and item["placement"] != "fixed":
        assert item.get("thumbnail") or item.get("icon"), "the catalogue needs a picture"
    if "permissions" in item:
        assert item["permissions"]["interact"] in PERMISSION_LEVELS
    if "light" in item:
        assert item["light"]["intensity"] > 0
        assert len(item["light"]["position"]) == 3
    if "recolor" in item:
        _check_recolor(item)
    assert all(isinstance(tag, str) and tag == tag.lower() for tag in item.get("tags", []))
    assert isinstance(item.get("defaults", {}), dict)
    assert isinstance(item.get("addable", True), bool)
    assert 0.1 <= item.get("scale", 1) <= 4
    if "mount" in item:
        assert item["placement"] == "ceiling" and 0 <= item["mount"]["drop"] <= 1.5
    if "light" in item:
        for key, value in item["light"].get("defaults", {}).items():
            assert value in {"color": LIGHT_COLORS, "effect": LIGHT_EFFECTS}[key]
    if "text" in item:
        assert item["text"]["field"] and 1 <= item["text"]["maxLength"] <= 40
    if "photos" in item:
        assert item["photos"]["field"] in {"imageUrl", "photos"}
        assert item["placement"] == "wall"
    if item.get("support"):
        assert item["placement"] == "wall", "floor furniture is a support already"


def _glb_materials(path: Path) -> set[str]:
    data = path.read_bytes()
    length = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20 : 20 + length])
    return {material.get("name") for material in gltf.get("materials", [])}


def _check_recolor(item):
    if item.get("model"):
        materials = _glb_materials(STATIC / "models" / item["model"])
        assert item["recolor"] in materials, f"{item['recolor']} not in {sorted(materials)}"
    else:
        # The builder must take the option, e.g. `color = 'terracotta'` in its parameters.
        source = "".join(
            p.read_text(encoding="utf-8") for p in (STATIC / "js/three/props").glob("*.js")
        )
        name = item["builder"][0].upper() + item["builder"][1:]
        pattern = rf"function build{name}\([^)]*\b{item['recolor']} ="
        assert re.search(pattern, source), (
            f"builder {item['builder']} has no {item['recolor']} option"
        )


@pytest.mark.parametrize("room_id", sorted(ROOMS))
def test_room_colours_and_sizes_are_known(room_id):
    for obj in ROOMS[room_id]["objects"]:
        entry = CATALOG_BY_ID[obj["catalogId"]]
        custom = obj.get("customData", {})
        if "color" in custom:
            assert "recolor" in entry
            assert custom["color"] in ITEM_COLORS
        if "light" in custom:
            assert "light" in entry
            assert custom["light"].get("color", "warm") in LIGHT_COLORS
            assert custom["light"].get("effect", "steady") in LIGHT_EFFECTS
        if "text" in entry and entry["text"]["field"] in custom:
            assert 0 < len(custom[entry["text"]["field"]]) <= entry["text"]["maxLength"]
        for ref in custom.get("photos", []):
            assert ref.startswith("/static/images/") and (ROOT / ref.lstrip("/")).is_file()


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
    assert {"beach", "forest", "city", "countryside", "snow", "desert"} == APPEARANCE_PRESETS[
        "landscape"
    ]
    assert {"warm", "multi"} <= LIGHT_COLORS
    assert {"steady", "twinkle"} <= LIGHT_EFFECTS


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
    _check_interaction_data(entry.get("interaction"), custom)


def _check_interaction_data(interaction, custom):
    if interaction == "noticeboard":
        for note in custom.get("entries", []):
            assert note["author"] and note["message"]
    elif interaction == "gifts":
        for gift in custom.get("gifts", []):
            assert gift["author"] and gift["gift"] in GIFT_TYPES
    elif interaction == "music":
        track = custom["track"]
        assert track["title"] and track["artist"] and 40 <= track["tempo"] <= 200
        assert track["notes"] and all(n is None or 21 <= n <= 108 for n in track["notes"])
    elif interaction == "poster":
        assert custom["title"] and isinstance(custom.get("items", []), list)
    elif interaction == "collection":
        for item in custom.get("items", []):
            assert item["title"] and item["type"] in {"book", "game", "collectible", "record"}
    elif interaction == "media":
        assert custom["media"]["title"]
        assert "embedUrl" not in custom["media"], "mock rooms must not embed external media"
    elif interaction == "secret":
        assert custom["secret"]["message"]
    elif interaction == "window" and "scene" in custom:
        assert custom["scene"] in WINDOW_SCENES


def test_main_demo_room_uses_every_interaction():
    used = {CATALOG_BY_ID[obj["catalogId"]].get("interaction") for obj in ROOMS["mira"]["objects"]}
    assert INTERACTIONS <= used
