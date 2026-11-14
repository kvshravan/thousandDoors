import * as THREE from 'three';

let activeLoops = 0;

/**
 * Owns the WebGL renderer, canvas, and the single render loop.
 * A "view" is any object with { scene, camera, update(dt) -> needsRender, resize(w, h) }.
 */
export class Engine {
  static get activeLoops() {
    return activeLoops;
  }

  constructor(container, { quality, onContextLost } = {}) {
    if (!container) throw new Error('Engine needs a container element.');

    this.container = container;
    this.quality = quality;
    this.onContextLost = onContextLost;
    this.view = null;
    this.frameCount = 0;
    this.tickCount = 0;
    this.wanted = false;
    this.running = false;
    this.disposed = false;
    this._needsRender = true;
    this._frameWaiters = [];

    this.renderer = new THREE.WebGLRenderer({
      antialias: quality.antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // The room is static, so shadows are only re-rendered on request.
    this.renderer.shadowMap.autoUpdate = false;

    this.canvas = this.renderer.domElement;
    this.canvas.classList.add('engine-canvas');
    container.appendChild(this.canvas);

    this.timer = new THREE.Timer();

    this._tick = this._tick.bind(this);
    this._handleVisibility = this._handleVisibility.bind(this);
    this._handleContextLost = this._handleContextLost.bind(this);

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(container);
    document.addEventListener('visibilitychange', this._handleVisibility);
    this.canvas.addEventListener('webglcontextlost', this._handleContextLost);

    this.resize();
  }

  setView(view) {
    this.view = view;
    this.requestShadowUpdate();
    this.resize();
  }

  setToneMappingExposure(value) {
    this.renderer.toneMappingExposure = value;
  }

  start() {
    if (this.disposed) return;
    this.wanted = true;
    this._syncLoop();
  }

  stop() {
    this.wanted = false;
    this._syncLoop();
  }

  invalidate() {
    this._needsRender = true;
  }

  requestShadowUpdate() {
    this.renderer.shadowMap.needsUpdate = true;
    this._needsRender = true;
  }

  resize() {
    if (this.disposed) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.view?.resize(width, height);
    this._needsRender = true;
  }

  getDebugInfo() {
    return {
      running: this.running,
      activeLoops,
      frames: this.frameCount,
      ticks: this.tickCount,
      quality: this.quality.name,
      pixelRatio: this.renderer.getPixelRatio(),
      canvas: {
        width: this.canvas.width,
        height: this.canvas.height,
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        attached: this.canvas.isConnected,
      },
      memory: { ...this.renderer.info.memory },
      // Draw calls and triangles of the last rendered frame (shadow pass included).
      render: { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles },
    };
  }

  dispose() {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.view = null;
    this._resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this._handleVisibility);
    this.canvas.removeEventListener('webglcontextlost', this._handleContextLost);
    this.timer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
    this._resolveFrameWaiters();
  }

  _syncLoop() {
    const shouldRun = this.wanted && !this.disposed && document.visibilityState !== 'hidden';
    if (shouldRun === this.running) return;
    this.running = shouldRun;
    activeLoops += shouldRun ? 1 : -1;
    if (shouldRun) {
      this.timer.reset();
      this._needsRender = true;
      this.renderer.setAnimationLoop(this._tick);
    } else {
      this.renderer.setAnimationLoop(null);
    }
  }

  _tick(time) {
    if (!this.view) return;
    this.tickCount += 1;
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.1);
    const viewChanged = this.view.update(dt);
    if (viewChanged || this._needsRender) {
      this._needsRender = false;
      this.renderer.render(this.view.scene, this.view.camera);
      this.frameCount += 1;
      this._resolveFrameWaiters();
    }
  }

  /** Resolves after the next frame has been rendered. */
  waitForFrame() {
    this._needsRender = true;
    return new Promise((resolve) => {
      this._frameWaiters.push(resolve);
    });
  }

  _resolveFrameWaiters() {
    if (this._frameWaiters.length === 0) return;
    const waiters = this._frameWaiters;
    this._frameWaiters = [];
    for (const resolve of waiters) resolve();
  }

  _handleVisibility() {
    this._syncLoop();
  }

  _handleContextLost(event) {
    event.preventDefault();
    this.stop();
    this.onContextLost?.();
  }
}
