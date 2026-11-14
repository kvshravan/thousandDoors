import threading

import pytest
from werkzeug.serving import make_server

from app import create_app

# Headless Chromium has no GPU; these flags enable the SwiftShader software
# renderer so WebGL 2 works in tests and CI.
WEBGL_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]


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


@pytest.fixture(scope="session")
def browser_type_launch_args(browser_type_launch_args):
    args = [*browser_type_launch_args.get("args", []), *WEBGL_ARGS]
    return {**browser_type_launch_args, "args": args}


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    return {**browser_context_args, "viewport": {"width": 1280, "height": 720}}


def collect_errors(page):
    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))
    return errors


@pytest.fixture
def errors(page):
    return collect_errors(page)
