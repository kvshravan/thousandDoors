# 1000 Doors

A social network where every person gets a cozy 3D room behind a door. Your room is your identity, the hallway is your social network, and the wider world is where you discover people.

Stack: Python Flask, HTML/CSS, vanilla JavaScript, Three.js r187 (vendored, loaded through an import map), Supabase (from Milestone 4). No Node.js or frontend build step.

## Status

| Milestone | Scope | State |
|---|---|---|
| 0 | Project setup | ✅ Done |
| 1 | First 3D room | ✅ Done |
| 2 | Asset loading and object interactions | Next |

## Local setup (Windows)

Requires Python 3.12+.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
python -m playwright install chromium
Copy-Item .env.example .env
flask --app app run --debug
```

Open http://127.0.0.1:5000 and choose **Step inside the demo room**, or go straight to http://127.0.0.1:5000/room. Health check: http://127.0.0.1:5000/healthz.

Add `?quality=low|medium|high` to `/room` to override the automatic graphics quality.

On macOS/Linux, activate with `source .venv/bin/activate` and use `cp` instead of `Copy-Item`.

## Checks

```powershell
ruff check .
ruff format --check .
pytest                 # everything, including browser tests
pytest -m "not e2e"    # fast server-side tests only
pytest tests/e2e --headed   # watch the browser tests run
```

Browser tests (`tests/e2e/`) start the app on a random port and drive headless Chromium with Playwright. WebGL runs on the SwiftShader software renderer, so no GPU is needed. They check that the room renders, resizes, responds to mouse and touch, keeps the camera inside the room, pauses when the tab is hidden, cleans up GPU resources, and falls back gracefully without WebGL.

In development and testing the page exposes `window.__doors` (state, debug info, pixel sampling, destroy, remount) for these tests. It is not rendered in production.

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
static/
  js/pages/       Page entry points (room.js wires HTML overlays to the engine)
  js/three/       3D engine, independent of Flask and the database
    engine.js             Renderer, single render loop, resize, visibility pause, disposal
    scene-manager.js      Mounts one scene at a time, disposing the previous one
    camera-controller.js  Bounded orbit camera (mouse + touch), reset view
    room-scene.js         Builds a room from { theme, layout }
    room-config.js        Dimensions, palette, lighting, camera limits, demo layout
    quality.js            WebGL 2 detection and device quality presets
    props/                Procedural low-poly furniture, decor, room shell, textures
  vendor/three/   Pinned Three.js r187 (see VERSION)
  css/            Styles; room.css holds the 3D page overlays
migrations/       SQL migrations (Milestone 4)
tests/            pytest suite; tests/e2e/ has the Playwright browser tests
```

### 3D architecture notes

- One `Engine` per page owns the canvas and the only render loop. It renders on demand (when the camera moves or something changes), pauses when the tab is hidden, and fully disposes the WebGL context on `pagehide`.
- Scenes implement `load(engine)`, `update(dt) -> changed`, `resize(w, h)`, and `dispose()`. `SceneManager` guarantees only one is mounted.
- Props are built from a layout (`{ prop, position, rotationY, options }`) through a registry in `props/index.js`. Milestone 2 swaps these procedural builders for GLB models from a catalogue without changing the scene API.
- `PropKit` caches geometries, materials, and textures so repeated parts share GPU resources; books use instancing.
- HTML overlays (nameplate, buttons, loading, errors, WebGL fallback) are separate from the canvas.

## Content and IP

All branding, models, and artwork must be original or properly licensed. No copyrighted characters or third-party franchise branding.
