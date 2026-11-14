import json
import re
import struct
import zlib
from pathlib import Path

import pytest
from playwright.sync_api import Page, expect

from .helpers import info, open_room, point_for
from .test_room_editor import enter_edit, layout, obj, select

STATIC = Path(__file__).resolve().parents[2] / "static"
CATALOG = json.loads((STATIC / "data" / "catalog.json").read_text(encoding="utf-8"))
OWNER = "/room?quality=low&as=owner"
JUN_OWNER = "/room/jun?quality=low&as=owner"


def png(width: int = 48, height: int = 32, rgb: tuple[int, int, int] = (200, 80, 60)) -> bytes:
    """A small solid-colour PNG, made without image libraries."""

    def chunk(kind: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(kind + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", crc)

    rows = b"".join(b"\x00" + bytes(rgb) * width for _ in range(height))
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(rows))
        + chunk(b"IEND", b"")
    )


def light(page: Page, object_id: str) -> dict:
    return info(page)["scene"]["lights"][object_id]


def state(page: Page, object_id: str) -> dict:
    return info(page)["scene"]["states"][object_id]


def wait_state(page: Page, object_id: str, expression: str) -> None:
    page.wait_for_function(
        "() => { const s = window.__doors.info().scene.states"
        f"[{object_id!r}]; return s && {expression}; }}"
    )


# ---- Catalogue ----


def test_every_catalogue_item_can_be_added(page: Page, errors):
    enter_edit(page)
    ids = [
        item["id"]
        for item in CATALOG["items"]
        if item.get("addable", True) and item["placement"] != "fixed"
    ]
    assert len(ids) >= 110
    results = page.evaluate(
        """async (ids) => {
            const out = {};
            for (const id of ids) out[id] = await window.__doors.editorTryAdd(id);
            return out;
        }""",
        ids,
    )
    assert [i for i, r in results.items() if r is None] == [], "every item finds a spot"
    assert [i for i, r in results.items() if r["placeholder"]] == [], "and builds"
    assert info(page)["scene"]["failed"] == []
    assert errors == []


# ---- Lights ----


def test_lights_change_colour_brightness_and_effect(page: Page, errors):
    enter_edit(page, JUN_OWNER)
    select(page, "neon-sign")
    expect(page.get_by_test_id("editor-item")).to_be_visible()
    assert light(page, "neon-sign")["color"] == "purple"

    page.get_by_role("button", name="Light colour: Teal").click()
    assert light(page, "neon-sign")["color"] == "teal"
    expect(page.get_by_role("button", name="Light colour: Teal")).to_have_attribute(
        "aria-pressed", "true"
    )

    page.get_by_role("slider", name="Brightness").evaluate(
        "(el) => { el.value = '1.5'; el.dispatchEvent(new Event('change', { bubbles: true })); }"
    )
    assert light(page, "neon-sign")["brightness"] == 1.5

    page.get_by_role("button", name="Effect: Twinkle").click()
    assert light(page, "neon-sign")["animated"] is True
    frames = info(page)["engine"]["frames"]
    page.wait_for_function("(f) => window.__doors.info().engine.frames >= f + 3", arg=frames)

    page.get_by_role("switch", name="Light").click()
    assert light(page, "neon-sign")["on"] is False
    page.get_by_role("switch", name="Light").click()
    assert light(page, "neon-sign")["on"] is True

    page.get_by_test_id("editor-save").click()
    expect(page.get_by_test_id("editor")).to_be_hidden()
    open_room(page, JUN_OWNER)
    assert obj(page, "neon-sign")["customData"]["light"] == {
        "color": "teal",
        "effect": "twinkle",
        "brightness": 1.5,
    }
    assert light(page, "neon-sign")["animated"] is True
    assert errors == []


def test_a_light_switched_off_in_the_editor_stays_off(page: Page, errors):
    enter_edit(page)
    select(page, "floor-lamp")
    page.get_by_role("switch", name="Light").click()
    page.get_by_test_id("editor-save").click()
    data = open_room(page, OWNER)
    assert data["scene"]["lamps"]["floor-lamp"] is False
    assert obj(page, "floor-lamp")["customData"] == {"on": False}
    assert errors == []


def test_neon_sign_text(page: Page, errors):
    enter_edit(page, JUN_OWNER)
    select(page, "neon-sign")
    box = page.get_by_test_id("editor-text")
    expect(box).to_have_value("night owl")

    box.fill("good vibes only, always and forever")
    page.get_by_role("button", name="Update").click()
    wait_state(page, "neon-sign", "s.text.startsWith('good vibes')")
    text = obj(page, "neon-sign")["customData"]["text"]
    assert text == "good vibes only, alw", "trimmed to the sign's 20 characters"
    assert light(page, "neon-sign")["color"] == "purple", "the light keeps its settings"
    assert errors == []


# ---- Photos ----


