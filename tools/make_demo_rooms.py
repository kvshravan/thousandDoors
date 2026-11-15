"""Writes the extra demo rooms in static/data/rooms/ from the starter room.

Run once (python tools/make_demo_rooms.py) after changing the recipes below. Every room
starts from static/data/templates/starter.json, whose layout is known to fit, and only
recolours things, swaps pieces for others of the same size, and adds wall and ceiling
pieces taken from Mira's and Jun's rooms at spots that are free in the starter room.
"""

import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "static" / "data"

STARTER = json.loads((DATA / "templates" / "starter.json").read_text(encoding="utf-8"))
MIRA = {
    o["id"]: o for o in json.loads((DATA / "rooms" / "mira.json").read_text("utf-8"))["objects"]
}
JUN = {o["id"]: o for o in json.loads((DATA / "rooms" / "jun.json").read_text("utf-8"))["objects"]}

ROOMS = [
    {
        "id": "aarav",
        "name": "Aarav's room",
        "description": "Code, coffee, and cricket on the radio",
        "owner": {
            "displayName": "Aarav",
            "bio": "Builds apps by day, bowls leg-spin on weekends. Ask me about filter coffee.",
            "status": "Shipping a side project",
            "online": True,
            "interests": ["coding", "cricket", "coffee", "podcasts"],
            "city": "bengaluru",
        },
        "appearance": {
            "wallpaper": "sage",
            "floor": "birch",
            "lighting": "day",
            "landscape": "forest",
        },
        "door": "teal",
        "colors": {"couch": "navy", "bed": "sky", "pendant": "mustard", "desk": "woodLight"},
        "add": [
            ("jun", "neon-sign", {"text": "ship it", "light": {"color": "blue"}}),
            ("mira", "armchair", None),
            ("mira", "clock", None),
            (
                "jun",
                "poster-records",
                {
                    "title": "Weekend list",
                    "subtitle": "Podcasts",
                    "motif": "wave",
                    "accent": "sage",
                    "items": ["Build in Public", "Spin Bowling 101", "Chai Talks"],
                },
            ),
        ],
        "media": {"title": "Highlights: a slow afternoon of test cricket", "kind": "Sport"},
    },
    {
        "id": "priya",
        "name": "Priya's room",
        "description": "Sea breeze, sketchbooks, and a lot of fairy lights",
        "owner": {
            "displayName": "Priya",
            "bio": "Illustrator by the sea. Sketches strangers on the local train (nicely).",
            "status": "Drawing the monsoon",
            "online": True,
            "interests": ["drawing", "the sea", "street food", "indie pop"],
            "city": "mumbai",
        },
        "appearance": {
            "wallpaper": "blush",
            "floor": "oak",
            "lighting": "evening",
            "landscape": "beach",
        },
        "door": "coral",
        "colors": {"couch": "dustyPink", "bed": "cream", "pendant": "coral"},
        "add": [
            ("mira", "photo-string", {"label": "Beach days"}),
            ("jun", "fairy-lights", {"light": {"color": "warm", "effect": "twinkle"}}),
            (
                "mira",
                "poster-films",
                {
                    "title": "Sketch list",
                    "subtitle": "To draw",
                    "motif": "sun",
                    "accent": "terracotta",
                    "items": ["Fishing boats at dawn", "Vada pav stall", "Rain on the sea face"],
                },
            ),
            ("mira", "coat-rack", None),
        ],
        "media": {"title": "Waves at Juhu, all evening", "kind": "Slow TV"},
    },
    {
        "id": "kabir",
        "name": "Kabir's room",
        "description": "Vinyl, chai, and old films",
        "owner": {
            "displayName": "Kabir",
            "bio": "Collects old Hindi film records. Will make you chai whether you want it.",
            "status": "Spinning a 1970s soundtrack",
            "online": False,
            "interests": ["vinyl", "old films", "chai", "history"],
            "city": "delhi",
        },
        "appearance": {
            "wallpaper": "midnight",
            "floor": "walnut",
            "lighting": "evening",
            "landscape": "city",
        },
        "door": "mustard",
        "colors": {
            "couch": "terracotta",
            "bed": "plum",
            "pendant": "mustard",
            "bookcase-1": "woodDark",
        },
        "swap": {"corner-plant": ("jun", "speaker-left")},
        "add": [
            (
                "jun",
                "poster-records",
                {
                    "title": "Crate digging",
                    "subtitle": "Records",
                    "motif": "film",
                    "accent": "mustard",
                    "items": ["Monsoon Melodies", "Night in Old Delhi", "Chai & Trumpets"],
                },
            ),
            ("mira", "clock", None),
            ("mira", "armchair", None),
        ],
        "media": {"title": "A black-and-white classic", "kind": "Film", "year": 1957},
    },
    {
        "id": "ananya",
        "name": "Ananya's room",
        "description": "Plants on every surface",
        "owner": {
            "displayName": "Ananya",
            "bio": "Plant doctor for my whole building. Currently propagating 31 cuttings.",
            "status": "Repotting, again",
            "online": True,
            "interests": ["plants", "pottery", "running", "lo-fi"],
            "city": "gurugram",
        },
        "appearance": {
            "wallpaper": "cream",
            "floor": "birch",
            "lighting": "day",
            "landscape": "countryside",
        },
        "door": "forest",
        "colors": {"couch": "sage", "bed": "cream", "pendant": "forest", "desk": "woodLight"},
        "add": [
            ("mira", "desk-plant", None),
            (
                "mira",
                "poster-interests",
                {
                    "title": "Plant club",
                    "subtitle": "Growing",
                    "motif": "leaf",
                    "accent": "sage",
                    "items": ["Monstera", "Pothos (x9)", "Tulsi", "Snake plant"],
                },
            ),
            (
                "mira",
                "photo-string",
                {
                    "label": "Pottery",
                    "photos": [
                        "/static/images/demo/blocks.svg",
                        "/static/images/demo/sunset-hills.svg",
                    ],
                },
            ),
            ("mira", "armchair", None),
        ],
        "media": {"title": "A day in a greenhouse", "kind": "Documentary"},
    },
    {
        "id": "rohan",
        "name": "Rohan's room",
        "description": "Gaming den with too many lights",
        "owner": {
            "displayName": "Rohan",
            "bio": "Speedruns platformers. Streams on Fridays. Owns more RGB than furniture.",
            "status": "One more run",
            "online": False,
            "interests": ["gaming", "speedruns", "synthwave", "anime"],
            "city": "hyderabad",
        },
        "appearance": {
            "wallpaper": "midnight",
            "floor": "walnut",
            "lighting": "night",
            "landscape": "desert",
        },
        "door": "plum",
        "colors": {"couch": "charcoal", "bed": "navy", "pendant": "lilac", "desk-chair": "plum"},
        "swap": {"corner-plant": ("jun", "speaker-left")},
        "add": [
            ("jun", "neon-sign", {"text": "gg", "light": {"color": "pink", "effect": "pulse"}}),
            ("jun", "fairy-lights", {"light": {"color": "multi", "effect": "twinkle"}}),
            ("jun", "guitar", {"color": "plum"}),
        ],
        "media": {"title": "Speedrun replay: any%", "kind": "Stream"},
    },
    {
        "id": "meera",
        "name": "Meera's room",
        "description": "Rainy days, tea, and a reading nook",
        "owner": {
            "displayName": "Meera",
            "bio": "Studying in London, missing Chennai filter coffee. Reads three books at once.",
            "status": "Chapter 12, then sleep",
            "online": True,
            "interests": ["books", "tea", "rain", "carnatic music"],
            "city": "london",
        },
        "appearance": {
            "wallpaper": "cream",
            "floor": "walnut",
            "lighting": "evening",
            "landscape": "snow",
        },
        "door": "navy",
        "colors": {"couch": "forest", "bed": "lilac", "pendant": "cream", "bookcase-1": "woodDark"},
        "add": [
            (
                "mira",
                "poster-films",
                {
                    "title": "Reading now",
                    "subtitle": "Books",
                    "motif": "leaf",
                    "accent": "navy",
                    "items": [
                        "The Lighthouse Year",
                        "Monsoon Letters",
                        "A Small Kitchen in Madras",
                    ],
                },
            ),
            ("mira", "clock", None),
            ("mira", "armchair", None),
            ("jun", "fairy-lights", {"light": {"color": "candle"}}),
        ],
        "media": {"title": "Rain on a London window", "kind": "Slow TV"},
    },
]


