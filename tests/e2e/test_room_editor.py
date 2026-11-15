import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import Browser, Page, expect

from .conftest import SLOW_FRAMES_SCRIPT, collect_errors
from .helpers import (
    Touch,
    angle_delta,
    axe_violations,
    info,
    open_room,
    point_for,
    wait_camera_settled,
)

STATIC = Path(__file__).resolve().parents[2] / "static"
MIRA = json.loads((STATIC / "data" / "rooms" / "mira.json").read_text(encoding="utf-8"))
OWNER = "/room?quality=low&as=owner"
FLAT = {"rug", "door-mat"}
STEP = math.pi / 4
COUCH_START = next(o for o in MIRA["objects"] if o["id"] == "couch")["position"]


def editor(page: Page) -> dict:
    return info(page)["scene"]["editor"]


def layout(page: Page) -> dict:
    return page.evaluate("() => window.__doors.layout()")


def obj(page: Page, object_id: str) -> dict | None:
    return next((o for o in layout(page)["objects"] if o["id"] == object_id), None)


def enter_edit(page: Page, path: str = OWNER) -> None:
    open_room(page, path)
    page.get_by_test_id("edit-room").click()
    expect(page.get_by_test_id("editor")).to_be_visible()
    wait_camera_settled(page)


def select(page: Page, object_id: str) -> None:
    assert page.evaluate("(id) => window.__doors.editorSelect(id)", object_id), object_id


def click_floor(page: Page, x: float, z: float) -> None:
    click_world(page, x, 0, z)


def click_world(page: Page, x: float, y: float, z: float) -> None:
    point = page.evaluate("([x, y, z]) => window.__doors.worldPoint(x, y, z)", [x, y, z])
    box = page.locator(".engine-canvas").bounding_box()
    on_canvas = point and box["x"] < point["x"] < box["x"] + box["width"]
    assert on_canvas and box["y"] < point["y"] < box["y"] + box["height"], (
        f"{x},{y},{z} is off screen"
    )
    page.mouse.click(point["x"], point["y"])


def bounds(page: Page, object_id: str) -> dict:
    return page.evaluate("(id) => window.__doors.bounds()[id]", object_id)


def add(page: Page, name: str) -> str:
    """Adds a catalogue item by name and returns the pending object's id."""
    page.get_by_role("tab", name="Add").click()
    page.get_by_test_id("editor-search").fill(name)
    page.get_by_role("button", name=name, exact=True).click()
    page.wait_for_function("() => window.__doors.info().scene.editor.pending")
    return editor(page)["pending"]


def floor_overlaps(page: Page) -> list[tuple[str, str]]:
    bounds = page.evaluate("() => window.__doors.bounds()")
    floor = {k: v for k, v in bounds.items() if v["min"][1] < 0.05 and k not in FLAT}
    ids = sorted(floor)
    clashes = []
    for i, a in enumerate(ids):
        for b in ids[i + 1 :]:
            dx = min(floor[a]["max"][0], floor[b]["max"][0]) - max(
                floor[a]["min"][0], floor[b]["min"][0]
            )
            dz = min(floor[a]["max"][2], floor[b]["max"][2]) - max(
                floor[a]["min"][2], floor[b]["min"][2]
            )
            if min(dx, dz) > 0.03:
                clashes.append((a, b))
    return clashes


def angle(a: float, b: float) -> float:
    return math.atan2(math.sin(a - b), math.cos(a - b))


def test_only_the_owner_can_edit(page: Page, errors):
    open_room(page)
    expect(page.get_by_test_id("edit-room")).to_be_hidden()
    assert page.evaluate("() => window.__doors.enterEdit()") is False

    open_room(page, "/room?quality=low&as=friend")
    expect(page.get_by_test_id("edit-room")).to_be_hidden()

    open_room(page, OWNER)
    expect(page.get_by_test_id("edit-room")).to_be_visible()
    assert errors == []


def test_serialized_layout_matches_the_room_data(page: Page, errors):
    open_room(page, OWNER)
    saved = {o["id"]: o for o in layout(page)["objects"]}

    assert [o["id"] for o in layout(page)["objects"]] == [o["id"] for o in MIRA["objects"]]
    for original in MIRA["objects"]:
        current = saved[original["id"]]
        assert current["catalogId"] == original["catalogId"]
        for key in ("position", "rotation", "scale"):
            for axis in "xyz":
                assert current[key][axis] == pytest.approx(original[key][axis], abs=1e-3)
        assert current.get("customData", {}) == original.get("customData", {})
        assert current.get("permissions") == original.get("permissions")
    assert layout(page)["appearance"] == MIRA["appearance"]
    assert errors == []


