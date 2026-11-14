import math
import time

from playwright.sync_api import Page

READY_STATES = "['ready', 'error', 'unsupported']"
EPS = 1e-3


def open_room(page: Page, path: str = "/room?quality=low") -> dict:
    """Opens the room. Interaction tests use low quality so software rendering stays fast."""
    page.goto(path)
    page.wait_for_function(
        f"() => window.__doors && {READY_STATES}.includes(window.__doors.state)", timeout=30_000
    )
    state = page.evaluate("() => window.__doors.state")
    assert state == "ready", f"room failed to open, state={state}"
    return info(page)


def info(page: Page) -> dict:
    return page.evaluate("() => window.__doors.info()")


def camera(page: Page) -> dict:
    return info(page)["scene"]["camera"]


def wait_camera_settled(page: Page, timeout: float = 10.0) -> dict:
    """Waits until damping finishes and the camera stops moving."""
    deadline = time.monotonic() + timeout
    previous = camera(page)
    while time.monotonic() < deadline:
        page.wait_for_timeout(150)
        current = camera(page)
        if _same_position(previous, current):
            return current
        previous = current
    raise AssertionError("camera did not settle")


def canvas_center(page: Page) -> tuple[float, float]:
    box = page.locator(".engine-canvas").bounding_box()
    assert box, "canvas is not visible"
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def mouse_drag(page: Page, dx: float, dy: float, steps: int = 12) -> None:
    x, y = canvas_center(page)
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + dx, y + dy, steps=steps)
    page.mouse.up()


def assert_camera_within_limits(cam: dict) -> None:
    limits = cam["limits"]
    lo, hi = limits["bounds"]["min"], limits["bounds"]["max"]
    pos = cam["position"]
    for axis, i in (("x", 0), ("y", 1), ("z", 2)):
        assert lo[i] - EPS <= pos[axis] <= hi[i] + EPS, f"camera {axis}={pos[axis]} left the room"
    assert limits["minDistance"] - 0.05 <= cam["distance"] <= limits["maxDistance"] + 0.05
    assert limits["minPolarAngle"] - 0.02 <= cam["polar"] <= limits["maxPolarAngle"] + 0.02


def angle_delta(a: float, b: float) -> float:
    return abs(math.atan2(math.sin(a - b), math.cos(a - b)))


def _same_position(a: dict, b: dict) -> bool:
    return all(abs(a["position"][k] - b["position"][k]) < 5e-4 for k in "xyz")
