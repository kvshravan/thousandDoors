import pytest
from playwright.sync_api import Page

from .helpers import info, open_room

LANDSCAPES = ["countryside", "beach", "forest", "city", "snow", "desert"]

# Budgets with headroom over today's numbers (about 120 draw calls, 6.5k triangles,
# 1.5 MB, 67 requests for Mira's room). They exist to catch regressions, such as
# a model that is far too detailed or every catalogue model being downloaded.
MAX_DRAW_CALLS = 300
MAX_TRIANGLES = 100_000
MAX_GEOMETRIES = 160
MAX_TEXTURES = 24
MAX_BYTES = 2_500_000
MAX_REQUESTS = 90


def test_room_stays_within_the_rendering_budget(page: Page, errors):
    for path in ("/room", "/room/jun"):
        engine = open_room(page, path)["engine"]
        assert 0 < engine["render"]["calls"] <= MAX_DRAW_CALLS, path
        assert 0 < engine["render"]["triangles"] <= MAX_TRIANGLES, path
        assert engine["memory"]["geometries"] <= MAX_GEOMETRIES, path
        assert engine["memory"]["textures"] <= MAX_TEXTURES, path
        assert engine["pixelRatio"] <= 2
    assert errors == []


@pytest.mark.parametrize("landscape", LANDSCAPES)
def test_outside_stays_within_the_rendering_budget(page: Page, errors, landscape):
    open_room(page, "/room?as=owner")
    page.evaluate(
        "(land) => { const l = window.__doors.layout(); l.appearance.landscape = land;"
        " localStorage.setItem('doors:v1:mira:layout', JSON.stringify(l)); }",
        landscape,
    )
    open_room(page, "/room?as=owner")
    page.evaluate("() => window.__doors.stepOutside()")
    page.wait_for_function(
        "() => window.__doors.info().outside && window.__doors.state === 'ready'"
    )
    data = info(page)
    assert data["scene"]["landscape"] == landscape
    engine = data["engine"]
    assert 0 < engine["render"]["calls"] <= MAX_DRAW_CALLS
    assert 0 < engine["render"]["triangles"] <= MAX_TRIANGLES
    assert engine["memory"]["geometries"] <= MAX_GEOMETRIES
    assert engine["memory"]["textures"] <= MAX_TEXTURES
    assert data["activeLoops"] == 1, "the room's loop was released"
    assert errors == []


def test_room_download_stays_small(page: Page, errors):
    sizes = {}

    def record(response):
        try:
            sizes[response.url] = len(response.body())
        except Exception:  # Redirects and aborted requests have no body.
            sizes[response.url] = 0

    page.on("response", record)
    open_room(page, "/room")
    page.wait_for_load_state("networkidle")

    assert len(sizes) <= MAX_REQUESTS
    assert sum(sizes.values()) <= MAX_BYTES
    assert not [
        url for url in sizes if "cdn" in url or not url.startswith(page.url.split("/room")[0])
    ]
    assert errors == []
