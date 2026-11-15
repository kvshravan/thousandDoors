import threading
import urllib.request

import pytest
from werkzeug.serving import make_server

from app import create_app

# Headless Chromium has no GPU; these flags enable the SwiftShader software
# renderer so WebGL 2 works in tests and CI.
WEBGL_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

# With --slow-frames, animation frames arrive ~6 times a second, like on a slow CI
# runner. Use it to catch code that assumes a fast frame rate.
SLOW_FRAMES_SCRIPT = """
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 160);
window.cancelAnimationFrame = (id) => clearTimeout(id);
"""


def pytest_addoption(parser):
    parser.addoption(
        "--slow-frames",
        action="store_true",
        help="Emulate a ~6 fps renderer in browser tests (like slow CI machines).",
    )


@pytest.fixture(scope="session")
def slow_frames(pytestconfig) -> bool:
    return pytestconfig.getoption("--slow-frames")


def pytest_collection_modifyitems(items):
    for item in items:
        if "e2e" in item.path.parts:
            item.add_marker(pytest.mark.e2e)


@pytest.fixture(scope="session")
def live_server():
    server = make_server("127.0.0.1", 0, create_app("testing"), threaded=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()
    thread.join(timeout=5)


@pytest.fixture(scope="session")
def base_url(live_server):
    return live_server


@pytest.fixture(autouse=True)
def fresh_data(live_server):
    """Each browser test starts with only the demo rooms (the app keeps data in memory)."""
    request = urllib.request.Request(f"{live_server}/__test__/reset", method="POST")
    urllib.request.urlopen(request, timeout=10).read()


@pytest.fixture(scope="session")
def browser_type_launch_args(browser_type_launch_args):
    args = [*browser_type_launch_args.get("args", []), *WEBGL_ARGS]
    return {**browser_type_launch_args, "args": args}


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    return {**browser_context_args, "viewport": {"width": 1280, "height": 720}}


# Rooms show a how-it-works guide on a first visit and open in the walking view; most
# tests aren't about either, so every test browser has "seen" the guide and chosen the
# overview, unless a test sets doors:test-keep-guide or doors:test-walk (see
# test_room_guide.py and test_room_walk.py).
GUIDE_SEEN_SCRIPT = """
try {
  if (localStorage.getItem('doors:test-keep-guide') !== '1') {
    localStorage.setItem('doors:guide-seen', '1');
  }
  if (localStorage.getItem('doors:test-walk') !== '1') {
    localStorage.setItem('doors:room-view', 'overview');
  }
} catch {}
"""


@pytest.fixture(scope="session")
def browser(browser):
    original = browser.new_context

    def new_context(*args, **kwargs):
        context = original(*args, **kwargs)
        context.add_init_script(GUIDE_SEEN_SCRIPT)
        return context

    browser.new_context = new_context
    return browser


def collect_errors(page):
    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))
    return errors


@pytest.fixture
def errors(page, slow_frames):
    if slow_frames:
        page.add_init_script(SLOW_FRAMES_SCRIPT)
    return collect_errors(page)
