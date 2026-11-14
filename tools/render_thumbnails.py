"""Renders catalogue thumbnails for procedural props (catalogue items with a "builder").

Kenney models ship with their own thumbnails; props built in code don't, so this
draws each one with the real engine, in the same three-quarter view, and saves a
transparent PNG to static/models/props/thumbs/<id>.png.

Run it after adding or changing a prop:

    python tools/render_thumbnails.py            # every builder item
    python tools/render_thumbnails.py rug poster # only these catalogue ids
"""

import base64
import json
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright
from werkzeug.serving import make_server

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app import create_app  # noqa: E402

CATALOG = ROOT / "static" / "data" / "catalog.json"
OUT = ROOT / "static" / "models" / "props" / "thumbs"
WEBGL_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

RENDER = """
async (ids) => {
  const THREE = await import('three');
  const { PropKit } = await import('/static/js/three/props/kit.js');
  const { PROP_BUILDERS } = await import('/static/js/three/props/index.js');
  const { resolveAppearance } = await import('/static/js/three/room-config.js');
  const { AssetLoader } = await import('/static/js/three/asset-loader.js');
  const catalog = await (await fetch('/static/data/catalog.json')).json();

  const width = 215;
  const height = 190;
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const { palette } = resolveAppearance({});
  const kit = new PropKit({ palette, quality: { shadows: false } });
  const loader = new AssetLoader('/static/models/');
  const room = { owner: { username: 'you', online: true }, appearance: {} };
  const images = {};

  for (const item of catalog.items) {
    if (!item.builder || !ids.includes(item.id)) continue;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#fff6ea', '#8a7060', 2.2));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(3, 5, 4);
    scene.add(sun);
    const options = { ...(item.options ?? {}), ...(item.defaults ?? {}) };
    const object = await PROP_BUILDERS[item.builder](kit, options, { loader, room });
    scene.add(object);

    // Three-quarter view from the front right, fitted to the object's bounding sphere.
    const sphere = new THREE.Box3().setFromObject(object).getBoundingSphere(new THREE.Sphere());
    const r = sphere.radius * 1.05;
    const aspect = width / height;
    const camera = new THREE.OrthographicCamera(-r * aspect, r * aspect, r, -r, 0.01, r * 10);
    const direction = new THREE.Vector3(0.8, 0.65, 1).normalize();
    camera.position.copy(sphere.center).addScaledVector(direction, r * 4);
    camera.lookAt(sphere.center);
    renderer.render(scene, camera);
    images[item.id] = renderer.domElement.toDataURL('image/png');
  }
  renderer.dispose();
  kit.dispose();
  return images;
}
"""


def main(ids: list[str]) -> None:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    builders = [item["id"] for item in catalog["items"] if item.get("builder")]
    wanted = ids or builders
    unknown = set(wanted) - set(builders)
    if unknown:
        raise SystemExit(f"not builder items: {', '.join(sorted(unknown))}")

    server = make_server("127.0.0.1", 0, create_app("testing"), threaded=True)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(args=WEBGL_ARGS)
            page = browser.new_page()
            # The room page defines the import map for "three".
            page.goto(f"http://127.0.0.1:{server.server_port}/room?quality=low")
            images = page.evaluate(RENDER, wanted)
            browser.close()
    finally:
        server.shutdown()

    OUT.mkdir(parents=True, exist_ok=True)
    for item_id, url in sorted(images.items()):
        path = OUT / f"{item_id}.png"
        path.write_bytes(base64.b64decode(url.split(",", 1)[1]))
        print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main(sys.argv[1:])
