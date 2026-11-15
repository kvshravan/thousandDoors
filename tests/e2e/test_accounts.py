import json
import re
import time

from playwright.sync_api import Browser, Page, Route, expect

from .conftest import collect_errors
from .helpers import TEST_USER_ID, info, open_room, sign_in
from .test_room_customize import png
from .test_room_editor import obj, select, wait_camera_settled

SUPABASE = "https://supabase.test"
ALEX_ID = "00000000-0000-4000-8000-0000000000aa"


def session_for(page: Page, user_id: str = TEST_USER_ID, email: str = "sam@example.com") -> dict:
    return page.request.post("/__test__/session", data={"id": user_id, "email": email}).json()


def test_signing_in_with_a_magic_link_and_choosing_a_username(page: Page, errors):
    sent = []

    def otp(route: Route):
        sent.append({"url": route.request.url, "body": json.loads(route.request.post_data)})
        route.fulfill(status=200, json={})

    page.route(f"{SUPABASE}/auth/v1/otp**", otp)
    page.goto("/")
    page.get_by_test_id("sign-in-link").click()
    expect(page).to_have_url(re.compile(r"/signin\?next=%2F$"))
    expect(page.get_by_test_id("signin-form")).to_have_attribute("data-ready", "true")

    page.get_by_test_id("signin-submit").click()
    expect(page.get_by_test_id("signin-status")).to_contain_text("Enter your email")
    page.get_by_test_id("signin-email").fill("sam@example.com")
    page.get_by_test_id("signin-submit").click()
    expect(page.get_by_test_id("signin-status")).to_contain_text("Check sam@example.com")
    assert sent[0]["body"] == {"email": "sam@example.com", "create_user": True}
    assert "redirect_to=" in sent[0]["url"] and "%2Fsignin" in sent[0]["url"]
    assert sent[0]["url"].startswith(f"{SUPABASE}/auth/v1/otp")

    # Following the emailed link: Supabase redirects back with the session in the fragment.
    session = session_for(page)
    page.goto(
        f"/signin#access_token={session['access_token']}&refresh_token=r1"
        f"&expires_at={session['expires_at']}&token_type=bearer&type=magiclink"
    )
    expect(page).to_have_url(re.compile(r"/welcome\?next=%2F$"))
    username = page.get_by_test_id("welcome-username")
    expect(username).to_have_value("sam")

    username.fill("mira")
    page.get_by_test_id("welcome-name").fill("Sam")
    page.get_by_test_id("welcome-submit").click()
    expect(page.get_by_test_id("welcome-status")).to_contain_text("taken")

    username.fill("sam")
    page.get_by_test_id("welcome-submit").click()
    # A brand-new room opens straight into the editor, with decorating tips on top.
    expect(page).to_have_url(re.compile(r"/room/sam(\?new=1)?$"))
    page.wait_for_function("() => window.__doors && window.__doors.state === 'ready'")
    expect(page.get_by_test_id("room-panel")).to_contain_text("Make it yours")
    expect(page.get_by_test_id("editor")).to_be_visible()
    page.get_by_test_id("guide-done").click()
    expect(page.get_by_test_id("room-panel")).to_be_hidden()
    expect(page).to_have_url(re.compile(r"/room/sam$"))
    page.get_by_test_id("editor-cancel").click()
    data = open_room(page, "/room/sam?quality=low")
    assert data["saveMode"] == "account"
    assert data["owner"]["displayName"] == "Sam"
    expect(page.get_by_test_id("edit-room")).to_be_visible()
    assert "#" not in page.url, "the tokens don't stay in the address bar"
    # The browser logs the "username taken" response; that's expected.
    assert [e for e in errors if "409" not in e] == []


