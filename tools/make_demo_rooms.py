"""Writes the extra demo rooms in static/data/rooms/ from the starter room.

Run once (python tools/make_demo_rooms.py) after changing the recipes below, then
`flask --app app db seed` to update a live database. Every room starts from
static/data/templates/starter.json, whose layout is known to fit, then recolours it,
swaps pieces for others of the same size, borrows pieces from Mira's and Jun's rooms,
and places new ones at spots that are free in the starter room:

- floor: the left wall's front half (x < -2.8, z > 0.7), the right wall's middle
  (x > 3, -1.1 < z < 3.9), under the window (-0.3 < x < 2.7, z < -4.3)
- surfaces: the desk (top 0.77, x -1.0 to -0.5 is free), the nightstand (0.77, z -1.7),
  the coffee table (0.46), the shelves of a bookcase (0.26, 0.74, 1.22, top 1.76)

The people's photos are original illustrations from tools/make_demo_art.py, and every
song and video is a real, public YouTube or Spotify page (checked with their oEmbed APIs).
"""

import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "static" / "data"
PEOPLE = "/static/images/demo/people"

STARTER = json.loads((DATA / "templates" / "starter.json").read_text(encoding="utf-8"))
MIRA = {
    o["id"]: o for o in json.loads((DATA / "rooms" / "mira.json").read_text("utf-8"))["objects"]
}
JUN = {o["id"]: o for o in json.loads((DATA / "rooms" / "jun.json").read_text("utf-8"))["objects"]}

QUARTER = 1.5708
# Wall name -> (fixed coordinate, its value, rotation facing into the room)
WALLS = {
    "left": ("x", -4.97, QUARTER),
    "right": ("x", 4.97, -QUARTER),
    "back": ("z", -4.97, 0.0),
    "front": ("z", 4.97, 3.1416),
}


def place(object_id, catalog_id, x, y, z, turn=0.0, custom=None, scale=1.0):
    obj = {
        "id": object_id,
        "catalogId": catalog_id,
        "position": {"x": x, "y": y, "z": z},
        "rotation": {"x": 0, "y": turn, "z": 0},
        "scale": {"x": scale, "y": scale, "z": scale},
    }
    if custom:
        obj["customData"] = custom
    return obj


def on_wall(object_id, catalog_id, wall, along, y, custom=None):
    """A wall piece; `along` is z on the side walls and x on the back and front walls."""
    axis, value, turn = WALLS[wall]
    x, z = (value, along) if axis == "x" else (along, value)
    return place(object_id, catalog_id, x, y, z, turn, custom)


def photo(object_id, wall, along, y, image, caption, width=1.0, height=0.75, **extra):
    custom = {"width": width, "height": height, "imageUrl": f"{PEOPLE}/{image}.svg"}
    custom = {**custom, "caption": caption, **extra}
    return on_wall(object_id, "picture-frame", wall, along, y, custom)


def photos(object_id, wall, along, label, images, y=2.55):
    custom = {"label": label, "photos": [f"{PEOPLE}/{name}.svg" for name in images]}
    return on_wall(object_id, "photo-string", wall, along, y, custom)


def shelf(object_id, z, title, items, books=(0.26, 1.22)):
    """An open bookcase against the left wall, its collection, and books on two shelves."""
    case = place(object_id, "bookcase-open", -4.72, 0, z, QUARTER, {"title": title, "items": items})
    return [case] + [
        place(f"{object_id}-books-{i}", "books", -4.74, y, z + (0.2 if i % 2 else -0.2), QUARTER)
        for i, y in enumerate(books)
    ]


def youtube(video_id):
    return {"provider": "youtube", "kind": "video", "id": video_id}


def spotify(kind, item_id):
    return {"provider": "spotify", "kind": kind, "id": item_id}


def item(kind, title, by=None):
    return {"type": kind, "title": title, **({"by": by} if by else {})}


