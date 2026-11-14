# 1000 Doors

A social network where every person gets a cozy 3D room behind a door. Your room is your identity, the hallway is your social network, and the wider world is where you discover people.

Stack: Python Flask, HTML/CSS, vanilla JavaScript, Three.js r187 (vendored, loaded through an import map), Supabase (from Milestone 4). No Node.js or frontend build step.

## Status

| Milestone | Scope | State |
|---|---|---|
| 0 | Project setup | ✅ Done |
| 1 | First 3D room | ✅ Done |
| 2 | Asset loading and object interactions | ✅ Done |
| 3 | Room editor | Next |

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

Browser tests (`tests/e2e/`) start the app on a random port and drive headless Chromium with Playwright. WebGL runs on the SwiftShader software renderer, so no GPU is needed. They check that the room renders, resizes, responds to mouse and touch, keeps the camera inside the room, pauses when the tab is hidden, cleans up GPU resources, and falls back gracefully without WebGL. They also check that only the models a room uses are downloaded, every object sits inside the room, hover highlighting, clicking photos, lamps, and the guestbook, tapping on phones, a placeholder when a model fails, and the error panel when the catalogue fails.

`tests/test_catalog_data.py` validates `static/data/*.json`: every model file exists and is a GLB, every builder and interaction type is registered in the JavaScript, and every room object points at a real catalogue item and image.

In development and testing the page exposes `window.__doors` (state, debug info, object bounds and screen points, pixel sampling, destroy, remount) for these tests. It is not rendered in production.

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
  data/
    catalog.json          Item catalogue: id -> GLB model or procedural builder, interaction, light
    demo-room.json        Demo room in the spec's room format ({ roomId, theme, objects: [...] })
  js/pages/       Page entry points (room.js loads data and wires HTML overlays to the engine)
  js/three/       3D engine, independent of Flask and the database
    engine.js             Renderer, single render loop, resize, visibility pause, disposal
    scene-manager.js      Mounts one scene at a time, disposing the previous one
    camera-controller.js  Bounded orbit camera (mouse + touch), reset view
    room-scene.js         Builds a room from a room config + catalogue
    catalog.js            Loads/validates the catalogue and normalizes room configs
    asset-loader.js       GLTF/texture loading with caching, normalization, and disposal
    object-manager.js     Turns room objects into placed models/props, lamps, placeholders
    interaction-manager.js Raycast hover highlight and click/tap selection
    room-config.js        Dimensions, palette (incl. model recolouring), lighting, camera limits
    quality.js            WebGL 2 detection and device quality presets
    props/                Procedural room shell and decor (door, window, frames, clock, rug, guestbook)
  js/ui/          HTML panels: photo viewer, guestbook, interaction registry
  models/furniture/  GLB furniture (Kenney Furniture Kit, CC0; see LICENSE-kenney.txt)
  images/demo/    Original SVG artwork used as demo photos
  vendor/three/   Pinned Three.js r187 (see VERSION)
  css/            Styles; room.css holds the 3D page overlays and dialogs
migrations/       SQL migrations (Milestone 4)
tests/            pytest suite; tests/e2e/ has the Playwright browser tests
```

### 3D architecture notes

- One `Engine` per page owns the canvas and the only render loop. It renders on demand (when the camera moves or something changes), pauses when the tab is hidden, and fully disposes the WebGL context on `pagehide`.
- Scenes implement `load(engine)`, `update(dt) -> changed`, `resize(w, h)`, and `dispose()`. `SceneManager` guarantees only one is mounted.
- Rooms are data: `{ roomId, theme, objects: [{ id, catalogId, position, rotation, scale, customData }] }`. The catalogue maps `catalogId` to a GLB `model` or a procedural `builder`, plus an optional `interaction` and `light`. Milestone 4 moves both into Postgres without changing this shape.
- Only the models a room references are downloaded. Each model loads once, is normalized (origin at floor centre, kit scale applied) and cloned per instance, so geometry is shared. Materials are recoloured by name to the room theme (`modelMaterials`), keeping a consistent palette.
- A model that fails to load becomes a neutral placeholder and is logged; the room still opens.
- Clicks are raycast against the whole scene so objects can't be clicked through others. Interactions fire on `click` after a short, still press, so camera drags never trigger them. Types map to handlers in `js/ui/interactions.js`; add new types there.
- `PropKit` caches geometries, materials, and textures so repeated parts share GPU resources.
- HTML overlays (nameplate, buttons, tooltip, dialogs, loading, errors, WebGL fallback) are separate from the canvas.

## Credits

- Furniture models: [Furniture Kit](https://kenney.nl/assets/furniture-kit) by Kenney, CC0.

## Content and IP

All branding, models, and artwork must be original or properly licensed. No copyrighted characters or third-party franchise branding.