def test_signing_in_with_google(page: Page, errors):
    page.route(f"{SUPABASE}/auth/v1/authorize**", lambda route: route.fulfill(body="google"))
    page.goto("/signin?next=%2Froom%2Fjun")
    expect(page.get_by_test_id("signin-form")).to_have_attribute("data-ready", "true")
    with page.expect_navigation(url=re.compile(r"/auth/v1/authorize")) as navigation:
        page.get_by_test_id("signin-google").click()
    url = navigation.value.url
    assert url.startswith(f"{SUPABASE}/auth/v1/authorize?provider=google&redirect_to=")
    assert "%2Fsignin" in url

    # Supabase sends the browser back with the session in the fragment, like a magic link.
    session = page.request.post(
        "/__test__/session",
        data={"id": TEST_USER_ID, "email": "sam.lee@gmail.com", "name": "Sam Lee"},
    ).json()
    page.goto(
        f"/signin#access_token={session['access_token']}&refresh_token=r1"
        f"&expires_at={session['expires_at']}&token_type=bearer"
    )
    expect(page).to_have_url(re.compile(r"/welcome\?next=%2Froom%2Fjun$"))
    expect(page.get_by_test_id("welcome-username")).to_have_value("samlee")
    expect(page.get_by_test_id("welcome-name")).to_have_value("Sam Lee")
    page.get_by_test_id("welcome-submit").click()
    expect(page).to_have_url(re.compile(r"/room/jun$"))
    assert errors == []


def test_a_link_error_is_explained(page: Page, errors):
    page.goto("/signin#error=access_denied&error_description=Email+link+is+invalid+or+has+expired")
    expect(page).to_have_url(re.compile(r"/signin\?error="))
    expect(page.get_by_test_id("signin-status")).to_contain_text("Email link is invalid")
    assert errors == []


def test_owner_saves_to_the_account_and_visitors_see_it(browser: Browser, page: Page, errors):
    sign_in(page, username="sam", display_name="Sam")
    open_room(page, "/room/sam?quality=low")
    page.get_by_test_id("edit-room").click()
    wait_camera_settled(page)
    page.get_by_role("tab", name="Look").click()
    page.get_by_role("button", name="Walls: Blush").click()
    select(page, "couch")
    page.get_by_role("button", name="Colour: Teal").click()
    page.wait_for_function(
        "() => window.__doors.layout().objects.find((o) => o.id === 'couch')?.customData?.color"
    )
    page.get_by_test_id("editor-save").click()
    expect(page.get_by_test_id("editor")).to_be_hidden()
    expect(page.get_by_test_id("room-announcer")).to_contain_text("Your room is saved.")
    assert info(page)["savedLayout"] is None, "saved to the account, not the browser"

    visitor_context = browser.new_context(base_url=page.url.split("/room")[0])
    visitor = visitor_context.new_page()
    visitor_errors = collect_errors(visitor)
    data = open_room(visitor, "/room/sam?quality=low")
    assert data["scene"]["appearance"]["wallpaper"] == "blush"
    assert obj(visitor, "couch")["customData"] == {"color": "teal"}
    assert data["viewer"]["relationship"] == "stranger"
    expect(visitor.get_by_test_id("edit-room")).to_be_hidden()
    assert visitor_errors == []
    visitor_context.close()
    assert errors == []


def test_a_failed_save_keeps_the_edits(page: Page, errors):
    sign_in(page, username="sam")
    open_room(page, "/room/sam?quality=low")
    page.route(
        "**/api/rooms/sam/layout",
        lambda route: route.fulfill(
            status=500, json={"error": {"code": "server_error", "message": "Unexpected error."}}
        ),
    )
    page.get_by_test_id("edit-room").click()
    page.get_by_role("tab", name="Look").click()
    page.get_by_role("button", name="Walls: Sage").click()
    page.get_by_test_id("editor-save").click()
    expect(page.get_by_test_id("editor-status")).to_contain_text("Unexpected error")
    expect(page.get_by_test_id("editor")).to_be_visible()
    assert info(page)["scene"]["appearance"]["wallpaper"] == "sage"
    assert [e for e in errors if "500" not in e] == []


def test_other_peoples_rooms_are_read_only(page: Page, errors):
    sign_in(page, username="sam")
    sign_in(page, user_id=ALEX_ID, email="alex@example.com", username="alex")
    data = open_room(page, "/room/sam?quality=low")
    assert data["viewer"]["relationship"] == "stranger"
    assert data["saveMode"] is None
    expect(page.get_by_test_id("edit-room")).to_be_hidden()
    response = page.request.put(
        "/api/rooms/sam/layout",
        data={"appearance": {}, "objects": []},
        headers={"Authorization": f"Bearer {session_for(page, ALEX_ID)['access_token']}"},
    )
    assert response.status == 403
    assert errors == []


