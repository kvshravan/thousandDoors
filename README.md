# 1000 Doors

A social network where every person gets a cozy 3D room behind a door. Your room is your identity, the hallway is your social network, and the wider world is where you discover people.

Stack: Python Flask, HTML/CSS, vanilla JavaScript, Three.js r187 (vendored, loaded through an import map), Supabase (from Milestone 4). No Node.js or frontend build step.

## Status

| Milestone | Scope | State |
|---|---|---|
| 0 | Project setup | ✅ Done |
| 1 | First 3D room | ✅ Done |
| 2 | Asset loading and object interactions | ✅ Done |
| 3 | Personal Room MVP: 3a zoned layout + owner/appearance/permissions data ✅, 3b interactive room objects ✅, 3c customization mode ✅, 3d keyboard access and polish | In progress |

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

Open http://127.0.0.1:5000 and choose **Step inside Mira's room**, or go straight to http://127.0.0.1:5000/room (Mira) or http://127.0.0.1:5000/room/jun. Health check: http://127.0.0.1:5000/healthz.

Room page options (development only, until accounts exist):

- `?quality=low|medium|high` overrides the automatic graphics quality.
- `?as=stranger|follower|friend|owner` sets who you are to the room's owner. Objects only respond if their permission allows it (Mira's floor lamp is owner-only; the secret chest is friends-only).

### Things to try in a room

| Object | What happens |
|---|---|
| Desk or laptop | The owner's profile: name, status, bio, interests |
| Photo frames | Photo viewer |
| Posters | Interests, favourite films or albums |
| Bookshelves | Books, games, and collectibles on display |
| Record player | Plays the owner's track (a short synthesized loop); the record spins |
| TV | What's on |
| Noticeboard (by the door) | Read notes and pin your own |
| Gift table (by the door) | Leave a flower, cookie, star, or tea |
| Couch and armchair | Sit down; **Stand up** returns to the room view |
| Old chest | Hidden notes, friends only (`?as=friend`) |
| Window | Changes the view: day, evening, night |
| Lamps | Switch on and off |
| Door | Nameplate and the way out |

Notes and gifts are saved in your browser (localStorage, per room) until accounts arrive.

### Editing a room

Open a room as its owner (`/room?as=owner`) and choose **Edit room**:

- **Add**: pick furniture from the catalogue; it appears at a free spot and follows the pointer. Click or tap the floor to place it.
- **Move**: drag furniture across the floor. It snaps to a 25 cm grid, stays inside the walls, and can't overlap other furniture (the footprint turns red where it doesn't fit). Things standing on furniture, like a lamp on a nightstand, move, turn, and are removed with it.
- **Turn and remove**: the toolbar buttons, or **R** / **Shift+R** to turn, **Delete** to remove, arrow keys to nudge, **Escape** to deselect or cancel.
- **Look**: walls, floor, and lighting change instantly.
- **Save** keeps the layout in this browser (`doors:v1:<room>:layout`), **Cancel** puts everything back, **Start over** returns to the room as authored (save to keep it).

Wall items (photos, posters, the noticeboard) and fixed parts (door, window, ceiling lamp) can't be moved yet.

On macOS/Linux, activate with `source .venv/bin/activate` and use `cp` instead of `Copy-Item`.

## Checks

```powershell
ruff check .
ruff format --check .
pytest                 # everything, including browser tests
pytest -m "not e2e"    # fast server-side tests only
pytest tests/e2e --headed   # watch the browser tests run
pytest tests/e2e --slow-frames   # emulate a ~6 fps renderer, like a slow CI runner
```

Browser tests (`tests/e2e/`) start the app on a random port and drive headless Chromium with Playwright. WebGL runs on the SwiftShader software renderer, so no GPU is needed. They check that the room renders, resizes, responds to mouse and touch, keeps the camera inside the room, pauses when the tab is hidden, cleans up GPU resources, and falls back gracefully without WebGL. They also check that only the models a room uses are downloaded, every object sits inside the room, hover highlighting, every object interaction (profile, posters, shelves, TV, music, noticeboard posting, gifts, sitting, the friends-only chest, window scenes, the door), that visitor text can't inject HTML, tapping on phones, a placeholder when a model fails, and the error panel when the catalogue fails.

