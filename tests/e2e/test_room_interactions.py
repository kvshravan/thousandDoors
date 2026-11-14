import math

import pytest
from playwright.sync_api import Page, expect

from .helpers import click_object, info, open_room, point_for, wait_camera_settled


def panel(page: Page):
    return page.get_by_test_id("room-panel")


def states(page: Page) -> dict:
    return info(page)["scene"]["states"]


def test_every_interaction_type_has_a_handler_and_a_verb(page: Page, errors):
    open_room(page)
    keys = page.evaluate(
        """async () => {
            const m = await import('/static/js/ui/interactions.js');
            const ctx = { getScene: () => null, getRoom: () => null };
            const handlers = Object.keys(m.createInteractionRegistry(ctx)).sort();
            return { handlers, verbs: Object.keys(m.INTERACTION_VERBS).sort() };
        }"""
    )
    assert keys["handlers"] == keys["verbs"]
    assert errors == []


def test_desk_shows_the_owner_profile(page: Page, errors):
    open_room(page)
    click_object(page, "desk")

    expect(panel(page)).to_be_visible()
    expect(panel(page)).to_contain_text("About the owner")
    expect(panel(page)).to_contain_text("@mira")
    expect(panel(page)).to_contain_text("Online · Repotting the monstera")
    expect(panel(page)).to_contain_text("Illustrator. Plant parent.")
    expect(panel(page).locator(".panel-chips li")).to_have_text(
        ["art", "plants", "lo-fi", "ceramics"]
    )
    assert errors == []


def test_poster_lists_interests(page: Page, errors):
    open_room(page)
    click_object(page, "poster-interests")

    expect(panel(page)).to_contain_text("Things I love")
    expect(panel(page).locator(".panel-list li")).to_have_count(4)
    expect(panel(page)).to_contain_text("Botanical illustration")
    assert errors == []


def test_bookshelf_shows_its_collection(page: Page, errors):
    open_room(page)
    click_object(page, "bookcase-1")

    expect(panel(page)).to_contain_text("Mira's bookshelf")
    expect(panel(page).locator(".collection-item")).to_have_count(4)
    expect(panel(page)).to_contain_text("A Field Guide to Houseplants")
    assert errors == []


def test_tv_shows_whats_on_without_external_embeds(page: Page, errors):
    open_room(page)
    click_object(page, "tv")

    expect(panel(page)).to_contain_text("Rain on a Greenhouse")
    expect(panel(page).locator(".tv-screen")).to_be_visible()
    assert panel(page).locator("iframe").count() == 0

    safe = page.evaluate(
        """async () => {
            const { isSafeEmbedUrl } = await import('/static/js/ui/panels.js');
            return [
                'https://www.youtube-nocookie.com/embed/abc123XYZ',
                'https://www.youtube.com/embed/abc123XYZ',
                'javascript:alert(1)',
                'https://www.youtube-nocookie.com/embed/abc123XYZ?autoplay=1',
            ].map(isSafeEmbedUrl);
        }"""
    )
    assert safe == [True, False, False, False]
    assert errors == []


def test_record_player_plays_and_pauses(page: Page, errors):
    open_room(page)
    click_object(page, "record-player")
    expect(panel(page)).to_contain_text("Morning Repotting")
    toggle = page.get_by_test_id("music-toggle")
    expect(toggle).to_have_text("Play")

    toggle.click()
    expect(toggle).to_have_text("Pause")
    assert info(page)["music"] == {
        "playing": True,
        "title": "Morning Repotting",
        "sourceId": "record-player",
    }
    assert states(page)["record-player"]["playing"] is True

    page.keyboard.press("Escape")
    assert info(page)["music"]["playing"] is True, "music keeps playing after closing the panel"

    click_object(page, "record-player")
    page.get_by_test_id("music-toggle").click()
    expect(page.get_by_test_id("music-toggle")).to_have_text("Play")
    assert info(page)["music"]["playing"] is False
    assert states(page)["record-player"]["playing"] is False
    assert errors == []


def test_leaving_the_room_stops_the_music(page: Page, errors):
    open_room(page)
    click_object(page, "record-player")
    page.get_by_test_id("music-toggle").click()

    page.evaluate("() => window.__doors.destroy()")

    assert info(page)["music"]["playing"] is False
    assert errors == []


