import math
import re

import pytest
from playwright.sync_api import Browser, Page, expect

from .conftest import SLOW_FRAMES_SCRIPT, collect_errors
from .helpers import (
    axe_violations,
    camera,
    info,
    mouse_drag,
    open_room,
    sign_in,
    wait_camera_settled,
)

OWNER = "/room?quality=low&as=owner"


def focused(page: Page) -> str:
    return page.evaluate(
        "() => { const el = document.activeElement;"
        " if (el.matches('.engine-canvas')) return 'canvas';"
        " return (el.getAttribute('aria-label') || el.textContent).trim(); }"
    )


def tab_to(page: Page, name: str, limit: int = 40) -> None:
    """Presses Tab until the focused element's name contains `name`."""
    for _ in range(limit):
        page.keyboard.press("Tab")
        if name in focused(page):
            return
    raise AssertionError(f"never reached {name!r} with Tab")


def announced(page: Page, text: str) -> None:
    expect(page.get_by_test_id("room-announcer")).to_contain_text(text)


# ---- Automated checks (axe-core) ----


def test_home_page_has_no_accessibility_violations(page: Page, errors):
    page.goto("/")
    assert axe_violations(page) == []


@pytest.mark.parametrize("path", ["/room?quality=low", "/room/jun?quality=low"])
def test_room_has_no_accessibility_violations(page: Page, errors, path):
    open_room(page, path)
    assert axe_violations(page) == []
    assert errors == []


def test_open_panels_have_no_accessibility_violations(page: Page, errors):
    sign_in(page, username="sam")
    open_room(page, OWNER)

    page.get_by_test_id("things-list").click()
    assert axe_violations(page) == []

    page.get_by_role("button", name=re.compile("Notes for|Noticeboard")).click()
    expect(page.get_by_test_id("note-form")).to_be_visible()
    assert axe_violations(page) == []
    page.keyboard.press("Escape")

    page.get_by_test_id("edit-room").click()
    wait_camera_settled(page)
    assert axe_violations(page) == []
    page.get_by_role("tab", name="Look").click()
    assert axe_violations(page) == []
    assert errors == []


# ---- Keyboard ----


def test_keyboard_reaches_the_3d_view_and_moves_the_camera(page: Page, errors):
    open_room(page)
    canvas = page.locator(".engine-canvas")
    expect(canvas).to_have_attribute("aria-label", "Mira's room, 3D view")
    expect(canvas).to_have_attribute("aria-describedby", "room-keys-help")

    tab_to(page, "canvas")
    start = camera(page)

    page.keyboard.press("ArrowRight")
    page.keyboard.press("ArrowRight")
    turned = wait_camera_settled(page)
    assert abs(turned["azimuth"] - start["azimuth"]) == pytest.approx(math.pi / 6, abs=0.02)

    page.keyboard.press("ArrowUp")
    raised = wait_camera_settled(page)
    assert raised["polar"] < turned["polar"]

    for _ in range(3):
        page.keyboard.press("+")
    closer = wait_camera_settled(page)
    assert closer["distance"] < turned["distance"] - 0.5

    for _ in range(30):
        page.keyboard.press("-")
    furthest = wait_camera_settled(page)
    assert furthest["distance"] == pytest.approx(furthest["limits"]["maxDistance"], abs=0.05)

    page.keyboard.press("Home")
    home = wait_camera_settled(page)
    for axis in "xyz":
        assert home["position"][axis] == pytest.approx(start["position"][axis], abs=0.02)
    assert errors == []


def test_keyboard_only_visitor_can_use_objects(page: Page, errors):
    open_room(page)

    tab_to(page, "Things here")
    page.keyboard.press("Enter")
    things = page.get_by_test_id("room-panel")
    expect(things).to_contain_text("Things here")
    names = things.locator(".things-name").all_inner_texts()
    assert "Moonrise" in names and "Sofa" in names
    assert "Floor lamp" not in names, "owner-only objects aren't listed for visitors"
    assert "Old chest" not in names, "friends-only objects aren't listed for strangers"
    assert names == sorted(names, key=str.casefold)

    tab_to(page, "Moonrise")
    page.keyboard.press("Enter")
    viewer = page.get_by_test_id("photo-viewer")
    expect(viewer).to_be_visible()
    expect(viewer).to_contain_text("Moonrise")
    page.keyboard.press("Escape")
    expect(viewer).to_be_hidden()

    page.get_by_test_id("things-list").click()
    page.get_by_role("button", name=re.compile("^Table lamp")).click()
    # The lamp first, then what's read out, so a failure says which one went wrong.
    page.wait_for_function("() => window.__doors.info().scene.lamps['bedside-lamp'] === false")
    announced(page, "Table lamp switched off.")

    page.get_by_test_id("things-list").click()
    page.get_by_role("button", name=re.compile("^Window")).click()
    announced(page, "The window now shows the evening sky.")

    page.get_by_test_id("things-list").click()
    page.get_by_role("button", name=re.compile("^Sofa")).click()
    announced(page, "You sit on the sofa.")
    expect(page.get_by_test_id("stand-up")).to_be_visible()
    wait_camera_settled(page)
    page.locator(".engine-canvas").focus()
    page.keyboard.press("Home")
    announced(page, "You stand up.")
    expect(page.get_by_test_id("stand-up")).to_be_hidden()
    assert errors == []


