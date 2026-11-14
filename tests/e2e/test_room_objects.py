import json
import re
from pathlib import Path

from playwright.sync_api import Page, expect

from .helpers import bring_into_view, info, open_room, point_for, wait_camera_settled

STATIC = Path(__file__).resolve().parents[2] / "static"
CATALOG = json.loads((STATIC / "data" / "catalog.json").read_text(encoding="utf-8"))
ROOMS = {
    path.stem: json.loads(path.read_text(encoding="utf-8"))
    for path in (STATIC / "data" / "rooms").glob("*.json")
}
MIRA = ROOMS["mira"]
ROOM_LIMIT = {"min": (-5.0, 0.0, -5.0), "max": (5.0, 4.0, 5.0)}
RESOURCE_ERROR = re.compile(r"Failed to load resource")
FLAT_ITEMS = {"rug", "door-mat", "door"}


def _overlap(a: dict, b: dict) -> float:
    dx = min(a["max"][0], b["max"][0]) - max(a["min"][0], b["min"][0])
    dz = min(a["max"][2], b["max"][2]) - max(a["min"][2], b["min"][2])
    return min(dx, dz)


def test_only_models_used_by_the_room_are_downloaded(page: Page, errors):
    requested = []
    page.on("request", lambda r: requested.append(r.url) if r.url.endswith(".glb") else None)

    data = open_room(page)

    downloaded = {url.rsplit("/static/models/", 1)[1] for url in requested}
    all_models = {item["model"] for item in CATALOG["items"] if "model" in item}
    assert downloaded == set(data["scene"]["assets"]["models"])
    assert all_models - downloaded, "the demo should leave some catalogue models unused"
    assert data["scene"]["objects"] == len(MIRA["objects"])
    assert errors == []


def test_every_object_sits_inside_the_room_without_overlapping(page: Page, errors):
    for room_id, room in ROOMS.items():
        open_room(page, f"/room/{room_id}?quality=low")
        bounds = page.evaluate("() => window.__doors.bounds()")

        assert set(bounds) == {obj["id"] for obj in room["objects"]}
        for object_id, box in bounds.items():
            for i in range(3):
                assert box["min"][i] >= ROOM_LIMIT["min"][i] - 0.05, (
                    f"{room_id}:{object_id} pokes out"
                )
                assert box["max"][i] <= ROOM_LIMIT["max"][i] + 0.05, (
                    f"{room_id}:{object_id} pokes out"
                )

        floor = {k: v for k, v in bounds.items() if v["min"][1] < 0.05 and k not in FLAT_ITEMS}
        ids = sorted(floor)
        for i, a in enumerate(ids):
            for b in ids[i + 1 :]:
                assert _overlap(floor[a], floor[b]) <= 0.02, f"{room_id}: {a} overlaps {b}"
    assert errors == []


def test_rooms_have_their_own_owner_and_appearance(page: Page, errors):
    mira = open_room(page)
    expect(page.get_by_test_id("room-nameplate")).to_contain_text("Mira's room")
    expect(page.get_by_test_id("room-nameplate")).to_contain_text("Online · Repotting the monstera")
    mira_pixels = page.evaluate("() => window.__doors.samplePixels()")

    jun = open_room(page, "/room/jun?quality=low")
    expect(page.get_by_test_id("room-nameplate")).to_contain_text("Jun's room")
    expect(page.get_by_test_id("room-nameplate")).to_contain_text("Offline")
    jun_pixels = page.evaluate("() => window.__doors.samplePixels()")

    assert mira["scene"]["appearance"] == {
        "theme": "cozy",
        "wallpaper": "cream",
        "floor": "oak",
        "lighting": "day",
        "landscape": "countryside",
    }
    assert jun["scene"]["appearance"]["lighting"] == "night"
    assert jun["scene"]["appearance"]["landscape"] == "city"
    assert jun["scene"]["states"]["window"]["landscape"] == "city", "the window shows the city"
    assert jun["owner"]["username"] == "jun"
    assert jun_pixels["meanBrightness"] < mira_pixels["meanBrightness"] - 25, (
        "night should be darker"
    )
    assert page.title() == "Jun's room · 1000 Doors"
    assert errors == []


def test_hover_highlights_interactive_objects(page: Page, errors):
    open_room(page)
    point = bring_into_view(page, "photo-sunset")

    page.mouse.move(point["x"], point["y"])
    page.wait_for_function("() => window.__doors.info().scene.hovered === 'photo-sunset'")
    tooltip = page.get_by_test_id("room-tooltip")
    expect(tooltip).to_have_text("Sunset over the hills · View photo")
    assert page.locator(".engine-canvas").evaluate("c => c.style.cursor") == "pointer"

    page.mouse.move(5, 5)
    page.wait_for_function("() => window.__doors.info().scene.hovered === null")
    expect(tooltip).to_be_hidden()
    assert errors == []


