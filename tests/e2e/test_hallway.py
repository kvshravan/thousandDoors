import re

from playwright.sync_api import Browser, Page, expect

from .helpers import axe_violations, sign_in
from .test_room import DISABLE_WEBGL

READY = (
    "() => window.__hallway && ['ready', 'unsupported', 'error'].includes(window.__hallway.state)"
)
# Comfortably above today's numbers (about 30 draw calls; 1,150 doors on high quality).
MAX_DRAW_CALLS = 60
MAX_TRIANGLES = 500_000


def open_hallway(page: Page, path: str = "/hallway?quality=low") -> dict:
    page.goto(path)
    page.wait_for_function(READY, timeout=30_000)
    return hallway(page)


def hallway(page: Page) -> dict:
    return page.evaluate("() => window.__hallway.info()")


def scene(page: Page) -> dict:
    return hallway(page)["scene"]


def bring_into_view(page: Page, door: str) -> dict:
    point = page.evaluate("(id) => window.__hallway.bringIntoView(id)", door)
    assert point, f"{door} never came into view"
    return point


def visit_quickly(page: Page) -> None:
    page.evaluate("() => window.__hallway.setArrivalRate(6)")


def test_the_hallway_is_full_of_doors_on_moving_rails(page: Page, errors):
    data = open_hallway(page)
    info = data["scene"]
    assert data["state"] == "ready"
    assert info["mode"] == "overview"
    assert info["doors"] >= 300
    assert info["claimed"] == 2, "Mira's and Jun's doors are among them"
    assert {r["id"] for r in info["rails"]} >= {"swoop", "coaster"}

    before = scene(page)["time"]
    page.wait_for_function("(t) => window.__hallway.info().scene.time > t + 0.3", arg=before)
    engine = hallway(page)["engine"]
    assert 0 < engine["render"]["calls"] <= MAX_DRAW_CALLS
    assert 0 < engine["render"]["triangles"] <= MAX_TRIANGLES
    assert errors == []


def test_every_door_is_also_a_link(page: Page, errors):
    open_hallway(page)
    page.get_by_test_id("find-door").click()
    dialog = page.get_by_test_id("find-dialog")
    expect(dialog).to_be_visible()
    links = dialog.get_by_role("link")
    assert links.count() >= 3, "two rooms and the claim link"
    expect(dialog.get_by_role("link", name=re.compile("Mira"))).to_have_attribute("href", "/room")
    expect(dialog.get_by_role("link", name=re.compile("Jun"))).to_have_attribute(
        "href", "/room/jun"
    )

    page.get_by_test_id("find-search").fill("ju")
    expect(dialog.get_by_role("link", name=re.compile("Mira"))).to_be_hidden()
    expect(dialog.get_by_role("link", name=re.compile("Jun"))).to_be_visible()
    page.get_by_test_id("find-search").fill("nobody")
    expect(dialog.get_by_text("No door has that name yet.")).to_be_visible()
    assert errors == []


def test_picking_a_door_and_going_through_it(page: Page, errors):
    open_hallway(page)
    point = bring_into_view(page, "claimed")
    page.mouse.click(point["x"], point["y"])

    card = page.get_by_test_id("door-card")
    expect(card).to_be_visible()
    name = "Mira" if point["id"] == "mira" else "Jun"
    expect(card).to_contain_text(f"{name}’s door")
    visit_quickly(page)
    page.get_by_test_id("door-visit").click()

    page.wait_for_function("() => window.__hallway?.info().scene.arrival?.door", timeout=10_000)
    page.wait_for_url(re.compile(r"/room(/jun)?$"), timeout=30_000)
    page.wait_for_function("() => window.__doors?.state === 'ready'", timeout=30_000)
    assert "from=hallway" not in page.url, "a reload shouldn't replay the arrival"
    expect(page.get_by_test_id("room-loading")).to_be_hidden()
    assert errors == []


def test_an_unclaimed_door_can_be_claimed(page: Page, errors):
    open_hallway(page)
    point = bring_into_view(page, "unclaimed")
    page.mouse.click(point["x"], point["y"])
    card = page.get_by_test_id("door-card")
    expect(card).to_contain_text("unclaimed")
    expect(page.get_by_test_id("door-visit")).to_have_attribute("href", "/welcome")
    expect(page.get_by_test_id("door-visit")).to_have_text("Claim it")

    page.keyboard.press("Escape")
    expect(card).to_be_hidden()
    assert errors == []


def test_riding_a_door_and_hopping_to_another(page: Page, errors):
    open_hallway(page)
    page.get_by_test_id("mode-ride").click()
    hud = page.get_by_test_id("ride-hud")
    expect(hud).to_be_visible()
    expect(page.get_by_test_id("mode-ride")).to_have_attribute("aria-pressed", "true")
    page.wait_for_function("() => window.__hallway.info().scene.mode === 'ride'", timeout=15_000)
    first = scene(page)
    assert first["rider"] in ("mira", "jun"), "rides a real door on the coaster when there is one"
    expect(page.get_by_test_id("ride-name")).to_have_text(
        "Mira" if first["rider"] == "mira" else "Jun"
    )

    # The camera travels with the door.
    start = first["camera"]["position"]
    page.wait_for_function(
        "(p) => window.__hallway.info().scene.camera.position"
        ".some((v, i) => Math.abs(v - p[i]) > 1)",
        arg=start,
        timeout=15_000,
    )

    # Tapping another door hops onto it.
    point = bring_into_view(page, "unclaimed")
    page.mouse.click(point["x"], point["y"])
    page.wait_for_function(
        "(r) => window.__hallway.info().scene.rider !== r", arg=first["rider"], timeout=10_000
    )
    expect(page.get_by_test_id("ride-name")).to_have_text("an unclaimed door")

    page.evaluate("() => window.__hallway.setTimeScale(1)")
    page.get_by_test_id("hop-off").click()
    expect(hud).to_be_hidden()
    page.wait_for_function(
        "() => window.__hallway.info().scene.mode === 'overview'", timeout=15_000
    )
    assert scene(page)["rider"] is None
    assert errors == []