def test_friends_see_the_chest_in_the_list(page: Page, errors):
    open_room(page, "/room?quality=low&as=friend")
    page.get_by_test_id("things-list").click()
    expect(
        page.get_by_test_id("room-panel").locator(".things-name", has_text="Old chest")
    ).to_be_visible()
    assert errors == []


def test_editor_is_usable_from_the_keyboard(page: Page, errors):
    open_room(page, OWNER)
    tab_to(page, "Edit room")
    page.keyboard.press("Enter")
    expect(page.get_by_test_id("editor")).to_be_visible()
    wait_camera_settled(page)
    count = info(page)["scene"]["objects"]

    tab_to(page, "Search things to add")
    page.keyboard.type("coat rack")
    # The category filters and the catalogue are one Tab stop each.
    page.keyboard.press("Tab")
    assert focused(page) == "All"
    page.keyboard.press("Tab")
    assert focused(page) == "Coat rack"
    page.keyboard.press("Enter")
    page.wait_for_function("() => window.__doors.info().scene.editor.pending")
    assert focused(page) == "canvas"
    page.keyboard.press("Enter")
    page.wait_for_function("() => window.__doors.info().scene.editor.pending === null")
    assert info(page)["scene"]["objects"] == count + 1

    tab_to(page, "Save")
    page.keyboard.press("Enter")
    expect(page.get_by_test_id("editor")).to_be_hidden()
    assert info(page)["savedLayout"] is not None
    assert errors == []


def test_every_control_has_an_accessible_name(page: Page, errors):
    open_room(page, OWNER)
    page.get_by_test_id("edit-room").click()
    unnamed = page.evaluate(
        """() => [...document.querySelectorAll('button, a[href], [role="tab"], input, textarea')]
            .filter((el) => el.offsetParent !== null || el.closest('dialog[open]'))
            .filter((el) => !(el.getAttribute('aria-label') || el.textContent.trim()
                || el.getAttribute('placeholder')))
            .map((el) => el.outerHTML.slice(0, 80))"""
    )
    assert unnamed == []
    assert errors == []


# ---- Motion and small screens ----


@pytest.fixture
def reduced_motion_page(browser: Browser, base_url: str, slow_frames: bool):
    context = browser.new_context(
        base_url=base_url, reduced_motion="reduce", viewport={"width": 1280, "height": 720}
    )
    if slow_frames:
        context.add_init_script(SLOW_FRAMES_SCRIPT)
    page = context.new_page()
    yield page
    context.close()


def test_reduced_motion_makes_camera_moves_instant(reduced_motion_page: Page):
    page = reduced_motion_page
    errors = collect_errors(page)
    start = open_room(page)["scene"]["camera"]["position"]
    # Reset straight after a drag, while OrbitControls still has momentum to discard.
    mouse_drag(page, 300, 0)

    ticks = info(page)["engine"]["ticks"]
    page.get_by_test_id("reset-view").click()
    page.wait_for_function("(t) => window.__doors.info().engine.ticks >= t + 2", arg=ticks)

    now = camera(page)["position"]
    for axis in "xyz":
        assert now[axis] == pytest.approx(start[axis], abs=1e-3)
    assert errors == []


def test_reduced_motion_keeps_lights_and_snow_still(reduced_motion_page: Page):
    page = reduced_motion_page
    errors = collect_errors(page)
    open_room(page, "/room/jun?quality=low&as=owner")
    page.get_by_test_id("edit-room").click()
    assert page.evaluate("() => window.__doors.editorSelect('neon-sign')")
    page.get_by_role("button", name="Effect: Twinkle").click()
    lights = info(page)["scene"]["lights"]["neon-sign"]
    assert lights["effect"] == "twinkle", "the choice is still saved"
    assert lights["animated"] is False, "but the light doesn't flash"
    assert errors == []


def test_phone_room_controls_fit_on_one_row(browser: Browser, base_url: str):
    context = browser.new_context(
        base_url=base_url,
        viewport={"width": 360, "height": 740},
        is_mobile=True,
        has_touch=True,
    )
    page = context.new_page()
    errors = collect_errors(page)
    open_room(page, OWNER)

    tops = page.locator(".room-actions > :visible").evaluate_all(
        "(els) => els.map((el) => Math.round(el.getBoundingClientRect().top))"
    )
    rights = page.locator(".room-actions > :visible").evaluate_all(
        "(els) => els.map((el) => el.getBoundingClientRect().right)"
    )
    assert len(set(tops)) == 1, "buttons wrap onto a second row"
    assert max(rights) <= 360
    expect(page.get_by_role("button", name="Things here")).to_be_visible()
    expect(page.get_by_role("button", name="Edit room")).to_be_visible()
    context.close()
    assert errors == []