def notes(*entries):
    return [{"author": author, "message": message} for author, message in entries]


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
        "portrait": ("aarav", "Me, mid-appeal for LBW"),
        "song": spotify("playlist", "37i9dQZF1DWZeKCadgRdKQ"),
        "video": youtube("lTRiuFIWV54"),
        "media": {
            "title": "1 A.M Study Session",
            "kind": "Lo-fi",
            "description": "On loop whenever there's a deadline.",
        },
        "shelf": {
            "title": "Desk reads",
            "items": [
                item("book", "The Patient Debugger", "K. Rao"),
                item("book", "Leg-spin, Explained", "a very old coach"),
                item("game", "Pocket Cricket", "phone game"),
            ],
        },
        "notes": notes(
            ("Rohan", "Your code compiled first try? Suspicious."),
            ("Priya", "Drew you bowling. It's on my string lights now."),
            ("Meera", "Save me a filter coffee for December."),
        ),
        "gifts": [{"author": "Kabir", "gift": "tea"}, {"author": "Ananya", "gift": "flower"}],
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
        "place": [
            photo("photo-cricket", "left", 1.5, 2.3, "aarav-cricket", "Sunday nets, Cubbon Park"),
            photo(
                "photo-coffee",
                "left",
                -1.65,
                2.45,
                "aarav-coffee",
                "Filter coffee, strong",
                width=0.6,
                height=0.45,
            ),
            photo("photo-code", "back", 3.55, 2.45, "aarav-code", "Friday deploy (it worked)"),
            photos(
                "photo-string",
                "right",
                2.8,
                "Hackathon weekend",
                ["aarav-code", "aarav-cricket", "aarav-coffee", "aarav"],
            ),
            *shelf(
                "cricket-shelf",
                2.6,
                "Cricket corner",
                [
                    item("collectible", "Signed tennis ball", "first five-wicket haul"),
                    item("collectible", "Scorebook, 2019 season"),
                    item("book", "Notes on the googly", "my handwriting"),
                ],
            ),
            place("globe", "globe", -4.72, 1.76, 2.6, QUARTER, {"color": "teal"}),
            place("bean-bag", "bean-bag", 4.1, 0, 2.6, -2.4, {"color": "teal"}),
            place("reading-lamp", "lamp-round-floor", 4.6, 0, 0.2),
            place("window-plant", "potted-plant", 0.1, 0, -4.5),
            place("headphones", "headphones", -0.75, 0.77, -4.6, 0.3, {"color": "charcoal"}),
            place("coffee-machine", "kitchen-coffee-machine", 2.2, 0.46, -0.1),
            place("table-books", "books", 1.45, 0.46, -0.1, 0.4),
            place("ceiling-fan", "ceiling-fan", 2.8, 4, 2.4),
        ],
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
        "portrait": ("priya", "Self-portrait, in pencil"),
        "song": youtube("BddP6PYo2gs"),
        "video": youtube("gvyUuxdRdR4"),
        "media": {
            "title": "Raataan Lambiyan",
            "kind": "Music video",
            "description": "Sketching to this on repeat.",
        },
        "shelf": {
            "title": "Art supplies",
            "items": [
                item("collectible", "Brush pens (27 of them)"),
                item("collectible", "Jar of sea glass", "Juhu, low tide"),
                item("collectible", "Local train ticket stubs"),
                item("book", "Faces on the 8:14", "my sketchbook"),
            ],
        },
        "notes": notes(
            ("Aarav", "That sea face drawing belongs in a gallery."),
            ("Meera", "Miss the Mumbai rain. Send me a sketch of it?"),
            ("Kabir", "Vada pav on me next time."),
        ),
        "gifts": [{"author": "Aarav", "gift": "cookie"}, {"author": "Meera", "gift": "flower"}],
        "add": [
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
        "place": [
            photos(
                "photo-string",
                "right",
                3.0,
                "Sea face diaries",
                ["priya-seaface", "priya-monsoon", "priya-sketchbook", "priya"],
            ),
            photo(
                "photo-seaface",
                "left",
                1.5,
                2.3,
                "priya-seaface",
                "Marine Drive at dusk",
                width=1.1,
                height=0.82,
            ),
            photo("photo-monsoon", "back", 3.55, 2.45, "priya-monsoon", "First rain of June"),
            photo(
                "photo-sketch",
                "back",
                -3.4,
                2.3,
                "priya-sketchbook",
                "Sketchbook, page 40",
                width=0.8,
                height=0.6,
            ),
            on_wall(
                "neon-draw",
                "neon-sign",
                "front",
                2.8,
                2.7,
                {"text": "draw daily", "light": {"color": "pink", "effect": "pulse"}},
            ),
            place("easel", "easel", 4.1, 0, 2.6, -2.2, {"color": "woodLight"}),
            place("bean-bag", "bean-bag", 4.2, 0, -0.3, -2.0, {"color": "coral"}),
            place("lounge-chair", "lounge-design-chair", -3.9, 0, 2.7, 1.97, {"color": "sage"}),
            place("front-plant", "potted-plant", -4.5, 0, 4.4),
            place("candles", "candles", -4.75, 0.77, -1.65),
            place("lava-lamp", "lava-lamp", -0.75, 0.77, -4.65, 0, {"light": {"color": "pink"}}),
            place("table-books", "books", 1.45, 0.46, -0.1, 0.2),
            place("table-plant", "plant-small-3", 2.2, 0.46, -0.1),
            place("lantern", "paper-lantern", -2.0, 4, 2.5),
            place("hanging-plant", "hanging-plant", 3.6, 4, 3.6),
            place("hanging-plant-2", "hanging-plant", -4.2, 4, -3.8),
        ],
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
        "portrait": ("kabir", "Sunday at the record market"),
        "song": youtube("T94PHkuydcw"),
        "video": youtube("Yc5OyXmHD0w"),
        "media": {
            "title": "Jai Ho",
            "kind": "Music video",
            "description": "Played at every family wedding since 2009.",
        },
        "shelf": {
            "title": "Film shelf",
            "items": [
                item("book", "Posters of the Sixties", "a market find"),
                item("book", "The Projectionist's Notebook"),
                item("collectible", "Cinema ticket stub, 1998", "first film alone"),
            ],
        },
        "notes": notes(
            ("Priya", "Your record collection is unreal."),
            ("Rohan", "Still have your headphones. Back by Diwali, promise."),
            ("Aarav", "Best chai in Delhi, confirmed."),
        ),
        "gifts": [{"author": "Priya", "gift": "tea"}, {"author": "Meera", "gift": "star"}],
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
            ("jun", "fairy-lights", {"light": {"color": "candle", "effect": "flicker"}}),
        ],
        "place": [
            photo(
                "photo-olddelhi",
                "left",
                1.5,
                2.3,
                "kabir-olddelhi",
                "Rooftop kites, Old Delhi",
                width=1.1,
                height=0.82,
            ),
            photo("photo-chai", "back", 3.55, 2.45, "kabir-chai", "Chai at 4 pm, always"),
            photo(
                "photo-vinyl",
                "back",
                -3.4,
                2.3,
                "kabir-vinyl",
                "Found it! A 1972 pressing",
                width=0.8,
                height=0.6,
            ),
            photos(
                "photo-string",
                "right",
                3.0,
                "Purani Dilli walks",
                ["kabir-chai", "kabir-olddelhi", "kabir-vinyl", "kabir"],
            ),
            on_wall(
                "neon-chai",
                "neon-sign",
                "front",
                2.8,
                2.7,
                {"text": "chai?", "light": {"color": "warm"}},
            ),
            *shelf(
                "record-shelf",
                2.6,
                "Record crate",
                [
                    item("record", "Monsoon Melodies", "1971 soundtrack"),
                    item("record", "Night in Old Delhi", "qawwali, live"),
                    item("record", "Chai & Trumpets", "brass band"),
                    item("record", "Songs for a Slow Train"),
                ],
            ),
            place("crate-top", "vinyl-crate", -4.72, 1.76, 2.6, QUARTER, {"color": "mustard"}),
            place("relax-chair", "lounge-chair-relax", 4.0, 0, 2.6, -2.2, {"color": "mustard"}),
            place("reading-lamp", "lamp-round-floor", 4.6, 0, 0.6),
            place("record-table", "side-table", 1.2, 0, -4.7),
            place("radio", "radio", 0.95, 0.77, -4.7),
            place("table-crate", "vinyl-crate", 1.5, 0.77, -4.7, 0, {"color": "terracotta"}),
            place("candles", "candles", 2.2, 0.46, -0.1),
            place("table-books", "books", 1.45, 0.46, -0.1, -0.3),
            place("ceiling-fan", "ceiling-fan", 2.2, 4, 2.4),
        ],
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
        "portrait": ("ananya", "Me and 31 cuttings"),
        "song": spotify("playlist", "37i9dQZF1DWWQRwui0ExPn"),
        "video": youtube("xNN7iTA57jM"),
        "media": {
            "title": "Forest Sounds",
            "kind": "Ambience",
            "description": "Birdsong for the plants. They like it, probably.",
        },
        "shelf": {
            "title": "Plant library",
            "items": [
                item("book", "The Patient Gardener"),
                item("book", "Soil, Simply"),
                item("collectible", "Propagation jar No. 1", "a pothos lives here"),
            ],
        },
        "notes": notes(
            ("Mira", "Plant swap soon? I have a pothos with your name on it."),
            ("Jun", "Your room smells like rain. How?"),
            ("Kabir", "Kept your cutting alive. Three weeks!"),
        ),
        "gifts": [{"author": "Mira", "gift": "flower"}, {"author": "Aarav", "gift": "flower"}],
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
            ("mira", "armchair", None),
            ("jun", "fairy-lights", {"light": {"color": "green", "effect": "twinkle"}}),
        ],
        "place": [
            photos(
                "photo-string",
                "right",
                3.0,
                "Pottery and plants",
                ["ananya-pottery", "ananya-monstera", "ananya-run", "ananya"],
            ),
            photo(
                "photo-monstera",
                "left",
                1.5,
                2.3,
                "ananya-monstera",
                "The monstera's new leaf!",
                width=0.9,
                height=0.68,
            ),
            photo("photo-run", "back", 3.55, 2.45, "ananya-run", "Sunrise 10k"),
            photo(
                "photo-pottery",
                "back",
                -3.4,
                2.3,
                "ananya-pottery",
                "Wheel-thrown, slightly wonky",
                width=0.8,
                height=0.6,
            ),
            *shelf(
                "pottery-shelf",
                2.6,
                "Pottery shelf",
                [
                    item("collectible", "Terracotta pot", "my first that didn't crack"),
                    item("collectible", "Celadon vase"),
                    item("collectible", "Blue bowl", "for the tulsi"),
                ],
                books=(0.26,),
            ),
            place("shelf-plant", "plant-small-1", -4.74, 1.22, 2.6),
            place("shelf-plant-top", "plant-small-2", -4.74, 1.76, 2.6),
            place("plant-left-1", "potted-plant", -4.6, 0, 1.45),
            place("plant-left-2", "potted-plant", -4.6, 0, 3.7, 0, None, 1.15),
            place("plant-right-1", "potted-plant", 4.6, 0, 0.3),
            place("plant-right-2", "potted-plant", 4.6, 0, 1.9, 0, None, 1.2),
            place("plant-window", "potted-plant", 0.1, 0, -4.5),
            place("plant-front", "potted-plant", 3.2, 0, 4.5),
            place("yoga-mat", "yoga-mat", 3.6, 0, 2.6, 0, {"color": "sage"}),
            place("cactus", "cactus", -4.75, 0.77, -1.65),
            place("table-plant", "plant-small-3", 1.45, 0.46, -0.1),
            place("table-plant-2", "plant-small-2", 2.2, 0.46, -0.1),
            place("hanging-plant", "hanging-plant", -2.2, 4, 2.4),
            place("hanging-plant-2", "hanging-plant", 2.8, 4, 2.8),
            place("hanging-plant-3", "hanging-plant", -3.6, 4, -3.6),
        ],
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
        "portrait": ("rohan", "Me, after a record attempt (it wasn't)"),
        "song": youtube("4xDzrJKXOOY"),
        "video": youtube("60ItHLz5WEA"),
        "media": {
            "title": "Faded",
            "kind": "Music video",
            "description": "The warm-up song before every stream.",
        },
        "shelf": {
            "title": "Game shelf",
            "items": [
                item("game", "Pixel Knight DX", "any% 41:07"),
                item("game", "Turbo Kart Rumble"),
                item("game", "Neon Drift", "co-op"),
                item("collectible", "Bronze speedrun medal"),
            ],
        },
        "notes": notes(
            ("Aarav", "Beat your PB. Kidding. Nobody can."),
            ("Jun", "Synthwave night at mine on Friday?"),
            ("Ananya", "Too much RGB. Needs a plant."),
        ),
        "gifts": [{"author": "Jun", "gift": "star"}, {"author": "Ananya", "gift": "cookie"}],
        "swap": {"corner-plant": ("jun", "speaker-left")},
        "add": [
            ("jun", "neon-sign", {"text": "gg", "light": {"color": "pink", "effect": "pulse"}}),
            ("jun", "fairy-lights", {"light": {"color": "multi", "effect": "twinkle"}}),
            ("jun", "guitar", {"color": "plum"}),
            (
                "jun",
                "poster-records",
                {
                    "title": "Personal bests",
                    "subtitle": "Speedruns",
                    "motif": "film",
                    "accent": "navy",
                    "items": ["Pixel Knight 41:07", "Turbo Kart 12:58", "Neon Drift 1:02:11"],
                },
            ),
            (
                "mira",
                "chest",
                {
                    "secret": {
                        "title": "Route notes",
                        "message": "Friends only. The skips I haven't shown on stream yet.",
                        "items": ["Wall clip in world 3", "Boss skip (needs frame-perfect jump)"],
                    }
                },
            ),
        ],
        "place": [
            photo(
                "photo-synth",
                "left",
                1.0,
                2.3,
                "rohan-synthsun",
                "Stream overlay, v3",
                width=0.9,
                height=0.68,
            ),
            photo("photo-controller", "back", 3.55, 2.45, "rohan-controller", "The lucky pad"),
            photo(
                "photo-pixel",
                "back",
                -3.4,
                2.3,
                "rohan-pixel",
                "My first pixel art",
                width=0.8,
                height=0.6,
            ),
            photos(
                "photo-string",
                "right",
                3.0,
                "LAN party",
                ["rohan-controller", "rohan-synthsun", "rohan-pixel", "rohan"],
                y=2.75,
            ),
            on_wall(
                "led-strip",
                "led-strip",
                "back",
                1.2,
                3.5,
                {"light": {"color": "blue", "effect": "pulse"}},
            ),
            on_wall(
                "neon-run",
                "neon-sign",
                "front",
                2.8,
                2.7,
                {"text": "one more run", "light": {"color": "teal"}},
            ),
            place("arcade", "arcade", 4.45, 0, 2.4, -QUARTER, {"color": "plum"}),
            place("arcade-2", "arcade", 4.45, 0, 3.4, -QUARTER, {"color": "teal"}),
            place("amp", "amp", 1.5, 0, -4.75),
            place("bean-bag", "bean-bag", 3.6, 0, 0.0, -2.2, {"color": "plum"}),
            place("bean-bag-2", "bean-bag", -1.9, 0, 2.6, 2.6, {"color": "teal"}),
            place("console", "game-console", 1.5, 0.46, -0.1, 0, {"color": "charcoal"}),
            place("headphones", "headphones", -0.75, 0.77, -4.6, 0.3, {"color": "plum"}),
            place("lava-lamp", "lava-lamp", -4.75, 0.77, -1.65, 0, {"light": {"color": "purple"}}),
        ],
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
        "portrait": ("meera", "Me, in the good cardigan"),
        "song": spotify("playlist", "37i9dQZF1DX4sWSpwq3LiO"),
        "video": youtube("mPZkdNFkNps"),
        "media": {
            "title": "Rain on a window",
            "kind": "Ambience",
            "description": "For when London isn't raining enough.",
        },
        "shelf": {
            "title": "Carnatic corner",
            "items": [
                item("record", "Morning raga practice", "Amma's tapes"),
                item("record", "Violin, slow and sweet"),
                item("book", "Ragas for Beginners"),
            ],
        },
        "notes": notes(
            ("Priya", "Rain twins! Mumbai says hi."),
            ("Kabir", "Recommend me a book. Short ones only."),
            ("Ananya", "Your tea collection beats my plant collection? Never."),
        ),
        "gifts": [{"author": "Kabir", "gift": "tea"}, {"author": "Priya", "gift": "flower"}],
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
        "place": [
            photo(
                "photo-rain",
                "left",
                1.0,
                2.3,
                "meera-londonrain",
                "The view from my window, most days",
                width=0.9,
                height=0.68,
            ),
            photo("photo-kolam", "back", 3.55, 2.45, "meera-kolam", "Amma's kolam, from a photo"),
            photo(
                "photo-books",
                "back",
                -3.4,
                2.3,
                "meera-books",
                "The current stack",
                width=0.8,
                height=0.6,
            ),
            photos(
                "photo-string",
                "right",
                3.0,
                "Home, Chennai",
                ["meera-kolam", "meera-books", "meera-londonrain", "meera"],
                y=2.75,
            ),
            *shelf(
                "book-shelf",
                2.0,
                "Reading now",
                [
                    item("book", "The Lighthouse Year", "half done"),
                    item("book", "Monsoon Letters", "a re-read"),
                    item("book", "A Small Kitchen in Madras", "for when I'm homesick"),
                ],
            ),
            *shelf(
                "tea-shelf",
                2.85,
                "Tea tins",
                [
                    item("collectible", "Nilgiri, from home"),
                    item("collectible", "Earl Grey, the London one"),
                    item("collectible", "Masala chai mix", "Amma's recipe"),
                ],
                books=(0.74,),
            ),
            place("relax-chair", "lounge-chair-relax", 4.0, 0, 2.6, -2.2, {"color": "navy"}),
            place("reading-lamp", "lamp-round-floor", 4.6, 0, 1.2),
            place("violin", "violin", 1.6, 0.46, -0.1, 0.5),
            place("candles", "candles", 2.3, 0.46, -0.1),
            place("desk-plant", "plant-small-2", -0.7, 0.77, -4.65),
            place("bedside-books", "books", -4.75, 0.77, -1.65, QUARTER),
            place("lantern", "paper-lantern", 3.6, 4, 2.6),
        ],
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

    image, caption = recipe["portrait"]
    objects["photo-sunset"]["customData"] = {
        "width": 0.8,
        "height": 1.0,
        "imageUrl": f"{PEOPLE}/{image}.svg",
        "caption": caption,
    }
    objects["tv"]["customData"] = {"media": recipe["media"], "video": recipe["video"]}
    objects["record-player"]["customData"]["song"] = recipe["song"]
    objects["bookcase-1"]["customData"] = {**objects["bookcase-1"]["customData"], **recipe["shelf"]}
    objects["noticeboard"]["customData"] = {"entries": recipe["notes"]}
    objects["gift-table"]["customData"] = {"gifts": recipe["gifts"]}

    for source, object_id, custom in recipe["add"]:
        assert object_id not in objects, f"{recipe['id']}: {object_id} is already there"
        objects[object_id] = piece(source, object_id, custom)
    for obj in recipe["place"]:
        assert obj["id"] not in objects, f"{recipe['id']}: {obj['id']} is already there"
        objects[obj["id"]] = obj
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