def test_edit_mode_pauses_interactions(page: Page, errors):
    enter_edit(page)

    expect(page.get_by_test_id("back-link")).to_be_hidden()
    assert editor(page)["active"] is True
    assert info(page)["scene"]["camera"]["polar"] < 1.0, "edit mode looks down on the room"
    assert point_for(page, "photo-sunset") is None, "photos can't be moved in edit mode"

    point = point_for(page, "desk")
    page.mouse.click(point["x"], point["y"])

    expect(page.get_by_test_id("editor-selection")).to_contain_text("Desk")
    expect(page.get_by_test_id("room-panel")).to_be_hidden()
    assert info(page)["lastInteraction"] is None
    assert errors == []


def test_add_an_item_and_place_it(page: Page, errors):
    enter_edit(page)
    count = info(page)["scene"]["objects"]

    page.get_by_role("button", name="Armchair", exact=True).click()
    page.wait_for_function("() => window.__doors.info().scene.editor.pending === 'lounge-chair-1'")
    assert info(page)["scene"]["objects"] == count + 1
    expect(page.get_by_test_id("editor-status")).to_contain_text("place the armchair")

    click_floor(page, 0.5, -2.5)

    state = editor(page)
    assert state["pending"] is None
    assert state["selected"]["id"] == "lounge-chair-1"
    placed = obj(page, "lounge-chair-1")
    assert placed["position"]["x"] == pytest.approx(0.5, abs=0.26)
    assert placed["position"]["z"] == pytest.approx(-2.5, abs=0.26)
    assert floor_overlaps(page) == []
    assert errors == []


def test_items_cannot_be_placed_on_top_of_others(page: Page, errors):
    enter_edit(page)
    count = info(page)["scene"]["objects"]
    page.get_by_role("button", name="Coffee table", exact=True).click()
    page.wait_for_function("() => window.__doors.info().scene.editor.pending")

    click_floor(page, 1.8, -0.1)

    state = editor(page)
    assert state["pending"] == "table-coffee-1", "still waiting for a valid spot"
    assert state["valid"] is False
    expect(page.get_by_test_id("editor-status")).to_contain_text("doesn't fit")

    page.keyboard.press("Escape")
    page.wait_for_function("() => window.__doors.info().scene.editor.pending === null")
    assert info(page)["scene"]["objects"] == count
    assert errors == []


def test_dragging_snaps_to_the_grid_and_stays_inside(page: Page, errors):
    enter_edit(page)
    point = point_for(page, "couch")
    assert point

    page.mouse.move(point["x"], point["y"])
    page.mouse.down()
    page.mouse.move(point["x"] - 60, point["y"] + 40, steps=6)
    page.mouse.up()
    moved = obj(page, "couch")["position"]
    assert (moved["x"], moved["z"]) != (1.8, 1.0)
    assert moved["x"] % 0.25 == pytest.approx(0, abs=1e-6) or moved["x"] % 0.25 == pytest.approx(
        0.25
    )
    assert moved["z"] % 0.25 == pytest.approx(0, abs=1e-6) or moved["z"] % 0.25 == pytest.approx(
        0.25
    )

    point = point_for(page, "couch")
    page.mouse.move(point["x"], point["y"])
    page.mouse.down()
    page.mouse.move(point["x"] + 2000, point["y"] + 1500, steps=12)
    page.mouse.up()

    box = page.evaluate("() => window.__doors.bounds().couch")
    assert box["max"][0] <= 5.0 and box["max"][2] <= 5.0
    assert box["min"][0] >= -5.0 and box["min"][2] >= -5.0
    assert floor_overlaps(page) == []
    assert info(page)["scene"]["camera"]["polar"] < 1.0, (
        "dragging furniture doesn't spin the camera"
    )
    assert errors == []


