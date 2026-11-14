import json
import re
from pathlib import Path

from playwright.sync_api import Page, expect

from .helpers import bring_into_view, info, open_room, point_for, wait_camera_settled

STATIC = Path(__file__).resolve().parents[2] / "static"
DEMO_ROOM = json.loads((STATIC / "data" / "demo-room.json").read_text(encoding="utf-8"))
ROOM_LIMIT = {"min": (-5.0, 0.0, -5.0), "max": (5.0, 4.0, 5.0)}
RESOURCE_ERROR = re.compile(r"Failed to load resource")


def test_only_models_used_by_the_room_are_downloaded(page: Page, errors):
    requested = []
    page.on("request", lambda r: requested.append(r.url) if r.url.endswith(".glb") else None)

    data = open_room(page)

    downloaded = {url.rsplit("/static/models/", 1)[1] for url in requested}
    assert downloaded == set(data["scene"]["assets"]["models"])
    assert "furniture/television-modern.glb" not in downloaded
    assert data["scene"]["objects"] == len(DEMO_ROOM["objects"])
    assert errors == []


def test_every_object_sits_inside_the_room(page: Page, errors):
    open_room(page)
    bounds = page.evaluate("() => window.__doors.bounds()")

    assert set(bounds) == {obj["id"] for obj in DEMO_ROOM["objects"]}
    for object_id, box in bounds.items():
        for i in range(3):
            assert box["min"][i] >= ROOM_LIMIT["min"][i] - 0.05, (
                f"{object_id} pokes out of the room"
            )
            assert box["max"][i] <= ROOM_LIMIT["max"][i] + 0.05, (
                f"{object_id} pokes out of the room"
            )
    assert errors == []


def test_hover_highlights_interactive_objects(page: Page, errors):
    open_room(page)
    point = point_for(page, "photo-sunset")
    assert point, "photo should be visible from the starting view"

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
    point = point_for(page, "photo-sunset")

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
    point = point_for(page, "photo-sunset")

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

    point = point_for(page, "bedside-lamp")
    page.mouse.click(point["x"], point["y"])
    page.wait_for_function("() => window.__doors.info().scene.lamps['bedside-lamp'] === false")

    point = point_for(page, "bedside-lamp")
    page.mouse.click(point["x"], point["y"])
    page.wait_for_function("() => window.__doors.info().scene.lamps['bedside-lamp'] === true")
    assert errors == []


def test_guestbook_shows_entries(page: Page, errors):
    open_room(page)
    point = bring_into_view(page, "guestbook")

    page.mouse.click(point["x"], point["y"])

    panel = page.get_by_test_id("guestbook-panel")
    expect(panel).to_be_visible()
    expect(panel.locator(".guestbook-entry")).to_have_count(3)
    expect(panel).to_contain_text("Teach me your ways")
    expect(panel).to_contain_text("— Mira")
    page.keyboard.press("Escape")
    expect(panel).to_be_hidden()
    assert errors == []


def test_failed_model_shows_placeholder_without_breaking_room(page: Page, errors):
    page.route("**/bed-double.glb", lambda route: route.fulfill(status=404, body="missing"))

    data = open_room(page)

    assert data["scene"]["failed"] == ["bed"]
    assert data["scene"]["assets"]["failed"] == ["furniture/bed-double.glb"]
    assert data["scene"]["objects"] == len(DEMO_ROOM["objects"])
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

    point = point_for(page, "photo-moonrise")
    page.mouse.click(point["x"], point["y"])

    expect(page.get_by_test_id("photo-viewer")).to_contain_text("Moonrise")
    assert errors == []