def test_noticeboard_post_is_pinned_and_kept(page: Page, errors):
    open_room(page)
    assert states(page)["noticeboard"]["notes"] == 3
    click_object(page, "noticeboard")
    form = page.get_by_test_id("note-form")

    form.get_by_role("button", name="Pin note").click()
    expect(panel(page).locator(".note")).to_have_count(3)

    form.get_by_label("Your name").fill("Sam")
    form.get_by_label("Your note").fill('Love the plants <img src=x onerror="window.__pwned=1">')
    form.get_by_role("button", name="Pin note").click()

    notes = panel(page).locator(".note")
    expect(notes).to_have_count(4)
    expect(notes.last).to_contain_text('<img src=x onerror="window.__pwned=1">')
    expect(notes.last).to_contain_text("— Sam")
    expect(panel(page)).to_contain_text("Pinned!")
    assert panel(page).locator(".note img").count() == 0
    assert page.evaluate("() => window.__pwned") is None
    assert states(page)["noticeboard"]["notes"] == 4

    open_room(page)
    assert states(page)["noticeboard"]["notes"] == 4, "notes survive a reload"
    click_object(page, "noticeboard")
    expect(panel(page).locator(".note")).to_have_count(4)
    assert errors == []


def test_notes_are_kept_per_room(page: Page, errors):
    open_room(page)
    click_object(page, "noticeboard")
    page.get_by_test_id("note-form").get_by_label("Your note").fill("Hi Mira")
    page.get_by_role("button", name="Pin note").click()

    open_room(page, "/room/jun?quality=low")
    assert states(page)["noticeboard"]["notes"] == 1
    assert errors == []


def test_visitors_can_leave_a_gift(page: Page, errors):
    open_room(page)
    assert states(page)["gift-table"]["gifts"] == 1
    click_object(page, "gift-table")
    expect(panel(page).locator(".gift-list li")).to_have_text(["🌷 Flower from Jun"])

    form = page.get_by_test_id("gift-form")
    form.get_by_label("Your name").fill("Sam")
    form.get_by_role("button", name="Cup of tea").click()

    expect(panel(page).locator(".gift-list li")).to_have_text(
        ["🌷 Flower from Jun", "🍵 Cup of tea from Sam"]
    )
    expect(panel(page)).to_contain_text("Your gift is on the table.")
    assert states(page)["gift-table"]["gifts"] == 2
    assert errors == []


def test_sitting_on_the_couch_and_standing_up(page: Page, errors):
    start = open_room(page)["scene"]["camera"]["position"]
    stand = page.get_by_test_id("stand-up")
    expect(stand).to_be_hidden()

    click_object(page, "couch")
    seated = wait_camera_settled(page)

    assert info(page)["scene"]["seatedOn"] == "couch"
    expect(page.get_by_test_id("room-tooltip")).to_be_hidden()
    expect(stand).to_be_visible()
    assert math.dist(
        (seated["position"]["x"], seated["position"]["y"], seated["position"]["z"]),
        (1.8, 1.15, 0.9),
    ) == pytest.approx(0, abs=0.1)

    stand.click()
    home = wait_camera_settled(page)
    expect(stand).to_be_hidden()
    assert info(page)["scene"]["seatedOn"] is None
    for axis in "xyz":
        assert home["position"][axis] == pytest.approx(start[axis], abs=0.02)
    assert errors == []


def test_secret_chest_is_for_friends_only(page: Page, errors):
    data = open_room(page)
    assert data["scene"]["permissions"]["chest"] == "friends"
    assert point_for(page, "chest") is None, "strangers can't even hover the chest"

    open_room(page, "/room?quality=low&as=friend")
    click_object(page, "chest")

    expect(panel(page)).to_contain_text("Sketchbook No. 7")
    expect(panel(page)).to_contain_text("a real friend")
    assert states(page)["chest"]["open"] is True

    page.keyboard.press("Escape")
    expect(panel(page)).to_be_hidden()
    # The dialog's "close" event (which shuts the lid) fires just after it hides.
    page.wait_for_function("() => window.__doors.info().scene.states.chest.open === false")
    assert errors == []


def test_window_cycles_the_view(page: Page, errors):
    open_room(page)
    assert states(page)["window"]["scene"] == "day"

    click_object(page, "window")
    page.wait_for_function("() => window.__doors.info().scene.states.window.scene === 'evening'")
    click_object(page, "window")
    page.wait_for_function("() => window.__doors.info().scene.states.window.scene === 'night'")
    click_object(page, "window")
    page.wait_for_function("() => window.__doors.info().scene.states.window.scene === 'day'")
    assert errors == []


def test_door_shows_nameplate_and_leads_out(page: Page, errors, base_url):
    open_room(page)
    click_object(page, "door")

    expect(panel(page)).to_contain_text("@mira")
    expect(panel(page)).to_contain_text("Front door")
    page.get_by_test_id("leave-room").click()

    expect(page).to_have_url(f"{base_url}/")
    assert errors == []
