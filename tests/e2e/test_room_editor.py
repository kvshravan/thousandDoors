import json
import math
from pathlib import Path

import pytest
from playwright.sync_api import Browser, Page, expect

from .conftest import SLOW_FRAMES_SCRIPT, collect_errors
from .helpers import info, open_room, point_for, wait_camera_settled

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
    point = page.evaluate("([x, z]) => window.__doors.floorPoint(x, z)", [x, z])
    box = page.locator(".engine-canvas").bounding_box()
    on_canvas = point and box["x"] < point["x"] < box["x"] + box["width"]
    assert on_canvas and box["y"] < point["y"] < box["y"] + box["height"], f"{x},{z} is off screen"
    page.mouse.click(point["x"], point["y"])


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

    page.get_by_role("button", name="Armchair").click()
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
    page.get_by_role("button", name="Coffee table").click()
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
    page.get_by_role("button", name="Armchair").click()
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


def test_editing_by_touch_on_a_phone(owner_phone: Page):
    page = owner_phone
    errors = collect_errors(page)
    open_room(page, OWNER)
    page.get_by_test_id("edit-room").tap()
    expect(page.get_by_test_id("editor")).to_be_visible()
    wait_camera_settled(page)
    stage = page.locator(".engine-canvas").bounding_box()
    assert stage["height"] < 600, "the 3D view shrinks above the editor sheet"

    page.get_by_role("button", name="Armchair").tap()
    page.wait_for_function("() => window.__doors.info().scene.editor.pending")
    point = page.evaluate("() => window.__doors.floorPoint(0.25, -1.25)")
    page.touchscreen.tap(point["x"], point["y"])

    page.wait_for_function("() => window.__doors.info().scene.editor.pending === null")
    assert obj(page, "lounge-chair-1") is not None
    page.get_by_test_id("editor-save").tap()
    expect(page.get_by_test_id("editor")).to_be_hidden()
    assert errors == []