def test_furniture_carries_what_stands_on_it(page: Page, errors):
    enter_edit(page)
    select(page, "nightstand")
    assert editor(page)["selected"]["children"] == ["bedside-lamp"]
    lamp = obj(page, "bedside-lamp")["position"]
    stand = obj(page, "nightstand")["position"]

    page.keyboard.press("ArrowUp")

    moved_stand = obj(page, "nightstand")["position"]
    moved_lamp = obj(page, "bedside-lamp")["position"]
    dz = moved_stand["z"] - stand["z"]
    assert dz < 0
    assert moved_lamp["z"] - lamp["z"] == pytest.approx(dz, abs=1e-3)
    assert moved_lamp["x"] - lamp["x"] == pytest.approx(moved_stand["x"] - stand["x"], abs=1e-3)

    page.get_by_role("button", name="Remove").click()
    assert obj(page, "nightstand") is None
    assert obj(page, "bedside-lamp") is None
    expect(page.get_by_test_id("editor-status")).to_contain_text("Removed the nightstand")
    assert errors == []


def test_rotate_and_delete(page: Page, errors):
    enter_edit(page)
    select(page, "coat-rack")
    start = obj(page, "coat-rack")["rotation"]["y"]
    # Phone-only controls stay out of the desktop panel.
    expect(page.get_by_role("button", name="Nudge left")).to_be_hidden()
    expect(page.get_by_test_id("editor-done")).to_be_hidden()
    expect(page.get_by_test_id("editor-handle")).to_be_hidden()

    page.get_by_role("button", name="Turn right").click()
    assert angle(obj(page, "coat-rack")["rotation"]["y"], start) == pytest.approx(STEP, abs=1e-3)
    page.keyboard.press("r")
    assert angle(obj(page, "coat-rack")["rotation"]["y"], start) == pytest.approx(
        2 * STEP, abs=1e-3
    )
    page.keyboard.press("Shift+R")
    page.get_by_role("button", name="Turn left").click()
    assert angle(obj(page, "coat-rack")["rotation"]["y"], start) == pytest.approx(0, abs=1e-3)

    page.keyboard.press("Delete")
    assert obj(page, "coat-rack") is None
    expect(page.get_by_test_id("editor-selection")).to_be_hidden()
    assert errors == []


def test_look_changes_apply_immediately(page: Page, errors):
    enter_edit(page)
    before = page.evaluate("() => window.__doors.samplePixels()")
    page.get_by_role("tab", name="Look").click()

    page.get_by_role("button", name="Lighting: Night").click()
    page.get_by_role("button", name="Walls: Midnight").click()
    page.get_by_role("button", name="Floor: Walnut").click()

    assert info(page)["scene"]["appearance"] == {
        "theme": "cozy",
        "wallpaper": "midnight",
        "floor": "walnut",
        "lighting": "night",
        "landscape": "countryside",
    }
    expect(page.get_by_role("button", name="Lighting: Night")).to_have_attribute(
        "aria-pressed", "true"
    )
    expect(page.get_by_role("button", name="Lighting: Day")).to_have_attribute(
        "aria-pressed", "false"
    )
    assert info(page)["scene"]["states"]["window"]["scene"] == "night"
    after = page.evaluate("() => window.__doors.samplePixels()")
    assert after["meanBrightness"] < before["meanBrightness"] - 25
    assert errors == []


def test_cancel_puts_everything_back(page: Page, errors):
    open_room(page, OWNER)
    original = layout(page)
    page.get_by_test_id("edit-room").click()
    wait_camera_settled(page)

    select(page, "couch")
    page.keyboard.press("ArrowLeft")
    select(page, "coat-rack")
    page.keyboard.press("Delete")
    page.get_by_role("button", name="Armchair", exact=True).click()
    page.wait_for_function("() => window.__doors.info().scene.editor.pending")
    click_floor(page, 0.5, -2.5)
    page.get_by_role("tab", name="Look").click()
    page.get_by_role("button", name="Lighting: Night").click()
    assert layout(page) != original

    page.get_by_test_id("editor-cancel").click()

    page.wait_for_function("() => !window.__doors.info().editing")
    expect(page.get_by_test_id("editor")).to_be_hidden()
    expect(page.get_by_test_id("back-link")).to_be_visible()
    assert layout(page) == original
    assert info(page)["savedLayout"] is None
    assert errors == []