def test_clicking_a_photo_opens_the_viewer(page: Page, errors):
    open_room(page)
    point = bring_into_view(page, "photo-sunset")

    page.mouse.click(point["x"], point["y"])

    viewer = page.get_by_test_id("photo-viewer")
    expect(viewer).to_be_visible()
    image = viewer.locator("img")
    expect(image).to_have_attribute("src", "/static/images/demo/sunset-hills.svg")
    expect(image).to_have_attribute("alt", "Sunset over the hills")
    expect(viewer).to_contain_text("Sunset over the hills")
    assert image.evaluate("img => img.complete && img.naturalWidth > 0")

    page.keyboard.press("Escape")
    expect(viewer).to_be_hidden()

    page.mouse.click(point["x"], point["y"])
    expect(viewer).to_be_visible()
    viewer.get_by_role("button", name="Close photo").click()
    expect(viewer).to_be_hidden()
    assert errors == []


def test_dragging_across_an_object_does_not_open_it(page: Page, errors):
    open_room(page)
    point = bring_into_view(page, "photo-sunset")

    page.mouse.move(point["x"], point["y"])
    page.mouse.down()
    page.mouse.move(point["x"] + 120, point["y"] + 10, steps=8)
    page.mouse.up()
    wait_camera_settled(page)

    expect(page.get_by_test_id("photo-viewer")).to_be_hidden()
    assert info(page)["lastInteraction"] is None
    assert errors == []


def test_clicking_a_lamp_toggles_its_light(page: Page, errors):
    open_room(page)
    assert info(page)["scene"]["lamps"]["bedside-lamp"] is True

    point = bring_into_view(page, "bedside-lamp")
    page.mouse.click(point["x"], point["y"])
    page.wait_for_function("() => window.__doors.info().scene.lamps['bedside-lamp'] === false")

    point = point_for(page, "bedside-lamp")
    page.mouse.click(point["x"], point["y"])
    page.wait_for_function("() => window.__doors.info().scene.lamps['bedside-lamp'] === true")
    assert errors == []


def test_owner_only_objects_ignore_visitors(page: Page, errors):
    data = open_room(page)
    assert data["viewer"] == {"relationship": "stranger"}
    assert data["scene"]["permissions"]["floor-lamp"] == "owner"
    assert point_for(page, "floor-lamp") is None, "visitors can't use the owner's floor lamp"

    open_room(page, "/room?quality=low&as=owner")
    point = bring_into_view(page, "floor-lamp")
    page.mouse.click(point["x"], point["y"])
    page.wait_for_function("() => window.__doors.info().scene.lamps['floor-lamp'] === false")
    assert errors == []


def test_permission_rules(page: Page, errors):
    open_room(page)
    results = page.evaluate(
        """async () => {
            const { canInteract } = await import('/static/js/permissions.js');
            const levels = ['everyone', 'followers', 'friends', 'owner', 'bogus', undefined];
            const people = ['stranger', 'follower', 'friend', 'owner', 'hacker'];
            return Object.fromEntries(levels.map((level) => [
                String(level), people.filter((who) => canInteract(level, who)),
            ]));
        }"""
    )
    assert results == {
        "everyone": ["stranger", "follower", "friend", "owner", "hacker"],
        "followers": ["follower", "friend", "owner"],
        "friends": ["friend", "owner"],
        "owner": ["owner"],
        "bogus": ["owner"],
        "undefined": ["owner"],
    }
    assert errors == []


def test_noticeboard_shows_seeded_notes(page: Page, errors):
    open_room(page)
    point = bring_into_view(page, "noticeboard")

    page.mouse.click(point["x"], point["y"])

    panel = page.get_by_test_id("room-panel")
    expect(panel).to_be_visible()
    expect(panel.locator(".note")).to_have_count(3)
    expect(panel).to_contain_text("Teach me your ways")
    expect(panel).to_contain_text("— Jun")
    page.keyboard.press("Escape")
    expect(panel).to_be_hidden()
    assert errors == []


def test_failed_model_shows_placeholder_without_breaking_room(page: Page, errors):
    page.route("**/bed-double.glb", lambda route: route.fulfill(status=404, body="missing"))

    data = open_room(page)

    assert data["scene"]["failed"] == ["bed"]
    assert data["scene"]["assets"]["failed"] == ["furniture/bed-double.glb"]
    assert data["scene"]["objects"] == len(MIRA["objects"])
    assert page.evaluate("() => window.__doors.bounds().bed.max[1]") > 0.4
    assert all(RESOURCE_ERROR.search(e) for e in errors), errors


def test_missing_catalogue_shows_error_panel(page: Page, errors):
    page.route("**/catalog.json", lambda route: route.fulfill(status=500, body="boom"))

    page.goto("/room?quality=low")
    page.wait_for_function("() => window.__doors?.state === 'error'")

    expect(page.get_by_test_id("room-error")).to_be_visible()
    expect(page.get_by_test_id("room-loading")).to_be_hidden()
    assert errors, "the failure should be reported in the console"

    page.unroute("**/catalog.json")
    page.get_by_role("button", name="Try again").click()
    page.wait_for_function("() => window.__doors.state === 'ready'")
    expect(page.get_by_test_id("room-error")).to_be_hidden()


def test_interactions_survive_remount(page: Page, errors):
    open_room(page)
    page.evaluate("() => window.__doors.remount()")
    page.wait_for_function("() => window.__doors.state === 'ready'")

    point = bring_into_view(page, "photo-moonrise")
    page.mouse.click(point["x"], point["y"])

    expect(page.get_by_test_id("photo-viewer")).to_contain_text("Moonrise")
    assert errors == []
