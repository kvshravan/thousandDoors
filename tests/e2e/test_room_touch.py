import pytest
from playwright.sync_api import Browser, Page

from .conftest import collect_errors
from .helpers import (
    angle_delta,
    assert_camera_within_limits,
    canvas_center,
    open_room,
    wait_camera_settled,
)

PHONE = {
    "viewport": {"width": 390, "height": 844},
    "device_scale_factor": 2,
    "is_mobile": True,
    "has_touch": True,
}


@pytest.fixture
def phone_page(browser: Browser, base_url: str):
    context = browser.new_context(base_url=base_url, **PHONE)
    page = context.new_page()
    yield page
    context.close()


class Touch:
    """Sends raw multi-touch events through the Chrome DevTools Protocol."""

    def __init__(self, page: Page):
        self.cdp = page.context.new_cdp_session(page)

    def send(self, kind: str, points: list[tuple[float, float]]) -> None:
        touch_points = [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(points)]
        self.cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": touch_points})

    def gesture(
        self, start: list[tuple[float, float]], end: list[tuple[float, float]], steps: int = 12
    ):
        self.send("touchStart", start)
        for step in range(1, steps + 1):
            t = step / steps
            points = [
                (sx + (ex - sx) * t, sy + (ey - sy) * t)
                for (sx, sy), (ex, ey) in zip(start, end, strict=True)
            ]
            self.send("touchMove", points)
        self.send("touchEnd", [])


def test_room_renders_on_phone(phone_page: Page):
    errors = collect_errors(phone_page)
    data = open_room(phone_page)

    assert data["engine"]["canvas"]["clientWidth"] == 390
    assert data["scene"]["camera"]["fov"] > 55
    assert "Pinch" in phone_page.get_by_test_id("room-hint").inner_text()
    pixels = phone_page.evaluate("() => window.__doors.samplePixels()")
    assert pixels["distinctColors"] > 40
    assert errors == []


def test_one_finger_drag_rotates_camera(phone_page: Page):
    errors = collect_errors(phone_page)
    before = open_room(phone_page)["scene"]["camera"]
    x, y = canvas_center(phone_page)

    Touch(phone_page).gesture([(x - 120, y)], [(x + 120, y)])
    after = wait_camera_settled(phone_page)

    assert angle_delta(after["azimuth"], before["azimuth"]) > 0.3
    assert_camera_within_limits(after)
    assert errors == []


def test_pinch_zooms_within_limits(phone_page: Page):
    errors = collect_errors(phone_page)
    before = open_room(phone_page)["scene"]["camera"]
    x, y = canvas_center(phone_page)
    touch = Touch(phone_page)

    touch.gesture([(x - 30, y), (x + 30, y)], [(x - 160, y), (x + 160, y)])
    zoomed_in = wait_camera_settled(phone_page)
    assert zoomed_in["distance"] < before["distance"] - 0.2
    assert_camera_within_limits(zoomed_in)

    for _ in range(4):
        touch.gesture([(x - 170, y), (x + 170, y)], [(x - 20, y), (x + 20, y)])
    zoomed_out = wait_camera_settled(phone_page)
    assert zoomed_out["distance"] > zoomed_in["distance"]
    assert_camera_within_limits(zoomed_out)
    assert errors == []