def test_saved_layout_survives_a_reload_and_start_over_resets_it(page: Page, errors):
    enter_edit(page)
    select(page, "couch")
    page.keyboard.press("ArrowLeft")
    moved = obj(page, "couch")["position"]
    page.get_by_role("tab", name="Look").click()
    page.get_by_role("button", name="Walls: Blush").click()
    page.get_by_test_id("editor-save").click()
    expect(page.get_by_test_id("editor")).to_be_hidden()

    data = open_room(page, OWNER)
    assert data["customized"] is True
    assert data["scene"]["appearance"]["wallpaper"] == "blush"
    assert obj(page, "couch")["position"] == moved

    data = open_room(page, "/room?quality=low")
    assert obj(page, "couch")["position"] == moved, "visitors in this browser see the saved room"

    enter_edit(page)
    page.get_by_test_id("editor-restore").click()
    page.wait_for_function(
        "() => window.__doors.info().scene.editor.message.startsWith('Back to how')"
    )
    assert obj(page, "couch")["position"] == COUCH_START
    page.get_by_test_id("editor-save").click()

    open_room(page, OWNER)
    assert info(page)["scene"]["appearance"] == MIRA["appearance"]
    assert obj(page, "couch")["position"] == COUCH_START
    assert errors == []


def test_a_corrupt_saved_layout_is_ignored(page: Page, errors):
    open_room(page)
    page.evaluate(
        """() => {
            localStorage.setItem('doors:v1:mira:layout', '{not json');
        }"""
    )
    data = open_room(page)
    assert data["customized"] is False
    assert data["scene"]["objects"] == len(MIRA["objects"])

    page.evaluate(
        """() => localStorage.setItem('doors:v1:mira:layout', JSON.stringify({
            appearance: { wallpaper: 'plaid' },
            objects: [{ id: 'x', catalogId: 'lounge-sofa', position: { x: 0, y: 0, z: 0 } }],
        }))"""
    )
    data = open_room(page)
    assert data["customized"] is True
    assert data["scene"]["appearance"] == MIRA["appearance"], "unknown presets fall back"
    assert data["scene"]["objects"] == 1
    assert errors == []


# ---- Catalogue, stacking, walls, ceiling, colour and size ----


def visible_items(page: Page) -> list[str]:
    return page.locator("[data-add-item]:visible .editor-item-name").all_inner_texts()


def wait_placed(page: Page) -> None:
    page.wait_for_function("() => window.__doors.info().scene.editor.pending === null")


def test_catalogue_has_categories_and_search(page: Page, errors):
    enter_edit(page)
    assert len(visible_items(page)) >= 80

    page.get_by_role("button", name="Lighting", exact=True).click()
    lights = visible_items(page)
    assert {"Ceiling fan", "Wall lamp", "Floor lamp", "Pendant lamp"} <= set(lights)
    assert "Sofa" not in lights

    page.get_by_role("button", name="All", exact=True).click()
    search = page.get_by_test_id("editor-search")
    search.fill("teddy")
    assert visible_items(page) == ["Teddy bear"]
    search.fill("couch")
    assert {"Sofa", "Long sofa", "Corner sofa"} <= set(visible_items(page)), "tags match too"
    search.fill("xylophone")
    assert visible_items(page) == []
    expect(page.get_by_test_id("editor-empty")).to_have_text("Nothing matches “xylophone”.")
    assert errors == []


def test_small_things_stand_on_furniture(page: Page, errors):
    enter_edit(page)
    table = bounds(page, "coffee-table")
    top = table["max"][1]

    bear = add(page, "Teddy bear")
    tv = bounds(page, "tv")
    click_world(
        page, (tv["min"][0] + tv["max"][0]) / 2, tv["min"][1], (tv["min"][2] + tv["max"][2]) / 2
    )
    assert editor(page)["pending"] == bear, "the TV is already there"
    assert editor(page)["valid"] is False

    click_world(
        page, (table["min"][0] + table["max"][0]) / 2, top, (table["min"][2] + table["max"][2]) / 2
    )
    wait_placed(page)
    placed = bounds(page, bear)
    assert placed["min"][1] == pytest.approx(top, abs=0.03), "stands on the coffee table"

    select(page, "coffee-table")
    assert bear in editor(page)["selected"]["children"], "and moves with the table"
    assert floor_overlaps(page) == []
    assert errors == []