def test_photo_string_takes_uploaded_photos(page: Page, errors):
    enter_edit(page)
    select(page, "photo-string")
    current = page.get_by_role("list", name="Photos on the string").get_by_role("listitem")
    expect(current).to_have_count(4)

    page.get_by_role("button", name=re.compile("^Remove photo 1")).click()
    wait_state(page, "photo-string", "s.photos === 3")

    page.get_by_test_id("photo-upload").set_input_files(
        files=[{"name": "me.png", "mimeType": "image/png", "buffer": png()}]
    )
    wait_state(page, "photo-string", "s.photos === 4 && s.shown === 4")
    refs = obj(page, "photo-string")["customData"]["photos"]
    assert refs[-1].startswith("upload:")
    expect(page.get_by_role("button", name="Add photo: me.png")).to_be_visible()

    page.get_by_test_id("photo-upload").set_input_files(
        files=[{"name": "notes.txt", "mimeType": "text/plain", "buffer": b"hello"}]
    )
    expect(page.get_by_test_id("editor-status")).to_contain_text("Choose a PNG")
    assert len(obj(page, "photo-string")["customData"]["photos"]) == 4

    page.get_by_test_id("editor-save").click()
    expect(page.get_by_test_id("editor")).to_be_hidden()

    # Uploads are kept in this browser, so they're still there after a reload.
    open_room(page)
    wait_state(page, "photo-string", "s.shown === 4")
    page.get_by_test_id("things-list").click()
    page.get_by_role("button", name=re.compile("^Summer photos")).click()
    photos = page.get_by_test_id("room-panel").locator(".photo-grid img")
    expect(photos).to_have_count(4)
    assert photos.nth(3).get_attribute("src").startswith("blob:")
    assert errors == []


def test_a_frame_can_show_a_different_photo(page: Page, errors):
    enter_edit(page)
    select(page, "photo-sunset")
    page.get_by_role("button", name="Use photo: Waves").click()
    page.wait_for_function(
        "() => window.__doors.layout().objects.find((o) => o.id === 'photo-sunset')"
        ".customData.imageUrl.endsWith('waves.svg')"
    )
    expect(page.get_by_role("button", name="Use photo: Waves")).to_have_attribute(
        "aria-pressed", "true"
    )
    assert errors == []


# ---- Landscapes and the outside ----


def test_landscape_shows_through_the_window_and_outside(page: Page, errors):
    enter_edit(page)
    page.get_by_role("tab", name="Look").click()
    page.get_by_role("button", name="Outside: Beach house").click()
    assert state(page, "window")["landscape"] == "beach"
    assert layout(page)["appearance"]["landscape"] == "beach"
    page.get_by_test_id("editor-save").click()
    expect(page.get_by_test_id("editor")).to_be_hidden()

    page.get_by_test_id("things-list").click()
    page.get_by_role("button", name=re.compile("^Door")).click()
    page.get_by_test_id("step-outside").click()
    page.wait_for_function(
        "() => window.__doors.info().outside && window.__doors.state === 'ready'"
    )

    scene = info(page)["scene"]
    assert (scene["kind"], scene["landscape"], scene["time"]) == ("exterior", "beach", "day")
    expect(page.get_by_test_id("go-inside")).to_be_visible()
    expect(page.get_by_test_id("edit-room")).to_be_hidden()
    assert page.evaluate("() => window.__doors.samplePixels()")["distinctColors"] > 20
    expect(page.get_by_test_id("room-announcer")).to_contain_text("outside Mira's house")

    # The things list leads back in through the front door.
    page.get_by_test_id("things-list").click()
    page.get_by_role("button", name=re.compile("^Front door.*Go inside")).click()
    page.wait_for_function(
        "() => !window.__doors.info().outside && window.__doors.state === 'ready'"
    )
    assert info(page)["scene"]["kind"] == "room"
    expect(page.get_by_test_id("edit-room")).to_be_visible()

    # So does clicking the door itself.
    page.evaluate("() => window.__doors.stepOutside()")
    page.wait_for_function(
        "() => window.__doors.info().outside && window.__doors.state === 'ready'"
    )
    point = point_for(page, "front-door")
    assert point, "the front door is in view"
    page.mouse.click(point["x"], point["y"])
    page.wait_for_function(
        "() => !window.__doors.info().outside && window.__doors.state === 'ready'"
    )
    assert errors == []


@pytest.mark.parametrize("room", ["mira", "jun"])
def test_visitors_can_step_outside(page: Page, errors, room):
    open_room(page, f"/room/{room}?quality=low")
    page.evaluate("() => window.__doors.stepOutside()")
    page.wait_for_function(
        "() => window.__doors.info().outside && window.__doors.state === 'ready'"
    )
    scene = info(page)["scene"]
    assert scene["landscape"] == {"mira": "countryside", "jun": "city"}[room]
    assert scene["time"] == {"mira": "day", "jun": "night"}[room]
    page.get_by_test_id("go-inside").click()
    page.wait_for_function(
        "() => !window.__doors.info().outside && window.__doors.state === 'ready'"
    )
    assert errors == []
