import math
from pathlib import Path

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


TEST_USER_ID = "00000000-0000-4000-8000-000000000001"


def sign_in(
    page: Page,
    *,
    user_id: str = TEST_USER_ID,
    email: str = "sam@example.com",
    username: str | None = None,
    display_name: str | None = None,
) -> dict:
    """Signs the browser in as a test user (and creates their room if `username` is given).

    The test server mints tokens with its own key in place of Supabase, so no email is sent.
    """
    session = page.request.post("/__test__/session", data={"id": user_id, "email": email}).json()
    if username:
        response = page.request.post(
            "/api/me/profile",
            data={"username": username, "displayName": display_name or username},
            headers={"Authorization": f"Bearer {session['access_token']}"},
        )
        assert response.status == 201, response.text()
    # localStorage belongs to the site, so a page from it must be open first.
    if page.url == "about:blank":
        page.goto("/healthz")
    page.evaluate("(s) => localStorage.setItem('doors:auth', JSON.stringify(s))", session)
    return session


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


AXE_SCRIPT = Path(__file__).parent / "vendor" / "axe.min.js"


def axe_violations(page: Page) -> list[dict]:
    """Runs the axe-core accessibility checker on the current page state."""
    if not page.evaluate("() => Boolean(window.axe)"):
        page.add_script_tag(path=str(AXE_SCRIPT))
    return page.evaluate(
        """async () => {
            const result = await axe.run(document, { resultTypes: ['violations'] });
            return result.violations.map((v) => ({
                id: v.id, impact: v.impact, help: v.help,
                targets: v.nodes.map((n) => n.target.join(' ')),
            }));
        }"""
    )
