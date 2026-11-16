# 1000 Doors

A social network where every person gets a cozy 3D room behind a door. Your room is your identity, the hallway is your social network, and the wider world is where you discover people.

Stack: Python Flask, HTML/CSS, vanilla JavaScript, Three.js r187 (vendored, loaded through an import map), Supabase (Auth, Postgres, Storage). No Node.js or frontend build step.

## Status

| Milestone | Scope | State |
|---|---|---|
| 0 | Project setup | ✅ Done |
| 1 | First 3D room | ✅ Done |
| 2 | Asset loading and object interactions | ✅ Done |
| 3 | Personal Room MVP: zoned layout and room data, interactive objects, customization mode, keyboard access and polish | ✅ Done |
| 3e | Richer rooms: about 120 things to add (furniture, instruments, lights, tech, hobbies, decor) with search; colours and sizes; placing on furniture, walls, and ceiling; light colours, brightness, and effects; neon text; photo string lights with your own uploads; six landscapes seen through the window and from outside the house | ✅ Done |
| 4 | Accounts and database: Google or magic-link sign-in, choose a username and get a starter room, rooms saved to Postgres with row-level security, shared notes and gifts, photos in Supabase Storage; hosted on Azure App Service | ✅ Done |
| 5 | The hallway: a vault of rails with every room's door gliding along them (plus unclaimed ones), ride a door, pick one and go through it into the room; rails behind the home page; original music | ✅ Done |
| 6a | Real media and your profile: YouTube, Spotify, and SoundCloud on the record player, YouTube on the TV; edit your profile from the desk; a count of different visitors on each door; doors of people in your city glow in the hallway; eight demo rooms | ✅ Done |
| 6b | A room from your photos: AI reads a few photos and furnishes an editable room to match | Planned |

## Local setup (Windows)

Requires Python 3.12+.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
python -m playwright install chromium
Copy-Item .env.example .env   # then fill in the Supabase values (below)
flask --app app db upgrade    # create the tables, policies, and photo bucket
flask --app app db seed       # add the demo rooms (Mira, Jun)
flask --app app run --debug
```

Open http://127.0.0.1:5000 and choose **Step inside Mira's room**, or go straight to http://127.0.0.1:5000/room (Mira) or http://127.0.0.1:5000/room/jun. Health check: http://127.0.0.1:5000/healthz.

Without `DATABASE_URL` the app still runs, keeping everything in memory (lost on restart), which is how the tests run.

### Supabase

1. Create a project at https://supabase.com/dashboard.
2. Copy into `.env` (never commit it):
   - `SUPABASE_URL`: **Connect** → Project URL
   - `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`: **Settings → API Keys**
   - `DATABASE_URL`: **Connect** → Session pooler connection string, with your database password
   - `SUPABASE_JWKS_URL` (optional): defaults to `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`
3. **Authentication → URL Configuration**: Site URL `http://127.0.0.1:5000`, and add `http://127.0.0.1:5000/**` (and later the deployed URL) to Redirect URLs.
4. Run `flask --app app db upgrade` and `flask --app app db seed`. `flask --app app db status` lists applied migrations.
5. Optional, **Sign in with Google**:
   - In [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services**: configure the OAuth consent screen, then **Credentials → Create credentials → OAuth client ID** (Web application) with Authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
   - In Supabase **Authentication → Sign In / Providers → Google**: enable it and paste the client ID and secret.
   - Set `AUTH_PROVIDERS=google` here and on the server; the sign-in page shows the button only then.

### Accounts

**Sign in** (top right) offers **Continue with Google** (when enabled) or an emailed magic link; either creates the account the first time. Next, choose a username: it's your door's name and your room's address (`/room/<username>`), and you get a furnished starter room. **Edit room** then saves to your account, so every visitor sees it. Leaving notes and gifts needs an account (they're signed with your name); anyone can read them.

Room page options (development only):

