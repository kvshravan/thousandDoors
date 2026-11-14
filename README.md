# 1000 Doors

A social network where every person gets a cozy 3D room behind a door. Your room is your identity, the hallway is your social network, and the wider world is where you discover people.

Stack: Python Flask, HTML/CSS, vanilla JavaScript, Three.js (from Milestone 1), Supabase (from Milestone 4). No Node.js or frontend build step.

## Status

| Milestone | Scope | State |
|---|---|---|
| 0 | Project setup | ✅ Done |
| 1 | First 3D room | Next |

## Local setup (Windows)

Requires Python 3.12+.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
Copy-Item .env.example .env
flask --app app run --debug
```

Open http://127.0.0.1:5000. Health check: http://127.0.0.1:5000/healthz.

On macOS/Linux, activate with `source .venv/bin/activate` and use `cp` instead of `Copy-Item`.

## Checks

```powershell
ruff check .
ruff format --check .
pytest
```

CI runs the same checks on every push and pull request (`.github/workflows/ci.yml`).

## Configuration

Settings come from environment variables (loaded from `.env` in development). See `.env.example`.

| Variable | Purpose |
|---|---|
| `FLASK_ENV` | `development`, `testing`, or `production` |
| `SECRET_KEY` | Flask session secret. Required in production. |
| `APP_NAME` | Display name |

## Production

```bash
gunicorn wsgi:app
```

## Project layout

```
app.py            Flask app factory
config.py         Environment-based configuration
wsgi.py           Production entry point
backend/          Blueprints and server logic
templates/        Jinja templates
static/           CSS, JS (three/, api/, ui/), models, textures, icons
migrations/       SQL migrations (Milestone 4)
tests/            pytest suite
```

## Content and IP

All branding, models, and artwork must be original or properly licensed. No copyrighted characters or third-party franchise branding.