def test_wall_items_hang_on_any_wall(page: Page, errors):
    enter_edit(page)
    mirror = add(page, "Wall mirror")
    click_world(page, -2.6, 1.1, -4.99)
    wait_placed(page)
    placed = obj(page, mirror)
    assert placed["rotation"]["y"] == pytest.approx(0, abs=1e-3), "faces into the room"
    assert placed["position"]["z"] == pytest.approx(-4.97, abs=0.01)
    assert bounds(page, mirror)["min"][2] >= -5.0

    page.keyboard.press("ArrowLeft")
    page.keyboard.press("ArrowUp")
    moved = obj(page, mirror)["position"]
    assert moved["x"] == pytest.approx(placed["position"]["x"] - 0.1, abs=1e-3)
    assert moved["y"] == pytest.approx(placed["position"]["y"] + 0.1, abs=1e-3)
    assert editor(page)["selected"]["canRotate"] is False

    # Photos slide along the left wall but stop before the next photo.
    select(page, "photo-sunset")
    for _ in range(15):
        page.keyboard.press("ArrowRight")
    sunset, waves = bounds(page, "photo-sunset"), bounds(page, "photo-waves")
    assert obj(page, "photo-sunset")["position"]["z"] < -0.4, "moved toward the back"
    assert sunset["min"][2] >= waves["max"][2] - 0.011, "but not over the other photo"

    # A new item can go on a different wall: turn to face the right-hand wall first.
    page.keyboard.press("Escape")
    page.locator(".engine-canvas").focus()
    for _ in range(4):
        page.keyboard.press("ArrowLeft")
    wait_camera_settled(page)
    hook = add(page, "Wall hooks")
    click_world(page, 4.99, 0.8, 0.0)
    wait_placed(page)
    assert obj(page, hook)["rotation"]["y"] == pytest.approx(-math.pi / 2, abs=1e-3)
    assert obj(page, hook)["position"]["x"] == pytest.approx(4.97, abs=0.01)
    assert errors == []


def test_ceiling_items_hang_from_the_ceiling(page: Page, errors):
    enter_edit(page)
    fan = add(page, "Ceiling fan")
    click_floor(page, -2.0, 1.5)
    wait_placed(page)
    placed = obj(page, fan)["position"]
    assert placed["y"] == pytest.approx(4.0)
    assert placed["x"] == pytest.approx(-2.0, abs=0.26)
    assert placed["z"] == pytest.approx(1.5, abs=0.26)
    box = bounds(page, fan)
    assert box["max"][1] <= 4.001 and box["min"][1] > 2.5, "hangs below the ceiling"

    pendant = obj(page, "pendant")["position"]
    add(page, "Ceiling lamp")
    click_floor(page, pendant["x"], pendant["z"])
    assert editor(page)["valid"] is False, "can't share a spot with the pendant lamp"
    page.keyboard.press("Escape")
    assert errors == []


def test_recolour_and_resize_are_saved(page: Page, errors):
    enter_edit(page)
    point = point_for(page, "couch")
    page.mouse.click(point["x"], point["y"])
    expect(page.get_by_test_id("editor-item")).to_be_visible()
    expect(page.get_by_role("button", name="Colour: Original")).to_have_attribute(
        "aria-pressed", "true"
    )
    expect(page.get_by_role("button", name="Size: Medium")).to_have_attribute(
        "aria-pressed", "true"
    )
    region = {"x": point["x"], "y": point["y"], "size": 16}
    before = page.evaluate("(r) => window.__doors.samplePixels(r)", region)

    page.get_by_role("button", name="Colour: Charcoal").click()
    page.wait_for_function(
        "() => window.__doors.layout().objects.find((o) => o.id === 'couch')?.customData?.color"
        " === 'charcoal'"
    )
    expect(page.get_by_role("button", name="Colour: Charcoal")).to_have_attribute(
        "aria-pressed", "true"
    )
    after = page.evaluate("(r) => window.__doors.samplePixels(r)", region)
    assert after["meanBrightness"] < before["meanBrightness"] - 30, "the couch looks darker"
    assert editor(page)["selected"]["id"] == "couch", "still selected after the rebuild"

    page.get_by_role("button", name="Size: Large").click()
    assert obj(page, "couch")["scale"] == {"x": 1.25, "y": 1.25, "z": 1.25}
    assert floor_overlaps(page) == []

    page.get_by_test_id("editor-save").click()
    expect(page.get_by_test_id("editor")).to_be_hidden()
    open_room(page, OWNER)
    couch = obj(page, "couch")
    assert couch["customData"] == {"color": "charcoal"}
    assert couch["scale"]["x"] == 1.25
    assert errors == []