- `?quality=low|medium|high` overrides the automatic graphics quality.
- `?as=stranger|follower|friend|owner` previews the room as someone else. Objects only respond if their permission allows it (Mira's floor lamp is owner-only; the secret chest is friends-only). `?as=owner` on a demo room lets you try the editor, saving only in this browser.

### The hallway

`/hallway` is a vast vault where every room's door hangs from rails and glides along them: a sweeping rail in front of the landing, a coaster that climbs and dives, and long lanes running off into the fog, with walls of stored doors behind. Lit lamps mark claimed rooms; the rest are unclaimed doors (so the vault is full from day one). The home page shows the same rails behind its headline.

- **Look around**: drag (or one finger) to look, scroll or pinch to zoom, arrow keys too. The view drifts slowly when left alone.
- **Pick a door**: hover shows whose it is; click or tap opens its card. **Open the door** glides it to the landing on a short rail, swings it open onto warm light, and takes you through into the room (the room's loading screen continues that light). An unclaimed door offers **Claim it**.
- **Ride a door**: rides a claimed door on the coaster, leaning into the bends; tap any other door to hop onto it, **Open it** to go in, **Hop off** to fly back to the landing.
- **Find a door**: a searchable list of every room as plain links, for the keyboard and screen readers; it's also what you get without WebGL.
- **Doors near you**: choose your city in **Find a door** (or set it on your profile, and the hallway uses it when you're signed in). Doors of people within about 25 km glow gold with a brighter lamp, come first on the rails closest to you and in the list, and their card says "Near you". Only a city is ever stored, and only if its owner picked one (`static/data/cities.json`; "near" means the cities' centres are within `radiusKm`). Try Delhi (Kabir, and Ananya in Gurugram), Bengaluru, Mumbai, or London.
- **Sound**: an empty, echoing void, synthesized live with Web Audio (no audio files): a low hum and slow, dark minor chords in a long echo. Riding is a little brighter, and the door you open creaks on its hinges before the sound fades as you go through. It's off by default; turning it on with **♪ Music** is remembered, and on later visits it starts with your first click or key press (browsers wait for one).
- With reduced motion, the doors stay still, riding is off, and choosing a door goes straight in.

### Things to try in a room

| Object | What happens |
|---|---|
| Desk or laptop | The owner's profile: name, status, bio, interests, and how many people have visited; the owner can **Edit your profile** right there, including which city they live in (or not to say) |
| Photo frames | Photo viewer |
| Posters | Interests, favourite films or albums |
| Bookshelves | Books, games, and collectibles on display |
| Record player | Plays the owner's song from YouTube, Spotify, or SoundCloud (a track, album, or playlist) in that service's player; without one, a short synthesized loop and a spinning record |
| TV | The owner's YouTube video, or what's on |
| Noticeboard (by the door) | Read notes and pin your own |
| Gift table (by the door) | Leave a flower, cookie, star, or tea |
| Couch and armchair | Sit down; **Stand up** returns to the room view |
| Old chest | Hidden notes, friends only (`?as=friend`) |
| Window | Changes the view: day, evening, night (of the room's landscape) |
| Lamps, fairy lights, neon, candles | Switch on and off |
| Photo string lights (Mira's right wall) | The pegged photos, up close |
| Door | Nameplate, the visitor count, **Step outside** to see the house in its landscape, and the way out |

Notes and gifts are shared: they're saved on the server, so every visitor sees them.

### Outside the house

Every room's house stands somewhere: a countryside cottage, beach house on stilts, forest log cabin, city apartment, snowy chalet, or desert adobe (the owner picks in **Look → Outside**). The window shows the place painted for the time of day, and **Step outside** at the door shows the house itself in 3D, with the owner's front door and nameplate. Drag to look around; click the door or **Go inside** to return.

### Walking around

Rooms open in a first-person **walking view**, at eye height just inside the door.

**On a computer it plays like a game:**

- **Click in the room** to start: the cursor hides and moving the mouse looks around (pointer lock). A small dot marks the middle of the screen.
- **W A S D** walk and strafe (Shift to hurry), **← →** turn, and the mouse wheel takes a step. You can't walk through walls or furniture.
- **Aim at something and click** to use it: the dot grows and the thing glows when it's usable. Opening a photo or a panel gives the cursor back; click the room again to carry on.
- **Esc** gives the cursor back any time (for the buttons). If the browser refuses to lock the pointer, dragging looks around and clicking works with the cursor.

**On phones:** drag to look around (with a little momentum after a flick), **tap the floor** to walk there along a route around the furniture (a grid path-finder in `walk-map.js`, with a soft ring where you're headed), tap things to use them, and pinch to step forward or back.

Everywhere:

- A gentle head-bob while you walk (off with the OS reduce-motion setting).
- **Overview** (⤢) switches to the bird's-eye orbit of the whole room, and **Walk** comes back to where you were standing. The choice is remembered. Editing always uses the overview, then walks on.
- Sitting on a sofa glides you into it; **Stand up** gets you up beside it.
### First visit

The first time someone opens a room, a short guide explains looking, walking, tapping things, and leaving notes (worded for touch on phones). **Help** (?) brings it back any time. A brand-new room opens straight into the editor with a few decorating tips.

### Keyboard and accessibility

- **Things here** lists every object you're allowed to use, with what it does (Sit down, Play music, Leave a gift...). Choosing one works exactly like clicking it, so the whole room works without a mouse.
- **Tab** to the 3D view. When walking, **W A S D** / the **arrow keys** walk and turn; in the overview, the **arrow keys** look around. **+** / **-** step or zoom, and **Home** stands you up or returns to the start.
- Changes you can't see, such as a lamp switching or the window changing, are announced to screen readers.
- With the OS **reduce motion** setting, camera moves jump instead of gliding.
- On phones, the room buttons collapse to icons (their names are still read out).

### Editing a room

Open a room as its owner (`/room?as=owner`) and choose **Edit room**:

- **Add**: about 120 things in categories (furniture, seating, lighting, music, tech, decor, on the wall, hobbies), with a search box that also matches tags ("couch" finds every sofa). Besides the furniture kit there are instruments (guitars, ukulele, violin, synth, piano, drum kit, amp, microphone), lights (fairy lights, LED strip, neon sign, candles, lava lamp, paper lantern), gaming gear, an easel, telescope, globe, skateboard, yoga mat, bean bag, wall shelves, and photo string lights. A new item appears at a free spot and follows the pointer; click or tap to place it. The catalogue, category filters, and option groups are one Tab stop each; arrow keys move inside them.
- **Move**: each kind of item moves its own way:
  - *Floor* furniture snaps to a 25 cm grid, stays inside the walls, and can't overlap other furniture (the footprint turns red where it doesn't fit).
  - *Small things* (lamps, plants, cushions, the teddy bear) stand on whatever furniture or wall shelf is under the pointer, or on the floor, and can't overlap each other. Things standing on furniture move, turn, and are removed with it.
  - *Wall* items (photos, posters, mirrors, wall lamps, neon signs, shelves, the noticeboard) slide along any of the four walls and up and down, without overlapping each other, the door, or the window.
  - *Ceiling* items (pendant lamp, ceiling lamp, ceiling fan, paper lantern, hanging plant) hang from the ceiling; point at the floor below where they should go.
- **Item**: click something to change what it allows:
  - colour (16 colours, or its original one) and size (small, medium, large);
  - for lights: on/off, light colour (including rainbow bulbs), brightness, and effect (steady, pulse, twinkle, flicker; effects stay still with the OS reduce-motion setting);
  - for neon signs and posters: the words;
  - for the record player and TV: paste a song or video link (YouTube, Spotify, or SoundCloud for the record player; YouTube for the TV), or remove it;
  - for frames and photo strings: the photo(s), from the bundled pictures or your own uploads. Uploads are shrunk to 512 px in the browser, checked by the server, and stored in Supabase Storage, so every visitor sees them. Photos uploaded before signing in (kept in the browser) show a **Move to your account** button.
  The door can be recoloured but not moved; the colour shows outside the house too.
- **Turn and remove**: the toolbar buttons, or **R** / **Shift+R** to turn, **Delete** to remove, arrow keys to nudge, **Escape** to deselect or cancel. When you add an item from the catalogue by keyboard, focus moves to the 3D view: arrows move it and **Enter** places it.
- **Look**: walls, floor, lighting, and the landscape outside change instantly.
- **Save** saves the room to your account (on a demo room with `?as=owner`, only in this browser), **Cancel** puts everything back, **Start over** returns to the room as it was when you opened it (save to keep it).
- **On phones** the panel is a bottom sheet that starts folded to its tabs, so the room fills most of the screen; tap a tab (or drag the handle up) to open it, and it folds again while you place something. Save, Cancel, and Start over sit in a slim bar at the top. Tap something to pick it (a swipe that starts on furniture still turns the camera), then drag it; a floating toolbar turns it, nudges it with arrows (in the direction they point on screen), removes it, or opens **Colour & more**. **Done** lets go.

The door and window are part of the room and can't be moved.

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

Accessibility tests run [axe-core](https://github.com/dequelabs/axe-core) (vendored in `tests/e2e/vendor/`, test-only) on each page, open panel, and the editor. They also drive the camera, the things list, and the editor using only the keyboard, and check reduced motion and the phone layout. Performance tests hold each room and each outside landscape to a budget (draw calls, triangles, geometries, textures, download size, request count) and check that nothing is fetched from outside the app. `test_room_customize.py` adds every catalogue item once, and covers light settings, neon text, photo uploads (kept across reloads), frames, landscapes, and stepping outside and back in.

`tests/e2e/test_room_media.py` covers pasted links (which ones become references, and which are refused), setting a song and a video in the editor and seeing them as a visitor (the providers' players are stubbed, so nothing loads from outside), editing your profile from the desk, and the visitor count on the door.

`tests/e2e/test_hallway.py` covers the hallway: doors on moving rails within a rendering budget, the door list and its search, picking a door and arriving in its room, claiming an unclaimed door, riding and hopping between doors, finding a door by keyboard, sound on by default (audible once started, silent and remembered when turned off), axe checks with the card and list open, reduced motion, the list without WebGL, doors near the city you choose (and near the city on your profile), your own door appearing, tapping on a phone, and the home page's rails.

`tests/test_catalog_data.py` validates `static/data/`: every model file exists and is a GLB, every builder and interaction type is registered in the JavaScript, every room's appearance uses known presets, and every room object points at a real catalogue item and image with a valid permission level.

`tests/test_api.py` covers the API on the in-memory store: tokens (expired, wrong issuer, unsigned, forged, anon), usernames, starter rooms, who may edit, layout validation (unknown items, out-of-range positions, outside photo URLs, unsafe embeds, missing door, too many objects), notes and gifts with their hourly limit, and photo uploads judged by their bytes. `tests/e2e/test_accounts.py` drives magic-link and Google sign-in (Supabase's endpoints are intercepted), choosing a username, saving and seeing a room from another browser, failed saves, moving browser photos to the account, token refresh, and signing out. Tests never touch your Supabase project: they use memory storage and a signing key generated at startup.

`tests/test_postgres.py` checks the row-level security policies by attacking them directly, as someone using the Supabase Data API would (editing others' rooms, forging note authors, taking usernames, filing photos in others' folders). It runs when `TEST_DATABASE_URL` is set, inside transactions that are always rolled back. CI runs it on a Postgres service with `tests/sql/supabase_shim.sql` standing in for Supabase's auth schema. To run it against your project (slow from far away, but it leaves nothing behind):

```powershell
$env:TEST_DATABASE_URL = "<your DATABASE_URL>"; pytest tests/test_postgres.py
```

In development and testing the page exposes `window.__doors` (state, debug info, object bounds and screen points, pixel sampling, destroy, remount) for these tests. It is not rendered in production.

CI runs the same checks on every push and pull request (`.github/workflows/ci.yml`).

## Configuration

Settings come from environment variables (loaded from `.env` in development). See `.env.example`.

| Variable | Purpose |
|---|---|
| `FLASK_ENV` | `development`, `testing`, or `production` |
| `SECRET_KEY` | Flask session secret. Required in production. |
| `APP_NAME` | Display name |
| `SUPABASE_URL` | Project URL. Required in production. |
| `SUPABASE_PUBLISHABLE_KEY` | Browser key for sign-in. Required in production. |
| `SUPABASE_SECRET_KEY` | Server-only key, used to store photos. Never sent to browsers. |
| `SUPABASE_JWKS_URL` | Public keys for verifying sign-in tokens (defaults from `SUPABASE_URL`) |
| `DATABASE_URL` | Postgres connection (session pooler). Without it, data lives in memory. Required in production. |
| `AUTH_PROVIDERS` | OAuth sign-in buttons to show, comma-separated (`google`). Enable each in Supabase first. |

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
    camera-controller.js  Room camera: walking view or bounded orbit overview, reset view
    walk-controller.js    First-person walking (mouse look, keys, tap-to-walk, head-bob) + floor ring
    walk-map.js           Walkable floor grid and path-finding around furniture
    room-scene.js         Builds a room from a room config + catalogue; edit mode, live
                          appearance changes, light settings, serialize/applyLayout
    exterior-scene.js     The house outside, in the room's landscape and time of day
    editor-controller.js  Edit mode: select, drag, rotate, resize, recolour, delete, place on the
                          floor, on furniture, on walls, or on the ceiling; riders on furniture;
                          light, text, and photo changes
    placement.js          Pure grid/wall/overlap rules used by the editor
    screen-point.js       Ray and screen-space helpers shared by interactions and the editor
    catalog.js            Loads/validates the catalogue and normalizes room configs
    asset-loader.js       GLTF/texture loading with caching, normalization, and disposal
    object-manager.js     Turns room objects into placed models/props, lights (colour,
                          brightness, effects), placeholders
    interaction-manager.js Raycast hover highlight and click/tap selection
    room-config.js        Dimensions, palette (incl. model recolouring), lighting, item colours
                          and sizes, light colours and effects, landscapes, camera limits
    quality.js            WebGL 2 detection and device quality presets
    hallway/              The hallway: rails.js (closed rails with arc-length lookup and door
                          swing), doors.js (the instanced door fleet, the arriving door model),
                          vault.js (walls, windows, light, dust, rail meshes, the landing), and
                          hallway-scene.js (camera modes, arrival, picking, input)
    props/                Procedural room shell, decor (door, window, frames, clock, rug),
                          interactive props, instruments, glowing things (fairy lights, neon,
                          photo string), hobbies and tech, window landscapes (landscapes.js),
                          and the houses and scenery outside (outdoors.js)
  js/ui/          HTML side: interaction registry, panel contents, editor panel, photo viewer, music player,
                  visitor notes and gifts (visitor-book.js), photos (image-store.js), demo layout preview,
                  the hallway's music (hallway-music.js)
  js/auth.js      Magic-link sign-in with Supabase Auth (no supabase-js), sessions, calls to the API
  js/app.js       Every page: finishes a sign-in arriving from an email link, shows the account links
  js/pages/       Page scripts: room.js, hallway.js, home.js, signin.js, welcome.js
  data/templates/starter.json  The furnished room each new member starts with
  models/furniture/  GLB furniture (Kenney Furniture Kit, CC0; see LICENSE-kenney.txt) and its thumbnails
  models/props/thumbs/  Catalogue thumbnails for procedural props (made by tools/render_thumbnails.py)
  images/demo/    Original SVG artwork used as demo photos
  vendor/three/   Pinned Three.js r187 (see VERSION)
  css/            Styles; room.css holds the 3D page overlays and dialogs
migrations/       SQL migrations, applied in order by `flask db upgrade`
tools/            Developer scripts (render_thumbnails.py: thumbnails for procedural props;
                  make_demo_rooms.py: the demo rooms other than Mira's and Jun's, built from the
                  starter room; make_demo_art.py: those people's illustrated portraits and
                  snapshots in static/images/demo/people/)
tests/            pytest suite; tests/e2e/ has the Playwright browser tests (and vendor/axe.min.js);
                  tests/sql/ the Supabase stand-in for testing against plain Postgres
```

### Backend architecture notes

- `backend/api.py` is the JSON API: `/api/me`, `/api/me/profile`, `/api/doors` (every room's door for the hallway: id, name, status, colour), `/api/rooms/<id>` (+ `/layout`, `/notes`, `/gifts`), and `/api/photos`. Opening a room counts a visit: once per member, or once per browser (a random `doors_visitor` cookie, stored only as a keyed hash), never the owner. Visits go through `private.record_visit()` (migration 0002) in the same round trip as loading the room; the `private` schema isn't exposed by Supabase's Data API, and owners can't edit the count. `/photos/<id>` redirects to the photo in Storage. Errors are `{ "error": { "code", "message" } }`. The `/hallway` page embeds the same door list, so it needs no extra request; the door's colour is picked out of the room in the database, so whole rooms aren't sent.
- Flask is the only client of the database. The browser signs in with Supabase Auth and sends its access token; `backend/auth.py` verifies it against the project's public keys (JWKS, ES256), so the server holds no signing secret.
- `backend/store.py` has `PostgresStore` and `MemoryStore` with the same methods. `PostgresStore` runs every query as the requesting user (`set local role authenticated` plus their JWT claims, or `anon`), so the row-level security policies in `migrations/0001_rooms.sql` apply to every request, not just to Supabase's Data API. Privileges are granted column by column: owners can change a room's contents but not its id or owner.
- `backend/rooms.py` validates everything the editor sends (catalogue ids, ranges, photo references, embeds, sizes) and keeps one source of truth by reading the presets from `room-config.js`. A room is stored as one JSON document, in the same shape as the demo room files.
- Photos are checked by their bytes, stored at `<user id>/<photo id>.<ext>` in the public `photos` bucket using the secret key, and recorded in `public.photos`. A frame or photo string refers to one as `photo:<id>`.
- Songs and videos are stored as references (`{ provider, kind, id }` in `customData.song` / `customData.video`), never as URLs. `static/js/media.js` turns a pasted link into one and rebuilds the provider's embed address from it; `backend/rooms.py` checks references with the same rules, so a saved room can't point an iframe anywhere else.
- Demo rooms (Mira, Jun, and six more made by `tools/make_demo_rooms.py`) have no owner; each lives in a city. The six have real YouTube/Spotify songs and videos, illustrated photos, and filled-in shelves, notes, and gifts. `flask db seed` refreshes them from `static/data/rooms/` without touching anyone's room.

### 3D architecture notes

- One `Engine` per page owns the canvas and the only render loop. It renders on demand (when the camera moves or something changes), pauses when the tab is hidden, and fully disposes the WebGL context on `pagehide`.
- Scenes implement `load(engine)`, `update(dt) -> changed`, `resize(w, h)`, and `dispose()`. `SceneManager` guarantees only one is mounted.
- Rooms are data:
  ```
  { roomId, name, description,
    owner: { username, displayName, bio, status, online, interests },
    appearance: { theme, wallpaper, floor, lighting, landscape },
    objects: [{ id, catalogId, position, rotation, scale, customData, permissions: { interact } }] }
  ```
  The catalogue maps `catalogId` to a GLB `model` or a procedural `builder`, plus an optional `interaction`, `light`, and default `permissions`. Rooms are stored in Postgres in this same shape.
- Catalogue items also describe how they're edited: `placement` (`floor`, `surface`, `wall`, `ceiling`, or `fixed`), `category` and `tags` for the Add tab, `recolor` (the GLB material, or builder option, that an owner's colour replaces), `defaults` (customData for new copies, such as a starter track), `addable: false` for one-per-room parts, `mount.drop` for ceiling items, `scale`, `support` (wall items small things can stand on), `text` ({ field, maxLength, label } for editable words), and `photos` ({ field, max } for frames and photo strings). An owner's colour is stored as a name from `ITEM_COLORS` in `customData.color`; size is the object's scale. Wall and ceiling models are re-anchored on load so their origin is on the wall or ceiling.
- Lights: an item with a catalogue `light` gets a point light, and its parts marked `userData.glow` follow `customData.light` = { color (`LIGHT_COLORS`), brightness, effect (`LIGHT_EFFECTS`) } plus `customData.on`. Settings change in place without rebuilding; effects animate only while the light is on and never with reduced motion.
- Photos are references: bundled images (`/static/images/...`), photos in the owner's account (`photo:<id>`, served from `/photos/<id>`), or photos kept only in this browser (`upload:<id>`, from before signing in). The engine never sees files; builders ask an injected `images.resolve(ref)` for a URL, and anything else resolves to nothing.
- The room's `appearance.landscape` picks the window painting and the outside scene. `ExteriorScene` has the same view interface as `RoomScene`, so the page swaps them through `SceneManager`; the only outside interaction is the front door (`enter`).
- Every room shares one layout of zones: entrance (door with the owner's nameplate and online light), centre (bed, rug, seating), left wall (memories), right wall (collections), back wall (desk, TV), corners (music, plants), and a window. Appearance presets (`WALLPAPERS`, `FLOORS`, `LIGHTING_MOODS` in `room-config.js`) make the same foundation look different per owner.
- Permissions: each object has an interact level (`everyone`, `followers`, `friends`, `owner`). `js/permissions.js` compares it with the viewer's relationship to the owner (from the server; followers and friends arrive with the hallway); unknown levels fail closed. The 3D engine only receives a `canInteract` callback, so it stays unaware of users.
- Only the models a room references are downloaded. Each model loads once, is normalized (origin at floor centre, kit scale applied) and cloned per instance, so geometry is shared. Materials are recoloured by name to the room theme (`modelMaterials`), keeping a consistent palette.
- A model that fails to load becomes a neutral placeholder and is logged; the room still opens.
- Clicks are raycast against the whole scene so objects can't be clicked through others. Interactions fire on `click` after a short, still press, so camera drags never trigger them. Types map to handlers in `js/ui/interactions.js` (each needs an entry in `INTERACTION_VERBS`, which the tests enforce); add new types there.
- Interactive props expose `userData.controls = { state, actions }` (for example the chest's `setOpen`). The page calls them through `RoomScene.runAction(objectId, action)`, so UI code never touches meshes, and the state shows up in debug info for tests.
- Camera damping is scaled by frame time, so the camera glides and settles in the same time at 6 fps (CI software rendering) as at 120 fps. Programmatic moves (`flyTo`, used for reset, sitting, and keyboard orbit/zoom) discard leftover drag momentum so they land exactly.
- `PropKit` caches geometries, materials, and textures so repeated parts share GPU resources.
- HTML overlays (nameplate, buttons, tooltip, dialogs, loading, errors, WebGL fallback) are separate from the canvas.
- The hallway draws every door with two instanced meshes (the painted door, and its hanger and knob) that share one matrix per door, plus a point cloud of lamps, so a thousand doors cost a handful of draw calls. Shades are baked into vertex colours and multiplied by each door's colour. Each rail precomputes an arc-length table of points, headings, and how far a door swings out on each bend at that rail's speed, so placing every door each frame is a lookup. Picking raycasts simple boxes that share the same matrices. The door you choose is swapped for a standalone model with a hinged leaf for the arrival.

## Credits

- Furniture models: [Furniture Kit](https://kenney.nl/assets/furniture-kit) by Kenney, CC0.
- Accessibility testing: [axe-core](https://github.com/dequelabs/axe-core) by Deque, MPL-2.0 (tests only, not shipped).

## Content and IP

All branding, models, and artwork must be original or properly licensed. No copyrighted characters or third-party franchise branding.
