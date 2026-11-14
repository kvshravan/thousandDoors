from flask import Flask, jsonify, render_template, request

from backend.api import api_bp
from backend.auth import TestSigner, TokenVerifier
from backend.migrations import register_cli
from backend.pages import pages_bp, test_bp
from backend.photos import MemoryPhotoStorage, SupabasePhotoStorage
from backend.store import MemoryStore, PostgresStore
from config import get_config


def create_app(config_name: str | None = None, **overrides) -> Flask:
    app = Flask(__name__)
    config = get_config(config_name)
    app.config.from_object(config)
    app.config.update(overrides)

    if app.config["ENV_NAME"] == "production":
        missing = [
            key
            for key in ("SECRET_KEY", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "DATABASE_URL")
            if not app.config.get(key)
        ]
        if missing:
            raise RuntimeError(f"Set {', '.join(missing)} in production.")

    _set_up_services(app)
    app.register_blueprint(pages_bp)
    app.register_blueprint(api_bp)
    if app.testing:
        app.register_blueprint(test_bp)
    register_cli(app)
    _register_error_handlers(app)

    @app.context_processor
    def inject_globals():
        return {
            "app_name": app.config["APP_NAME"],
            "debug_hooks": app.config["EXPOSE_DEBUG_HOOKS"],
            # The publishable key is meant for browsers; the secret key never leaves the server.
            "supabase_url": app.config.get("SUPABASE_URL") or "",
            "supabase_key": app.config.get("SUPABASE_PUBLISHABLE_KEY") or "",
        }

    return app


def _set_up_services(app: Flask) -> None:
    url = (app.config.get("SUPABASE_URL") or "").rstrip("/")
    issuer = f"{url}/auth/v1"
    if app.testing:
        signer = TestSigner(issuer)
        app.extensions["doors.signer"] = signer
        app.extensions["doors.auth"] = TokenVerifier(issuer=issuer, jwks=signer.jwks)
    else:
        jwks_url = app.config.get("SUPABASE_JWKS_URL") or (
            f"{issuer}/.well-known/jwks.json" if url else None
        )
        app.extensions["doors.auth"] = TokenVerifier(issuer=issuer, jwks_url=jwks_url)

    if app.config.get("DATABASE_URL"):
        app.extensions["doors.store"] = PostgresStore.from_url(app.config["DATABASE_URL"])
    else:
        app.extensions["doors.store"] = MemoryStore(app.static_folder)

    if url and app.config.get("SUPABASE_SECRET_KEY"):
        app.extensions["doors.photos"] = SupabasePhotoStorage(
            url, app.config["SUPABASE_SECRET_KEY"]
        )
    else:
        app.extensions["doors.photos"] = MemoryPhotoStorage()


def _wants_json() -> bool:
    return request.path.startswith("/api/") or request.path == "/healthz"


def _register_error_handlers(app: Flask) -> None:
    @app.errorhandler(404)
    def not_found(_error):
        if _wants_json():
            return jsonify(error={"code": "not_found", "message": "Resource not found."}), 404
        return render_template("404.html"), 404

    @app.errorhandler(413)
    def too_large(_error):
        return jsonify(error={"code": "too_large", "message": "That upload is too big."}), 413

    @app.errorhandler(500)
    def server_error(_error):
        if _wants_json():
            return jsonify(error={"code": "server_error", "message": "Unexpected error."}), 500
        return render_template("500.html"), 500


app = create_app()

if __name__ == "__main__":
    app.run()