def test_cancel_undoes_colours(page: Page, errors):
    enter_edit(page)
    select(page, "armchair")
    page.get_by_role("button", name="Colour: Teal").click()
    page.wait_for_function(
        "() => window.__doors.layout().objects.find((o) => o.id === 'armchair')?.customData?.color"
    )
    page.get_by_test_id("editor-cancel").click()
    page.wait_for_function("() => !window.__doors.info().editing")
    page.wait_for_function(
        "() => !window.__doors.layout().objects.find((o) => o.id === 'armchair')?.customData"
    )
    assert errors == []


def test_the_door_can_be_recoloured_but_not_moved(page: Page, errors):
    enter_edit(page)
    select(page, "door")
    state = editor(page)["selected"]
    assert state["canMove"] is False and state["canDelete"] is False
    assert state["canRecolor"] is True and state["canResize"] is False
    expect(page.get_by_role("button", name="Remove")).to_be_hidden()
    expect(page.get_by_role("button", name="Size: Large")).to_have_count(0)

    page.locator(".engine-canvas").focus()
    page.keyboard.press("Delete")
    page.keyboard.press("ArrowLeft")
    assert (
        obj(page, "door")["position"]
        == next(o for o in MIRA["objects"] if o["id"] == "door")["position"]
    )
    page.get_by_role("button", name="Colour: Navy").click()
    page.wait_for_function(
        "() => window.__doors.layout().objects.find((o) => o.id === 'door')?.customData?.color"
        " === 'navy'"
    )
    assert errors == []


def test_placement_rules(page: Page, errors):
    open_room(page)
    result = page.evaluate(
        """async () => {
            const p = await import('/static/js/three/placement.js');
            const room = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
            const box = { minX: 4.5, maxX: 5.5, minZ: -1, maxZ: 0 };
            const unit = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
            return {
                snap: [p.snap(0.12), p.snap(0.13), p.snap(-1.37)],
                shift: p.shiftInside(box, room),
                tooBig: p.shiftInside({ minX: -6, maxX: 6, minZ: 0, maxZ: 1 }, room),
                touching: p.overlaps(unit, { minX: 1, maxX: 2, minZ: 0, maxZ: 1 }),
                clash: p.overlaps(unit, { minX: 0.5, maxX: 2, minZ: 0.5, maxZ: 2 }),
                angle: p.normalizeAngle(Math.PI * 3),
                firstSpots: [...p.spiral(0, 0, 0.25)].slice(0, 5),
            };
        }"""
    )
    assert result["snap"] == [0, 0.25, -1.25]
    assert result["shift"] == {"dx": -0.5, "dz": 0}
    assert result["tooBig"] is None
    assert result["touching"] is False
    assert result["clash"] is True
    assert result["angle"] == pytest.approx(math.pi)
    assert result["firstSpots"][0] == [0, 0]
    assert sorted(map(tuple, result["firstSpots"][1:])) == [
        (-0.25, 0),
        (0, -0.25),
        (0, 0.25),
        (0.25, 0),
    ]
    assert errors == []


@pytest.fixture
def owner_phone(browser: Browser, base_url: str, slow_frames: bool):
    context = browser.new_context(
        base_url=base_url,
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
    )
    if slow_frames:
        context.add_init_script(SLOW_FRAMES_SCRIPT)
    page = context.new_page()
    yield page
    context.close()


def canvas_height(page: Page) -> float:
    return page.locator(".engine-canvas").bounding_box()["height"]


def screen_center(page: Page, object_id: str) -> dict:
    box = bounds(page, object_id)
    centre = [(lo + hi) / 2 for lo, hi in zip(box["min"], box["max"], strict=True)]
    return page.evaluate("([x, y, z]) => window.__doors.worldPoint(x, y, z)", centre)


