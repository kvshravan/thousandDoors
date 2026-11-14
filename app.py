from flask import Flask, jsonify, render_template, request

from backend.pages import pages_bp
from config import get_config


def create_app(config_name: str | None = None) -> Flask:
    app = Flask(__name__)
    config = get_config(config_name)
    app.config.from_object(config)

    if app.config["ENV_NAME"] == "production" and not app.config.get("SECRET_KEY"):
        raise RuntimeError("SECRET_KEY must be set in production.")

    app.register_blueprint(pages_bp)
    _register_error_handlers(app)

    @app.context_processor
    def inject_globals():
        return {
            "app_name": app.config["APP_NAME"],
            "debug_hooks": app.config["EXPOSE_DEBUG_HOOKS"],
        }

    return app


def _wants_json() -> bool:
    return request.path.startswith("/api/") or request.path == "/healthz"


def _register_error_handlers(app: Flask) -> None:
    @app.errorhandler(404)
    def not_found(_error):
        if _wants_json():
            return jsonify(error={"code": "not_found", "message": "Resource not found."}), 404
        return render_template("404.html"), 404

    @app.errorhandler(500)
    def server_error(_error):
        if _wants_json():
            return jsonify(error={"code": "server_error", "message": "Unexpected error."}), 500
        return render_template("500.html"), 500


app = create_app()

if __name__ == "__main__":
    app.run()
