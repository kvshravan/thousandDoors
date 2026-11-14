from flask import Blueprint, current_app, jsonify, render_template

pages_bp = Blueprint("pages", __name__)


@pages_bp.get("/")
def index():
    return render_template("index.html")


@pages_bp.get("/room")
def room():
    return render_template("room.html")


@pages_bp.get("/healthz")
def healthz():
    return jsonify(status="ok", version=current_app.config["APP_VERSION"])
