from playwright.sync_api import Page, expect

from .helpers import open_room

KEEP_GUIDE = (
    "localStorage.setItem('doors:test-keep-guide', '1');"
    " localStorage.removeItem('doors:guide-seen')"
)


def test_first_visit_shows_how_rooms_work_once(page: Page, errors):
    page.goto("/")
    page.evaluate(KEEP_GUIDE)
    open_room(page, "/room/jun?quality=low")
    panel = page.get_by_test_id("room-panel")
    expect(panel).to_contain_text("Welcome to Jun's room")
    expect(panel).to_contain_text("Aim at things, then click.")
    expect(page.get_by_test_id("guide-edit")).to_have_count(0)
    page.get_by_test_id("guide-done").click()
    expect(panel).to_be_hidden()

    # Seen once: the next room doesn't pop it up, but Help brings it back.
    open_room(page, "/room/mira?quality=low")
    expect(panel).to_be_hidden()
    page.get_by_test_id("room-help").click()
    expect(panel).to_contain_text("How it works")
    assert errors == []


def test_phones_get_the_guide_worded_for_touch(browser, base_url):
    context = browser.new_context(
        base_url=base_url, has_touch=True, is_mobile=True, viewport={"width": 390, "height": 844}
    )
    page = context.new_page()
    page.goto("/")
    page.evaluate(KEEP_GUIDE)
    open_room(page, "/room/mira?quality=low")
    expect(page.get_by_test_id("room-panel")).to_contain_text("Tap things.")
    context.close()
