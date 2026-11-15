import pytest
from playwright.sync_api import Page, expect

from .helpers import click_object, open_room, sign_in
from .test_room_editor import select, wait_camera_settled

SAM = "/room/sam?quality=low"
PLAYERS = (
    "https://open.spotify.com/**",
    "https://w.soundcloud.com/**",
    "https://www.youtube-nocookie.com/**",
)


@pytest.fixture
def no_outside_players(page: Page):
    """The providers' players are stubbed: tests never load anything from outside."""
    for pattern in PLAYERS:
        page.route(
            pattern, lambda route: route.fulfill(body="<p>player</p>", content_type="text/html")
        )


@pytest.mark.parametrize(
    ("link", "expected"),
    [
        (
            "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc",
            ["spotify", "track", "4uLU6hMCjMI75M1A2tKUQC"],
        ),
        (
            "https://open.spotify.com/intl-de/album/1DFixLWuPkv3KT3TnV35m3",
            ["spotify", "album", "1DFixLWuPkv3KT3TnV35m3"],
        ),
        (
            "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M",
            ["spotify", "playlist", "37i9dQZF1DXcBWIGoYBM5M"],
        ),
        ("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42", ["youtube", "video", "dQw4w9WgXcQ"]),
        ("youtu.be/dQw4w9WgXcQ", ["youtube", "video", "dQw4w9WgXcQ"]),
        ("https://music.youtube.com/watch?v=dQw4w9WgXcQ", ["youtube", "video", "dQw4w9WgXcQ"]),
        ("https://youtube.com/shorts/dQw4w9WgXcQ", ["youtube", "video", "dQw4w9WgXcQ"]),
        (
            "https://soundcloud.com/Some-Artist/a-song?in=x",
            ["soundcloud", "track", "some-artist/a-song"],
        ),
        (
            "https://soundcloud.com/artist/sets/late-night",
            ["soundcloud", "playlist", "artist/sets/late-night"],
        ),
        ("https://evil.example/watch?v=dQw4w9WgXcQ", None),
        ("https://open.spotify.com/user/someone", None),
        ("javascript:alert(1)", None),
        ("just some words", None),
    ],
)
def test_pasted_links_become_references(page: Page, link, expected):
    page.goto("/healthz")
    ref = page.evaluate(
        "async (link) => (await import('/static/js/media.js')).parseMediaLink(link)", link
    )
    assert (ref and [ref["provider"], ref["kind"], ref["id"]]) == expected


def test_a_song_and_a_video_from_your_links(page: Page, errors, no_outside_players):
    sign_in(page, username="sam", display_name="Sam")
    open_room(page, SAM)
    page.get_by_test_id("edit-room").click()
    wait_camera_settled(page)

    select(page, "record-player")
    link = page.get_by_test_id("editor-link")
    link.fill("https://www.dailymotion.com/video/x7")
    link.press("Enter")
    expect(page.get_by_test_id("editor-status")).to_contain_text("doesn't look like")
    link.fill("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC")
    link.press("Enter")
    expect(page.get_by_test_id("editor-status")).to_contain_text("Spotify track")

    select(page, "tv")
    link = page.get_by_test_id("editor-link")
    link.fill("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC")
    link.press("Enter")
    expect(page.get_by_test_id("editor-status")).to_contain_text("YouTube link")
    link.fill("https://youtu.be/dQw4w9WgXcQ")
    link.press("Enter")
    expect(page.get_by_test_id("editor-link-clear")).to_be_visible()
    page.get_by_test_id("editor-save").click()
    expect(page.get_by_test_id("editor")).to_be_hidden()

    # A visitor in another browser hears and sees them.
    open_room(page, SAM)
    click_object(page, "record-player")
    embed = page.get_by_test_id("media-embed")
    expect(embed).to_have_attribute(
        "src", "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC"
    )
    expect(page.get_by_role("link", name="Open in Spotify")).to_have_attribute(
        "href", "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"
    )
    page.keyboard.press("Escape")
    click_object(page, "tv")
    expect(page.get_by_test_id("media-embed")).to_have_attribute(
        "src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
    )
    assert errors == []


def test_editing_your_profile_from_the_desk(page: Page, errors):
    sign_in(page, username="sam", display_name="Sam")
    open_room(page, SAM)
    click_object(page, "desk")
    page.get_by_test_id("edit-profile").click()
    page.get_by_test_id("profile-name").fill("Sam Lee")
    page.get_by_test_id("profile-status").fill("Building a door")
    page.get_by_test_id("profile-bio").fill("I like <b>bold</b> rooms.")
    page.get_by_test_id("profile-interests").fill("plants, jazz,  , film")
    page.get_by_test_id("profile-save").click()

    panel = page.get_by_test_id("room-panel")
    expect(panel).to_contain_text("I like <b>bold</b> rooms.")
    expect(panel.get_by_role("listitem")).to_have_text(["plants", "jazz", "film"])
    expect(page.get_by_test_id("room-nameplate")).to_contain_text("Building a door")

    open_room(page, SAM)
    click_object(page, "desk")
    expect(panel).to_contain_text("Sam Lee")
    assert errors == []


def test_only_the_owner_can_edit_the_profile(page: Page, errors):
    open_room(page, "/room?quality=low")
    click_object(page, "desk")
    expect(page.get_by_test_id("room-panel")).to_be_visible()
    expect(page.get_by_test_id("edit-profile")).to_have_count(0)
    assert errors == []


def test_the_door_counts_visitors(page: Page, errors, browser, base_url):
    sign_in(page, username="sam", display_name="Sam")
    open_room(page, SAM)
    click_object(page, "door")
    expect(page.get_by_test_id("visit-count")).to_have_text("0 visitors so far")

    for _ in range(2):
        context = browser.new_context(base_url=base_url)
        visitor = context.new_page()
        open_room(visitor, SAM)
        context.close()

    open_room(page, SAM)
    click_object(page, "door")
    expect(page.get_by_test_id("visit-count")).to_have_text("2 visitors so far")
    assert errors == []
