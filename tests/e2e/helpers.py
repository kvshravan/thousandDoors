import math

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


def wait_camera_settled(page: Page, timeout: float = 15.0) -> dict:
    """Waits until the controller reports a tick with no camera movement.

    Requires a couple of fresh ticks first, so input that hasn't been processed
    yet can't be mistaken for a settled camera.
    """
    start = info(page)["engine"]["ticks"]
    page.wait_for_function(
        "(start) => { const i = window.__doors.info();"
        " return i.engine.ticks >= start + 2 && i.scene.camera.idle; }",
        arg=start,
        timeout=timeout * 1000,
    )
    return camera(page)


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


def point_for(page: Page, object_id: str) -> dict | None:
    return page.evaluate("(id) => window.__doors.pointFor(id)", object_id)


def bring_into_view(page: Page, object_id: str, attempts: int = 12) -> dict:
    """Rotates the camera until the object is clickable and returns its screen point."""
    for _ in range(attempts):
        point = point_for(page, object_id)
        if point:
            return point
        mouse_drag(page, 160, 0, steps=6)
        wait_camera_settled(page)
    raise AssertionError(f"{object_id} never came into view")


def click_object(page: Page, object_id: str) -> None:
    point = bring_into_view(page, object_id)
    page.mouse.click(point["x"], point["y"])
