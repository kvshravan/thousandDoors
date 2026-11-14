import json
import re

import pytest

from app import create_app

THREE_FILES = (
    "/static/vendor/three/build/three.module.min.js",
    "/static/vendor/three/build/three.core.js",
    "/static/vendor/three/examples/jsm/controls/OrbitControls.js",
    "/static/vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js",
)

ROOM_MODULES = (
    "/static/js/pages/room.js",
    "/static/js/three/engine.js",
    "/static/js/three/scene-manager.js",
    "/static/js/three/camera-controller.js",
    "/static/js/three/room-scene.js",
    "/static/js/three/room-config.js",
    "/static/js/three/quality.js",
    "/static/js/three/props/index.js",
    "/static/css/room.css",
)


def _import_map(html: str) -> dict:
    match = re.search(r'<script type="importmap">(.*?)</script>', html, re.S)
    assert match, "room page must declare an import map"
    return json.loads(match.group(1))


def test_room_page_renders(client):
    response = client.get("/room")
    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert 'id="room-stage"' in html
    assert 'data-testid="room-loading"' in html
    assert 'data-testid="room-fallback"' in html
    assert "/static/js/pages/room.js" in html


def test_import_map_points_to_pinned_local_three(client):
    html = client.get("/room").get_data(as_text=True)
    imports = _import_map(html)["imports"]
    assert imports["three"] == "/static/vendor/three/build/three.module.min.js"
    assert imports["three/addons/"] == "/static/vendor/three/examples/jsm/"
    assert "cdn" not in html.lower()


def test_import_map_precedes_module_scripts(client):
    html = client.get("/room").get_data(as_text=True)
    assert html.index('type="importmap"') < html.index('type="module"')


@pytest.mark.parametrize("path", THREE_FILES + ROOM_MODULES)
def test_room_assets_are_served(client, path):
    assert client.get(path).status_code == 200


def test_home_links_to_room(client):
    html = client.get("/").get_data(as_text=True)
    assert 'href="/room"' in html


def test_debug_hooks_enabled_in_testing(client):
    assert 'data-debug="1"' in client.get("/room").get_data(as_text=True)


def test_debug_hooks_disabled_in_production(monkeypatch):
    monkeypatch.setattr("config.ProductionConfig.SECRET_KEY", "prod-secret")
    client = create_app("production").test_client()
    assert "data-debug" not in client.get("/room").get_data(as_text=True)
