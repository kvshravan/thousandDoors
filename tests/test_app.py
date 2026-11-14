import pytest

from app import create_app
from config import get_config


def test_home_page_renders(client):
    response = client.get("/")
    assert response.status_code == 200
    body = response.get_data(as_text=True)
    assert "1000 Doors" in body
    assert 'data-testid="app-status"' in body
    assert "/static/js/app.js" in body


def test_healthz_returns_ok_json(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok", "version": "0.0.1"}


def test_static_assets_are_served(client):
    for path in ("/static/css/main.css", "/static/css/ui.css", "/static/js/app.js"):
        assert client.get(path).status_code == 200, path


def test_unknown_page_renders_html_404(client):
    response = client.get("/no-such-door")
    assert response.status_code == 404
    assert "Wrong door" in response.get_data(as_text=True)


def test_unknown_api_route_returns_json_404(client):
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "not_found"


def test_testing_config_is_applied(app):
    assert app.config["TESTING"] is True
    assert app.config["ENV_NAME"] == "testing"


def test_unknown_config_name_is_rejected():
    with pytest.raises(ValueError):
        get_config("staging")


def test_production_requires_secret_key(monkeypatch):
    monkeypatch.setattr("config.ProductionConfig.SECRET_KEY", None)
    with pytest.raises(RuntimeError):
        create_app("production")