`tests/test_catalog_data.py` validates `static/data/`: every model file exists and is a GLB, every builder and interaction type is registered in the JavaScript, every room's appearance uses known presets, and every room object points at a real catalogue item and image with a valid permission level.

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
    catalog.json          Item catalogue: id -> GLB model or procedural builder, placement
                          (floor/surface/wall/fixed), thumbnail, interaction, light
    rooms/*.json          Mock rooms (mira, jun) served at /room/<id>, in the room format below
  js/pages/       Page entry points (room.js loads data and wires HTML overlays to the engine)
  js/three/       3D engine, independent of Flask and the database
    engine.js             Renderer, single render loop, resize, visibility pause, disposal
    scene-manager.js      Mounts one scene at a time, disposing the previous one
    camera-controller.js  Bounded orbit camera (mouse + touch), reset view
    room-scene.js         Builds a room from a room config + catalogue; edit mode, live
                          appearance changes, serialize/applyLayout
    editor-controller.js  Edit mode: select, drag, rotate, delete, place; riders on furniture
    placement.js          Pure grid/wall/overlap rules used by the editor
    screen-point.js       Ray and screen-space helpers shared by interactions and the editor
    catalog.js            Loads/validates the catalogue and normalizes room configs
    asset-loader.js       GLTF/texture loading with caching, normalization, and disposal
    object-manager.js     Turns room objects into placed models/props, lamps, placeholders
    interaction-manager.js Raycast hover highlight and click/tap selection
    room-config.js        Dimensions, palette (incl. model recolouring), lighting, camera limits
    quality.js            WebGL 2 detection and device quality presets
    props/                Procedural room shell, decor (door, window, frames, clock, rug), and
                          interactive props (poster, record player, noticeboard, gift table, chest)
  js/ui/          HTML side: interaction registry, panel contents, editor panel, photo viewer, music player,
                  per-room browser storage for notes and gifts
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
- Rooms are data:
  ```
  { roomId, name, description,
    owner: { username, displayName, bio, status, online, interests },
    appearance: { theme, wallpaper, floor, lighting },
    objects: [{ id, catalogId, position, rotation, scale, customData, permissions: { interact } }] }
  ```
  The catalogue maps `catalogId` to a GLB `model` or a procedural `builder`, plus an optional `interaction`, `light`, and default `permissions`. Milestone 4 moves rooms and the catalogue into Postgres without changing this shape.
- Every room shares one layout of zones: entrance (door with the owner's nameplate and online light), centre (bed, rug, seating), left wall (memories), right wall (collections), back wall (desk, TV), corners (music, plants), and a window. Appearance presets (`WALLPAPERS`, `FLOORS`, `LIGHTING_MOODS` in `room-config.js`) make the same foundation look different per owner.
- Permissions: each object has an interact level (`everyone`, `followers`, `friends`, `owner`). `js/permissions.js` compares it with the viewer's relationship to the owner; unknown levels fail closed. The 3D engine only receives a `canInteract` callback, so it stays unaware of users.
- Only the models a room references are downloaded. Each model loads once, is normalized (origin at floor centre, kit scale applied) and cloned per instance, so geometry is shared. Materials are recoloured by name to the room theme (`modelMaterials`), keeping a consistent palette.
- A model that fails to load becomes a neutral placeholder and is logged; the room still opens.
- Clicks are raycast against the whole scene so objects can't be clicked through others. Interactions fire on `click` after a short, still press, so camera drags never trigger them. Types map to handlers in `js/ui/interactions.js` (each needs an entry in `INTERACTION_VERBS`, which the tests enforce); add new types there.
- Interactive props expose `userData.controls = { state, actions }` (for example the chest's `setOpen`). The page calls them through `RoomScene.runAction(objectId, action)`, so UI code never touches meshes, and the state shows up in debug info for tests.
- Camera damping is scaled by frame time, so the camera glides and settles in the same time at 6 fps (CI software rendering) as at 120 fps.
- `PropKit` caches geometries, materials, and textures so repeated parts share GPU resources.
- HTML overlays (nameplate, buttons, tooltip, dialogs, loading, errors, WebGL fallback) are separate from the canvas.

## Credits

- Furniture models: [Furniture Kit](https://kenney.nl/assets/furniture-kit) by Kenney, CC0.

## Content and IP

All branding, models, and artwork must be original or properly licensed. No copyrighted characters or third-party franchise branding.