def test_photos_go_to_the_account_and_old_browser_photos_can_move(page: Page, errors):
    # Before signing in: a photo uploaded while previewing a demo room stays in the browser.
    open_room(page, "/room?quality=low&as=owner")
    page.get_by_test_id("edit-room").click()
    select(page, "photo-sunset")
    page.get_by_test_id("photo-upload").set_input_files(
        files=[{"name": "old.png", "mimeType": "image/png", "buffer": png(rgb=(30, 90, 200))}]
    )
    page.wait_for_function(
        "() => window.__doors.layout().objects.find((o) => o.id === 'photo-sunset')"
        "?.customData?.imageUrl?.startsWith('upload:')"
    )
    page.get_by_test_id("editor-cancel").click()

    sign_in(page, username="sam")
    open_room(page, "/room/sam?quality=low")
    page.get_by_test_id("edit-room").click()
    select(page, "photo-sunset")
    page.get_by_role("button", name="Use photo: old.png").click()
    page.wait_for_function(
        "() => window.__doors.layout().objects.find((o) => o.id === 'photo-sunset')"
        "?.customData?.imageUrl?.startsWith('upload:')"
    )
    page.get_by_test_id("photos-migrate").click()
    expect(page.get_by_test_id("editor-status")).to_contain_text("Moved 1 photo to your account")
    page.wait_for_function(
        "() => window.__doors.layout().objects.find((o) => o.id === 'photo-sunset')"
        "?.customData?.imageUrl?.startsWith('photo:')"
    )
    expect(page.get_by_test_id("photos-migrate")).to_have_count(0)
    old_ref = obj(page, "photo-sunset")["customData"]["imageUrl"]

    page.get_by_test_id("photo-upload").set_input_files(
        files=[{"name": "new.png", "mimeType": "image/png", "buffer": png()}]
    )
    expect(page.get_by_role("button", name="Use photo: new.png")).to_be_visible()
    # The upload shows in the library a moment before the frame switches to it.
    page.wait_for_function(
        "(old) => window.__doors.layout().objects.find((o) => o.id === 'photo-sunset')"
        "?.customData?.imageUrl !== old",
        arg=old_ref,
    )
    new_ref = obj(page, "photo-sunset")["customData"]["imageUrl"]
    assert new_ref.startswith("photo:")
    page.get_by_test_id("editor-save").click()
    expect(page.get_by_test_id("editor")).to_be_hidden()

    served = page.request.get(f"/photos/{new_ref.removeprefix('photo:')}")
    assert served.status == 200 and served.headers["content-type"] == "image/jpeg"
    photos = page.request.get(
        "/api/photos", headers={"Authorization": f"Bearer {session_for(page)['access_token']}"}
    ).json()["photos"]
    assert {p["name"] for p in photos} == {"old.png", "new.png"}
    assert errors == []


def test_an_expiring_session_is_refreshed(page: Page, errors):
    sign_in(page, username="sam")
    fresh = session_for(page)
    refreshed = []

    def token(route: Route):
        refreshed.append(json.loads(route.request.post_data))
        route.fulfill(
            status=200,
            json={
                "access_token": fresh["access_token"],
                "refresh_token": "r2",
                "expires_at": fresh["expires_at"],
                "user": fresh["user"],
            },
        )

    page.route(f"{SUPABASE}/auth/v1/token**", token)
    page.evaluate(
        "(s) => localStorage.setItem('doors:auth', JSON.stringify(s))",
        {**fresh, "expires_at": int(time.time()) - 10, "refresh_token": "r1"},
    )
    data = open_room(page, "/room/sam?quality=low")
    assert refreshed == [{"refresh_token": "r1"}]
    assert data["saveMode"] == "account"
    stored = page.evaluate("() => JSON.parse(localStorage.getItem('doors:auth'))")
    assert stored["refresh_token"] == "r2"
    assert errors == []


def test_signing_out(page: Page, errors):
    page.route(f"{SUPABASE}/auth/v1/logout", lambda route: route.fulfill(status=204, body=""))
    sign_in(page, username="sam")
    page.goto("/")
    expect(page.get_by_test_id("my-room-link")).to_have_attribute("href", "/room/sam")
    page.get_by_test_id("sign-out").click()
    expect(page.get_by_test_id("sign-in-link")).to_be_visible()
    assert page.evaluate("() => localStorage.getItem('doors:auth')") is None
    assert errors == []
