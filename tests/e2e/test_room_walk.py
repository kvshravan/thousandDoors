import re
from itertools import pairwise

import pytest
from playwright.sync_api import Browser, Page, expect

from .conftest import SLOW_FRAMES_SCRIPT, collect_errors
from .helpers import Touch, camera, canvas_center, open_room, wait_camera_settled
from .test_room_touch import PHONE

# Test browsers default to the overview (see conftest.py); these tests are about walking.
WALK = "localStorage.setItem('doors:test-walk', '1'); localStorage.removeItem('doors:room-view')"


def walk_room(page: Page, path: str = "/room/mira?quality=low") -> dict:
    page.goto("/")
    page.evaluate(WALK)
    data = open_room(page, path)
    assert data["scene"]["camera"]["mode"] == "walk"
    return data


def walk(page: Page) -> dict:
    return camera(page)["walk"]


def floor_point(page: Page, x: float, z: float) -> dict:
    point = page.evaluate("([x, z]) => window.__doors.floorPoint(x, z)", [x, z])
    assert point, f"({x}, {z}) is off screen"
    return point


def walkable(page: Page, x: float, z: float) -> bool:
    return page.evaluate("([x, z]) => window.__doors.walkable(x, z)", [x, z])


def assert_route_is_clear(page: Page, route: list[dict]) -> None:
    for a, b in pairwise(route):
        for i in range(21):
            t = i / 20
            x, z = a["x"] + (b["x"] - a["x"]) * t, a["z"] + (b["z"] - a["z"]) * t
            assert walkable(page, x, z), f"the route crosses furniture at ({x:.2f}, {z:.2f})"


def test_rooms_open_in_the_walking_view_just_inside_the_door(page: Page, errors):
    walk_room(page)
    pose = walk(page)
    assert pose["position"]["y"] == pytest.approx(1.6, abs=0.05), "eye height"
    assert pose["position"]["z"] > 3, "by the door"
    expect(page.get_by_test_id("room-hint")).to_contain_text("walk")
    expect(page.get_by_test_id("view-toggle")).to_have_accessible_name("Overview")
    assert errors == []


def lock(page: Page) -> None:
    """Clicks into the room to start mouse look."""
    x, y = canvas_center(page)
    page.mouse.click(x, y)
    page.wait_for_function("() => window.__doors.info().scene.camera.walk.locked")


def test_clicking_the_room_starts_mouse_look_like_a_game(page: Page, errors):
    walk_room(page)
    prompt = page.get_by_test_id("room-lock-prompt")
    expect(prompt).to_contain_text("Click to look around")
    expect(page.get_by_test_id("room-crosshair")).to_be_hidden()
    before = walk(page)

    lock(page)
    expect(prompt).to_be_hidden()
    expect(page.get_by_test_id("room-crosshair")).to_be_visible()
    # Just moving the mouse (no button) turns the head: right turns right, up looks up.
    x, y = canvas_center(page)
    page.mouse.move(x + 200, y - 80, steps=8)
    after = wait_camera_settled(page)["walk"]
    assert after["yaw"] < before["yaw"] - 0.3
    assert after["pitch"] > before["pitch"]
    assert after["position"] == before["position"], "clicking the floor doesn't walk"
    assert after["route"] is None

    # Esc (the browser's own key for this) gives the cursor back.
    page.evaluate("() => document.exitPointerLock()")
    expect(prompt).to_be_visible()
    expect(page.get_by_test_id("room-crosshair")).to_be_hidden()
    assert errors == []