def piece(source: str, object_id: str, custom: dict | None) -> dict:
    obj = copy.deepcopy((MIRA if source == "mira" else JUN)[object_id])
    if custom is not None:
        obj["customData"] = {**obj.get("customData", {}), **custom}
    return obj


def build(recipe: dict) -> dict:
    room = copy.deepcopy(STARTER)
    objects = {o["id"]: o for o in room["objects"]}
    for target, (source, object_id) in recipe.get("swap", {}).items():
        replacement = piece(source, object_id, None)
        replacement["id"] = target
        objects[target] = replacement
    for object_id, color in {**recipe["colors"], "door": recipe["door"]}.items():
        objects[object_id].setdefault("customData", {})["color"] = color
    objects["tv"]["customData"] = {"media": recipe["media"]}
    for source, object_id, custom in recipe["add"]:
        assert object_id not in objects, f"{recipe['id']}: {object_id} is already there"
        objects[object_id] = piece(source, object_id, custom)
    return {
        "roomId": recipe["id"],
        "name": recipe["name"],
        "description": recipe["description"],
        "owner": {"username": recipe["id"], **recipe["owner"]},
        "appearance": {"theme": "cozy", **recipe["appearance"]},
        "objects": list(objects.values()),
    }


def main() -> None:
    for recipe in ROOMS:
        path = DATA / "rooms" / f"{recipe['id']}.json"
        path.write_text(
            json.dumps(build(recipe), indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        print("wrote", path.relative_to(ROOT))


if __name__ == "__main__":
    main()
