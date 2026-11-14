/**
 * Ensures exactly one scene is mounted on the engine at a time and that the
 * previous scene releases its GPU resources before the next one loads.
 */
export class SceneManager {
  constructor(engine) {
    this.engine = engine;
    this.current = null;
    this._loadToken = 0;
  }

  async show(createScene, { onProgress } = {}) {
    const token = ++this._loadToken;
    this._unmountCurrent();

    const next = createScene();
    try {
      await next.load(this.engine, { onProgress });
    } catch (error) {
      next.dispose();
      throw error;
    }

    // A newer show() call (or dispose) happened while this one was loading.
    if (token !== this._loadToken || this.engine.disposed) {
      next.dispose();
      return null;
    }

    this.current = next;
    this.engine.setView(next);
    this.engine.start();
    return next;
  }

  dispose() {
    this._loadToken += 1;
    this._unmountCurrent();
  }

  _unmountCurrent() {
    if (!this.current) return;
    this.engine.stop();
    this.engine.setView(null);
    this.current.dispose();
    this.current = null;
  }
}
