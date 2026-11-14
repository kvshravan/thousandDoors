import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
CATALOG = json.loads((STATIC / "data" / "catalog.json").read_text(encoding="utf-8"))
DEMO_ROOM = json.loads((STATIC / "data" / "demo-room.json").read_text(encoding="utf-8"))
CATALOG_BY_ID = {item["id"]: item for item in CATALOG["items"]}


def _registered_names(path: Path, pattern: str) -> set[str]:
    return set(re.findall(pattern, path.read_text(encoding="utf-8"), re.M))


BUILDERS = _registered_names(STATIC / "js/three/props/index.js", r"^\s+(\w+): build\w+,")
INTERACTIONS = _registered_names(STATIC / "js/ui/interactions.js", r"^\s+(\w+): \(")


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


def test_demo_room_object_ids_are_unique():
    ids = [obj["id"] for obj in DEMO_ROOM["objects"]]
    assert len(ids) == len(set(ids))


@pytest.mark.parametrize("obj", DEMO_ROOM["objects"], ids=lambda obj: obj["id"])
def test_demo_room_object_is_valid(obj):
    assert obj["catalogId"] in CATALOG_BY_ID, f"unknown catalogue item {obj['catalogId']}"
    for key in ("position", "rotation", "scale"):
        vector = obj[key]
        assert set(vector) == {"x", "y", "z"}
        assert all(isinstance(v, int | float) for v in vector.values())
    assert -5 <= obj["position"]["x"] <= 5
    assert 0 <= obj["position"]["y"] <= 4
    assert -5 <= obj["position"]["z"] <= 5
    assert all(v > 0 for v in obj["scale"].values())

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


def test_demo_room_has_one_of_each_interaction():
    used = {CATALOG_BY_ID[obj["catalogId"]].get("interaction") for obj in DEMO_ROOM["objects"]}
    assert INTERACTIONS <= used