def test_walks_around_the_furniture_to_a_spot(page: Page, errors):
    walk_room(page)
    # Across the room, behind the coffee table: the way there goes round the furniture.
    target = (-0.4, -2.4)
    assert page.evaluate("([x, z]) => window.__doors.walkTo(x, z)", list(target))
    assert_route_is_clear(page, walk(page)["route"])
    pose = wait_camera_settled(page)["walk"]
    assert pose["position"]["x"] == pytest.approx(target[0], abs=0.5)
    assert pose["position"]["z"] == pytest.approx(target[1], abs=0.5)
    assert walkable(page, pose["position"]["x"], pose["position"]["z"])
    assert pose["position"]["y"] == pytest.approx(1.6, abs=0.05)
    assert errors == []


def test_keys_walk_and_never_into_furniture_or_walls(page: Page, errors):
    walk_room(page)
    start = walk(page)["position"]
    page.locator(".engine-canvas").focus()
    page.keyboard.down("KeyW")
    page.wait_for_function(
        "(z) => window.__doors.info().scene.camera.walk.position.z < z - 0.5", arg=start["z"]
    )
    page.keyboard.up("KeyW")
    moved = wait_camera_settled(page)["walk"]["position"]
    assert walkable(page, moved["x"], moved["z"])

    # Walk into the wall for a while: you stop (and slide) rather than going through.
    page.keyboard.down("KeyA")
    page.wait_for_timeout(2500)
    page.keyboard.up("KeyA")
    end = wait_camera_settled(page)["walk"]["position"]
    assert end["x"] < moved["x"] - 0.5
    assert end["x"] > -4.5, "stays inside the room"
    assert walkable(page, end["x"], end["z"])
    assert errors == []


def test_the_overview_is_one_tap_away_and_remembered(page: Page, errors):
    walk_room(page)
    assert page.evaluate("() => window.__doors.walkTo(0.6, 2.4)")
    spot = wait_camera_settled(page)["walk"]["position"]

    toggle = page.get_by_test_id("view-toggle")
    toggle.click()
    assert wait_camera_settled(page)["mode"] == "overview"
    expect(toggle).to_have_accessible_name("Walk")
    assert page.evaluate("() => localStorage.getItem('doors:room-view')") == "overview"

    toggle.click()
    back = wait_camera_settled(page)
    assert back["mode"] == "walk"
    assert back["walk"]["position"]["x"] == pytest.approx(spot["x"], abs=0.15), (
        "back where you were"
    )
    assert back["walk"]["position"]["z"] == pytest.approx(spot["z"], abs=0.15)

    toggle.click()
    open_room(page, "/room/jun?quality=low")
    assert camera(page)["mode"] == "overview", "remembered in the next room"
    assert errors == []


def test_aim_at_a_thing_and_click_to_use_it(page: Page, errors):
    walk_room(page)
    lock(page)
    cx, cy = canvas_center(page)
    mouse = {"x": cx, "y": cy}

    def turn(dx: float, dy: float = 0) -> None:
        mouse["x"] += dx
        mouse["y"] += dy
        page.mouse.move(mouse["x"], mouse["y"], steps=4)
        wait_camera_settled(page)

    # Turn until the crosshair rests on the photo (mouse pixels are ~0.55 screen pixels).
    for _ in range(20):
        if page.evaluate("() => window.__doors.info().scene.hovered") == "photo-sunset":
            break
        point = page.evaluate("() => window.__doors.pointFor('photo-sunset')")
        if point:
            turn((point["x"] - cx) * 0.5, (point["y"] - cy) * 0.5)
        else:
            turn(-250)
    assert page.evaluate("() => window.__doors.info().scene.hovered") == "photo-sunset"
    expect(page.get_by_test_id("room-crosshair")).to_have_class(re.compile("is-on-thing"))

    before = walk(page)["position"]
    page.mouse.click(mouse["x"], mouse["y"])
    expect(page.get_by_test_id("photo-viewer")).to_be_visible()
    assert walk(page)["position"] == before, "clicking a thing doesn't walk"
    # The photo needs the cursor, so mouse look pauses while it's open...
    page.wait_for_function("() => !window.__doors.info().scene.camera.walk.locked")
    expect(page.get_by_test_id("room-crosshair")).to_be_hidden()
    expect(page.get_by_test_id("room-lock-prompt")).to_be_hidden()
    # ...and closing it goes straight back to the dot.
    page.get_by_test_id("photo-viewer").get_by_role("button", name="Close photo").click()
    page.wait_for_function("() => window.__doors.info().scene.camera.walk.locked")
    expect(page.get_by_test_id("room-crosshair")).to_be_visible()
    expect(page.get_by_test_id("room-lock-prompt")).to_be_hidden()

    # Panels opened from the buttons (with the cursor) don't start mouse look.
    page.evaluate("() => document.exitPointerLock()")
    page.get_by_test_id("things-list").click()
    expect(page.get_by_test_id("room-panel")).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.get_by_test_id("room-lock-prompt")).to_be_visible()
    assert not walk(page)["locked"]
    assert errors == []