def test_editing_by_touch_on_a_phone(owner_phone: Page):
    page = owner_phone
    errors = collect_errors(page)
    open_room(page, OWNER)
    page.get_by_test_id("edit-room").tap()
    sheet = page.get_by_test_id("editor")
    expect(sheet).to_be_visible()
    wait_camera_settled(page)

    # The sheet starts folded, so the room keeps most of the screen.
    expect(sheet).to_have_attribute("data-sheet", "peek")
    expect(page.get_by_test_id("editor-search")).to_be_hidden()
    assert page.locator(".room-nameplate").bounding_box()["width"] <= 1, (
        "the room's name tucks away"
    )
    assert canvas_height(page) > 650
    assert page.get_by_test_id("editor-save").bounding_box()["y"] < 80, "Save moves to the top"

    page.get_by_role("tab", name="Add").tap()
    expect(sheet).to_have_attribute("data-sheet", "open")
    expect(page.get_by_test_id("editor-search")).to_be_visible()
    page.wait_for_function("() => document.querySelector('.engine-canvas').clientHeight < 450")

    # Picking something folds the sheet again so there's room to place it.
    page.get_by_role("button", name="Armchair", exact=True).tap()
    expect(sheet).to_have_attribute("data-sheet", "peek")
    page.wait_for_function("() => window.__doors.info().scene.editor.pending")
    page.wait_for_function("() => document.querySelector('.engine-canvas').clientHeight > 450")
    wait_camera_settled(page)
    point = page.evaluate("() => window.__doors.floorPoint(0.25, -1.25)")
    page.touchscreen.tap(point["x"], point["y"])

    page.wait_for_function("() => window.__doors.info().scene.editor.pending === null")
    assert obj(page, "lounge-chair-1") is not None

    handle = page.get_by_test_id("editor-handle")
    handle.tap()
    expect(sheet).to_have_attribute("data-sheet", "open")
    expect(handle).to_have_attribute("aria-expanded", "true")
    handle.tap()
    expect(sheet).to_have_attribute("data-sheet", "peek")

    page.get_by_test_id("editor-save").tap()
    expect(page.get_by_test_id("editor")).to_be_hidden()
    assert errors == []


def test_touch_picks_things_before_moving_them(owner_phone: Page):
    page = owner_phone
    errors = collect_errors(page)
    open_room(page, OWNER)
    page.get_by_test_id("edit-room").tap()
    wait_camera_settled(page)
    touch = Touch(page)
    start = obj(page, "couch")["position"]
    before = info(page)["scene"]["camera"]

    # A swipe that starts on the sofa turns the camera; the sofa stays put.
    point = point_for(page, "couch")
    touch.gesture([(point["x"], point["y"])], [(point["x"] + 120, point["y"])])
    after = wait_camera_settled(page)
    assert obj(page, "couch")["position"] == start
    assert angle_delta(after["azimuth"], before["azimuth"]) > 0.1
    assert editor(page)["selected"] is None

    # A tap picks it.
    point = point_for(page, "couch")
    touch.send("touchStart", [(point["x"], point["y"])])
    touch.send("touchEnd", [])
    page.wait_for_function("() => window.__doors.info().scene.editor.selected?.id === 'couch'")
    expect(page.get_by_test_id("editor-done")).to_be_visible()
    expect(page.get_by_test_id("editor-options")).to_be_visible()
    assert axe_violations(page) == []

    # Now a drag moves it, without turning the camera.
    point = point_for(page, "couch")
    azimuth = info(page)["scene"]["camera"]["azimuth"]
    touch.gesture([(point["x"], point["y"])], [(point["x"] - 60, point["y"] + 40)])
    assert obj(page, "couch")["position"] != start
    assert info(page)["scene"]["camera"]["azimuth"] == pytest.approx(azimuth, abs=1e-3)

    # Arrows nudge it the way they point on screen, whichever way the camera faces.
    for name, axis, sign in (("Nudge right", "x", 1), ("Nudge down", "y", 1)):
        was = screen_center(page, "couch")
        page.get_by_role("button", name=name).tap()
        now = screen_center(page, "couch")
        assert (now[axis] - was[axis]) * sign > 5, name

    page.get_by_test_id("editor-options").tap()
    expect(page.get_by_test_id("editor")).to_have_attribute("data-sheet", "open")
    expect(page.get_by_role("tab", name="Item")).to_have_attribute("aria-selected", "true")
    page.get_by_test_id("editor-done").tap()
    expect(page.get_by_test_id("editor-selection")).to_be_hidden()
    expect(page.get_by_test_id("editor")).to_have_attribute("data-sheet", "peek")
    assert errors == []