def test_finding_a_door_with_the_keyboard(page: Page, errors):
    open_hallway(page)
    visit_quickly(page)
    page.get_by_test_id("find-door").focus()
    page.keyboard.press("Enter")
    expect(page.get_by_test_id("find-search")).to_be_focused()
    page.keyboard.type("jun")
    page.keyboard.press("Tab")
    expect(page.get_by_role("link", name=re.compile("Jun"))).to_be_focused()
    page.keyboard.press("Enter")
    page.wait_for_url(re.compile(r"/room/jun$"), timeout=30_000)
    assert errors == []


def test_music_is_on_by_default_and_turning_it_off_is_remembered(page: Page, errors):
    open_hallway(page)
    toggle = page.get_by_test_id("sound-toggle")
    expect(toggle).to_have_attribute("aria-pressed", "true")
    # Browsers wait for a click or key press before making a sound.
    assert hallway(page)["music"]["playing"] is False

    page.get_by_test_id("mode-ride").click()
    page.wait_for_function("() => window.__hallway.info().music.context === 'running'")
    assert hallway(page)["music"]["mode"] == "ride"
    page.wait_for_function("() => window.__hallway.info().music.level > 0.005", timeout=10_000)
    page.wait_for_function("() => window.__hallway.info().music.tempo > 64", timeout=15_000)

    toggle.click()
    expect(toggle).to_have_attribute("aria-pressed", "false")
    assert hallway(page)["music"]["playing"] is False
    page.wait_for_function("() => window.__hallway.info().music.level < 0.001", timeout=10_000)
    assert page.evaluate("() => localStorage.getItem('doors:hallway-music')") == "off"

    # Next visit: it stays off, clicks and all.
    open_hallway(page)
    expect(toggle).to_have_attribute("aria-pressed", "false")
    page.get_by_test_id("find-door").click()
    assert hallway(page)["music"]["playing"] is False
    page.keyboard.press("Escape")
    toggle.click()
    assert hallway(page)["music"]["playing"] is True
    assert errors == []


def test_hallway_has_no_accessibility_violations(page: Page, errors):
    open_hallway(page)
    assert axe_violations(page) == []
    point = bring_into_view(page, "claimed")
    page.mouse.click(point["x"], point["y"])
    expect(page.get_by_test_id("door-card")).to_be_visible()
    # Contrast is only fair to measure once the card has finished fading in.
    page.wait_for_function("() => document.getAnimations().every((a) => a.playState !== 'running')")
    assert axe_violations(page) == []
    page.get_by_test_id("find-door").click()
    assert axe_violations(page) == []
    assert errors == []


def test_reduced_motion_keeps_the_doors_still(browser: Browser, base_url: str):
    context = browser.new_context(
        base_url=base_url, reduced_motion="reduce", viewport={"width": 1280, "height": 720}
    )
    page = context.new_page()
    open_hallway(page)
    expect(page.get_by_test_id("mode-ride")).to_be_disabled()
    page.wait_for_timeout(500)
    assert scene(page)["time"] == 0, "the doors don't move"

    page.get_by_test_id("find-door").click()
    page.get_by_role("link", name=re.compile("Jun")).click()
    page.wait_for_url(re.compile(r"/room/jun$"), timeout=10_000)
    context.close()


def test_without_webgl_the_doors_are_a_list(page: Page, errors):
    page.add_init_script(DISABLE_WEBGL)
    page.goto("/hallway")
    page.wait_for_function(READY)
    fallback = page.get_by_test_id("hallway-fallback")
    expect(fallback).to_be_visible()
    expect(fallback.get_by_role("link", name=re.compile("Jun"))).to_have_attribute(
        "href", "/room/jun"
    )
    expect(page.get_by_test_id("hallway-dock")).to_be_hidden()
    assert errors == []


def test_your_own_door_hangs_in_the_hallway(page: Page, errors):
    sign_in(page, username="sam", display_name="Sam")
    data = open_hallway(page)
    assert data["scene"]["claimed"] == 3
    page.get_by_test_id("find-door").click()
    expect(page.get_by_role("link", name=re.compile("Sam"))).to_have_attribute("href", "/room/sam")
    assert errors == []


def test_tapping_a_door_on_a_phone(browser: Browser, base_url: str):
    context = browser.new_context(
        base_url=base_url,
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
    )
    page = context.new_page()
    open_hallway(page)
    rights = page.locator(".hallway-dock > *").evaluate_all(
        "(els) => els.filter((e) => !e.hidden).map((e) => e.getBoundingClientRect().right)"
    )
    assert max(rights) <= 390, "the dock fits on a phone"
    point = bring_into_view(page, "claimed")
    page.touchscreen.tap(point["x"], point["y"])
    expect(page.get_by_test_id("door-card")).to_be_visible()
    context.close()


def test_the_home_page_has_rails_behind_the_words(page: Page, errors):
    page.goto("/")
    page.wait_for_function("() => window.__home?.ready === true", timeout=30_000)
    expect(page.get_by_test_id("home-stage")).to_have_class(re.compile("is-ready"))
    info = page.evaluate("() => window.__home.info()")
    assert info["scene"]["mode"] == "hero"
    assert info["scene"]["claimed"] == 2
    # The doors are only decoration: the buttons over them still work.
    page.get_by_test_id("enter-hallway").click()
    expect(page).to_have_url(re.compile(r"/hallway$"))
    assert errors == []