def test_sitting_down_and_standing_up_where_you_are(page: Page, errors):
    walk_room(page)
    page.get_by_test_id("things-list").click()
    page.locator('[data-object-id="couch"]').click()
    expect(page.get_by_test_id("stand-up")).to_be_visible()
    seated = wait_camera_settled(page)["walk"]
    assert seated["seated"] and seated["position"]["y"] < 1.4

    page.get_by_test_id("stand-up").click()
    standing = wait_camera_settled(page)["walk"]
    assert not standing["seated"]
    assert standing["position"]["y"] == pytest.approx(1.6, abs=0.05)
    assert abs(standing["position"]["z"] - seated["position"]["z"]) < 1.5, "gets up by the sofa"
    assert walkable(page, standing["position"]["x"], standing["position"]["z"])
    assert errors == []


def test_editing_uses_the_overview_then_walks_on(page: Page, errors):
    walk_room(page, "/room/mira?quality=low&as=owner")
    page.get_by_test_id("edit-room").click()
    expect(page.get_by_test_id("editor")).to_be_visible()
    assert camera(page)["mode"] == "overview"
    page.get_by_test_id("editor-cancel").click()
    expect(page.get_by_test_id("editor")).to_be_hidden()
    after = wait_camera_settled(page)
    assert after["mode"] == "walk"
    assert after["walk"]["position"]["y"] == pytest.approx(1.6, abs=0.05)
    assert errors == []


def test_reduced_motion_walks_without_gliding_or_bobbing(page: Page, errors):
    page.emulate_media(reduced_motion="reduce")
    walk_room(page)
    assert page.evaluate("() => window.__doors.walkTo(0.6, 2.4)")
    pose = wait_camera_settled(page)["walk"]
    assert pose["position"]["x"] == pytest.approx(0.6, abs=0.15)
    assert pose["position"]["y"] == pytest.approx(1.6, abs=1e-6), "no head bob"
    assert errors == []


@pytest.fixture
def phone(browser: Browser, base_url: str, slow_frames: bool):
    context = browser.new_context(base_url=base_url, **PHONE)
    if slow_frames:
        context.add_init_script(SLOW_FRAMES_SCRIPT)
    page = context.new_page()
    yield page
    context.close()


def test_phones_tap_the_floor_to_walk_and_swipe_to_look(phone: Page):
    errors = collect_errors(phone)
    walk_room(phone)
    expect(phone.get_by_test_id("room-hint")).to_contain_text("Tap the floor")

    point = floor_point(phone, 0.6, 2.2)
    phone.touchscreen.tap(point["x"], point["y"])
    pose = wait_camera_settled(phone)["walk"]
    assert pose["position"]["z"] < 3.2, "walked toward the tap"

    x, y = canvas_center(phone)
    Touch(phone).gesture([(x - 100, y)], [(x + 100, y)])
    turned = wait_camera_settled(phone)["walk"]
    assert turned["yaw"] > pose["yaw"] + 0.2
    assert turned["position"] == pose["position"]
    assert errors == []
