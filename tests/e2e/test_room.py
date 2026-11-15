import pytest
from playwright.sync_api import Page, expect

from .helpers import (
    angle_delta,
    assert_camera_within_limits,
    camera,
    canvas_center,
    info,
    mouse_drag,
    open_room,
    wait_camera_settled,
)

DISABLE_WEBGL = """
const original = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type, ...args) {
  if (['webgl', 'webgl2', 'experimental-webgl'].includes(type)) return null;
  return original.call(this, type, ...args);
};
"""


def test_room_renders_a_furnished_scene(page: Page, errors):
    data = open_room(page, "/room")

    assert data["engine"]["quality"] in ("medium", "high")
    assert data["engine"]["running"] is True
    assert data["engine"]["frames"] > 0
    assert data["scene"]["skipped"] == []
    assert data["scene"]["failed"] == []
    assert data["scene"]["assets"]["failed"] == []
    assert data["scene"]["objects"] >= 25
    assert data["scene"]["meshes"] > 100
    expect(page.get_by_test_id("room-loading")).to_be_hidden()

    pixels = page.evaluate("() => window.__doors.samplePixels()")
    assert pixels["distinctColors"] > 40, "canvas looks blank or flat"
    assert 30 < pixels["meanBrightness"] < 235
    assert errors == []


def test_canvas_follows_window_resizing(page: Page, errors):
    open_room(page)

    for width, height in ((900, 600), (480, 860)):
        page.set_viewport_size({"width": width, "height": height})
        page.wait_for_function(
            "([w, h]) => { const c = window.__doors.info().engine.canvas;"
            " const r = window.__doors.info().engine.pixelRatio;"
            " return c.clientWidth === w && c.clientHeight === h"
            " && c.width === Math.round(w * r) && c.height === Math.round(h * r); }",
            arg=[width, height],
        )
        data = info(page)
        canvas = data["engine"]["canvas"]
        ratio = data["engine"]["pixelRatio"]
        assert canvas["width"] == round(width * ratio)
        assert canvas["height"] == round(height * ratio)
        assert data["scene"]["camera"]["aspect"] == pytest.approx(width / height, rel=1e-3)

    assert data["scene"]["camera"]["fov"] > 55, "portrait screens should widen the field of view"
    assert errors == []


def test_mouse_drag_rotates_camera(page: Page, errors):
    open_room(page)
    before = camera(page)

    mouse_drag(page, 260, 0)
    after = wait_camera_settled(page)

    assert angle_delta(after["azimuth"], before["azimuth"]) > 0.3
    assert_camera_within_limits(after)
    assert errors == []


def test_scroll_zoom_is_clamped(page: Page, errors):
    open_room(page)
    x, y = canvas_center(page)
    page.mouse.move(x, y)

    for _ in range(25):
        page.mouse.wheel(0, -400)
    zoomed_in = wait_camera_settled(page)
    assert zoomed_in["distance"] == pytest.approx(zoomed_in["limits"]["minDistance"], abs=0.05)

    for _ in range(25):
        page.mouse.wheel(0, 400)
    zoomed_out = wait_camera_settled(page)
    assert zoomed_out["distance"] == pytest.approx(zoomed_out["limits"]["maxDistance"], abs=0.05)
    assert errors == []


def test_camera_cannot_leave_the_room(page: Page, errors):
    open_room(page)
    x, y = canvas_center(page)
    page.mouse.move(x, y)
    for _ in range(25):
        page.mouse.wheel(0, 400)

    for dx, dy in ((600, 0), (0, -500), (-900, 300), (0, 600), (450, -450)):
        mouse_drag(page, dx, dy, steps=8)
        assert_camera_within_limits(wait_camera_settled(page))

    page.mouse.click(x, y, button="right")
    mouse_drag(page, 0, 0)
    assert_camera_within_limits(wait_camera_settled(page))
    assert errors == []


def test_reset_view_returns_to_start(page: Page, errors):
    start = open_room(page)["scene"]["camera"]
    mouse_drag(page, 300, 120)
    wait_camera_settled(page)

    page.get_by_test_id("reset-view").click()
    reset = wait_camera_settled(page)

    for axis in "xyz":
        assert reset["position"][axis] == pytest.approx(start["position"][axis], abs=0.01)
    assert errors == []


def test_render_loop_pauses_when_tab_is_hidden(page: Page, errors):
    open_room(page)
    set_visibility = """(state) => {
        Object.defineProperty(document, 'visibilityState', {
            configurable: true, get: () => state,
        });
        document.dispatchEvent(new Event('visibilitychange'));
    }"""

    page.evaluate(set_visibility, "hidden")
    hidden = info(page)
    assert hidden["engine"]["running"] is False
    assert hidden["activeLoops"] == 0

    page.evaluate(set_visibility, "visible")
    visible = info(page)
    assert visible["engine"]["running"] is True
    assert visible["activeLoops"] == 1
    assert errors == []


def test_destroy_releases_everything(page: Page, errors):
    open_room(page)

    page.evaluate("() => window.__doors.destroy()")
    data = info(page)

    assert data["state"] == "destroyed"
    assert data["engine"] is None
    assert data["activeLoops"] == 0
    assert page.locator(".engine-canvas").count() == 0
    assert errors == []


def test_pagehide_cleans_up_scene(page: Page, errors):
    open_room(page)

    page.evaluate("() => window.dispatchEvent(new PageTransitionEvent('pagehide'))")
    data = info(page)

    assert data["state"] == "destroyed"
    assert data["activeLoops"] == 0
    assert page.locator(".engine-canvas").count() == 0
    assert errors == []


def test_remounting_does_not_leak_gpu_resources(page: Page, errors):
    first = open_room(page)["engine"]["memory"]

    for _ in range(2):
        page.evaluate("() => window.__doors.remount()")
        page.wait_for_function("() => window.__doors.state === 'ready'")
        data = info(page)
        assert data["engine"]["memory"] == first
        assert data["activeLoops"] == 1
        assert page.locator(".engine-canvas").count() == 1
    assert errors == []


def test_back_link_leaves_room_cleanly(page: Page, errors, base_url):
    open_room(page)

    page.get_by_test_id("back-link").click()

    expect(page).to_have_url(f"{base_url}/hallway")
    expect(page.get_by_test_id("find-door")).to_be_visible()
    assert errors == []


def test_fallback_shown_without_webgl(page: Page, errors):
    page.add_init_script(DISABLE_WEBGL)
    page.goto("/room")

    page.wait_for_function("() => window.__doors?.state === 'unsupported'")
    expect(page.get_by_test_id("room-fallback")).to_be_visible()
    expect(page.get_by_test_id("room-loading")).to_be_hidden()
    assert page.locator(".engine-canvas").count() == 0
    assert errors == []
