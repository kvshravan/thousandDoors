import json
import re

import pytest

from app import create_app

THREE_FILES = (
    "/static/vendor/three/build/three.module.min.js",
    "/static/vendor/three/build/three.core.js",
    "/static/vendor/three/examples/jsm/controls/OrbitControls.js",
    "/static/vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js",
    "/static/vendor/three/examples/jsm/loaders/GLTFLoader.js",
    "/static/vendor/three/examples/jsm/utils/BufferGeometryUtils.js",
    "/static/vendor/three/examples/jsm/utils/SkeletonUtils.js",
)

ROOM_MODULES = (
    "/static/js/pages/room.js",
    "/static/js/three/engine.js",
    "/static/js/three/scene-manager.js",
    "/static/js/three/camera-controller.js",
    "/static/js/three/room-scene.js",
    "/static/js/three/room-config.js",
    "/static/js/three/quality.js",
    "/static/js/three/catalog.js",
    "/static/js/three/asset-loader.js",
    "/static/js/three/object-manager.js",
    "/static/js/three/interaction-manager.js",
    "/static/js/three/props/index.js",
    "/static/js/ui/interactions.js",
    "/static/js/ui/photo-viewer.js",
    "/static/js/ui/panel.js",
    "/static/js/ui/panels.js",
    "/static/js/ui/music.js",
    "/static/js/ui/room-store.js",
    "/static/js/three/props/interactive.js",
    "/static/js/three/editor-controller.js",
    "/static/js/three/placement.js",
    "/static/js/three/screen-point.js",
    "/static/js/ui/editor-panel.js",
    "/static/models/furniture/thumbs/lounge-sofa.png",
    "/static/css/room.css",
    "/static/data/catalog.json",
    "/static/data/rooms/mira.json",
    "/static/data/rooms/jun.json",
    "/static/js/permissions.js",
    "/static/models/furniture/bed-double.glb",
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
    assert 'data-testid="photo-viewer"' in html
    assert 'data-testid="room-panel"' in html
    assert 'data-testid="editor"' in html
    assert "/static/js/pages/room.js" in html


def test_room_stage_points_at_data_and_models(client):
    html = client.get("/room").get_data(as_text=True)
    assert 'data-catalog-url="/static/data/catalog.json"' in html
    assert 'data-room-url="/static/data/rooms/mira.json"' in html
    assert 'data-models-url="/static/models/"' in html


def test_named_room_loads_its_own_data(client):
    response = client.get("/room/jun")
    assert response.status_code == 200
    assert 'data-room-url="/static/data/rooms/jun.json"' in response.get_data(as_text=True)


@pytest.mark.parametrize("room_id", ["nobody", "Mira", "..%2Fcatalog", "-mira", "a" * 41])
def test_unknown_or_malformed_room_is_404(client, room_id):
    assert client.get(f"/room/{room_id}").status_code == 404


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
