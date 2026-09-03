import * as THREE from 'three';
import { PARALLAX_RANGE, resolveTuning } from '../config';
import type { Tuning } from '../config';
import { ShatterAudio } from '../audio/ShatterAudio';
import { FragmentSystem } from './FragmentSystem';
import { GlassSystem } from './GlassSystem';
import { InteractionScene } from './createInteractionScene';
import { PointerInteraction } from './PointerInteraction';
import { ShurikenSystem } from './ShurikenSystem';

export interface InteractionRuntimeOptions {
  container: HTMLElement;
  reducedMotion: boolean;
  /** Reports transitions into and out of a claimable glass shard. */
  onHoverChange?: (hovering: boolean) => void;
  /**
   * Region whose arrival means the overlay is no longer visually relevant (the
   * frosted footer). Optional: without it the layer simply never goes quiet.
   */
  quietZone?: Element | null;
}

/** Longest simulation step we will integrate, so a paused tab cannot teleport. */
const MAX_STEP = 0.05;

/** Matches the canvas opacity transition in the stylesheet. */
const QUIET_FADE_MS = 460;

/** How much of the quiet zone must be on screen before the layer stands down. */
const QUIET_THRESHOLD = 0.7;

/**
 * Owns the single animation loop and wires the four systems together.
 *
 * Deliberately framework-free: React mounts and unmounts it, and never sees a
 * per-frame update. Nothing in here reads the frame-sequence loader, the GSAP
 * timeline or the playhead - the only coupling to the Phase 1 scroll experience
 * is a passive `window.scrollY` read for parallax.
 */
export class InteractionRuntime {
  private readonly container: HTMLElement;
  private readonly reducedMotion: boolean;
  private readonly onHoverChange?: (hovering: boolean) => void;

  private readonly view: InteractionScene;
  private readonly glass: GlassSystem;
  private readonly shuriken: ShurikenSystem;
  private readonly fragments: FragmentSystem;
  private readonly pointer: PointerInteraction;
  private readonly audio = new ShatterAudio();

  private readonly resizeObserver: ResizeObserver;
  private readonly quietObserver: IntersectionObserver | null = null;

  /** Reused every frame; the loop allocates nothing. */
  private readonly impactPoint = new THREE.Vector3();

  private tuning: Tuning;
  private rafId = 0;
  private lastTime = 0;
  private running = false;
  private destroyed = false;
  private hidden = false;
  private quiet = false;
  private quietTimer = 0;
  private scrollable = 1;
  private width = 0;
  private height = 0;
  private hoveringGlass = false;

  constructor(options: InteractionRuntimeOptions) {
    this.container = options.container;
    this.reducedMotion = options.reducedMotion;
    this.onHoverChange = options.onHoverChange;

    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;
    this.tuning = resolveTuning(this.width, this.reducedMotion);

    this.view = new InteractionScene();
    const canvas = this.view.renderer.domElement;
    canvas.className = 'three-interaction-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.quiet = 'false';
    this.container.appendChild(canvas);

    this.view.resize(this.width, this.height);

    this.glass = new GlassSystem(
      this.tuning,
      this.view.halfWidth,
      this.view.halfHeight,
    );
    this.shuriken = new ShurikenSystem(this.tuning);
    this.fragments = new FragmentSystem(this.tuning);
    this.view.scene.add(
      this.glass.root,
      this.fragments.root,
      this.shuriken.root,
    );

    this.pointer = new PointerInteraction({
      camera: this.view.camera,
      surface: canvas,
    });

    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(this.container);
    window.addEventListener('orientationchange', this.handleResize);
    document.addEventListener('visibilitychange', this.handleVisibility);
    canvas.addEventListener('webglcontextlost', this.handleContextLost);

    const quietZone = options.quietZone;
    if (quietZone != null) {
      this.quietObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            this.setQuiet(
              entry.isIntersecting &&
                entry.intersectionRatio >= QUIET_THRESHOLD,
            );
          }
        },
        { threshold: [0, QUIET_THRESHOLD, 1] },
      );
      this.quietObserver.observe(quietZone);
    }

    this.measureScrollable();
    this.glass.start(performance.now());
    this.syncLoop();
  }

  /* -- loop control ------------------------------------------------------- */

  private syncLoop(): void {
    const shouldRun = !this.destroyed && !this.hidden && !this.quiet;
    if (shouldRun === this.running) return;
    this.running = shouldRun;
    if (shouldRun) {
      this.lastTime = 0;
      this.rafId = requestAnimationFrame(this.tick);
    } else {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private handleVisibility = () => {
    this.hidden = document.visibilityState === 'hidden';
    this.pointer.setEnabled(!this.hidden && !this.quiet);
    this.syncLoop();
  };

  /**
   * Fade the layer out first, and only stop rendering once it is invisible, so
   * the loop is never paused while glass is still on screen.
   */
  private setQuiet(quiet: boolean): void {
    if (this.quiet === quiet || this.destroyed) return;
    this.quiet = quiet;
    this.pointer.setEnabled(!quiet && !this.hidden);
    const canvas = this.view.renderer.domElement;
    window.clearTimeout(this.quietTimer);

    if (quiet) {
      canvas.dataset.quiet = 'true';
      this.glass.setHover(null);
      this.setHoverCursor(false);
      this.quietTimer = window.setTimeout(() => {
        if (this.quiet) this.syncLoop();
      }, QUIET_FADE_MS);
    } else {
      canvas.dataset.quiet = 'false';
      this.syncLoop();
    }
  }

  private handleContextLost = (event: Event) => {
    // Nothing to restore in a decorative layer: stand down and leave Phase 1 be.
    event.preventDefault();
    this.destroyed = true;
    this.setHoverCursor(false);
    this.syncLoop();
    this.view.renderer.domElement.dataset.quiet = 'true';
  };

  /* -- resize ------------------------------------------------------------- */

  private measureScrollable(): void {
    this.scrollable = Math.max(
      1,
      document.documentElement.scrollHeight -
        document.documentElement.clientHeight,
    );
  }

  private handleResize = () => {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    if (width === this.width && height === this.height) return;

    this.width = width;
    this.height = height;
    this.view.resize(width, height);

    this.tuning = resolveTuning(width, this.reducedMotion);
    this.glass.applyTuning(this.tuning);
    this.shuriken.applyTuning(this.tuning);
    this.fragments.applyTuning(this.tuning);
    this.glass.resize(this.view.halfWidth, this.view.halfHeight);

    this.measureScrollable();
    if (!this.running) this.view.render();
  };

  /* -- frame -------------------------------------------------------------- */

  private tick = (now: number) => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const delta =
      this.lastTime === 0
        ? 1 / 60
        : Math.min(MAX_STEP, (now - this.lastTime) / 1000);
    this.lastTime = now;

    this.handleHover();
    this.handlePick();

    // Passive read only: no layout is forced and the GSAP scrub is untouched.
    const progress = Math.min(1, Math.max(0, window.scrollY / this.scrollable));
    this.glass.setParallax(
      -progress * PARALLAX_RANGE * this.tuning.motionScale,
    );

    this.glass.update(delta, now);
    this.fragments.update(delta);

    const landed = this.shuriken.update(delta);
    if (landed !== null) this.resolveImpact(landed, now);

    this.view.render();
  };

  private handleHover(): void {
    const hover = this.pointer.takeHover();
    if (hover === null) return;
    if (hover === 'clear') {
      this.glass.setHover(null);
      this.setHoverCursor(false);
      return;
    }
    const slotIndex = this.glass.pick(hover);
    // Hovering a shard is the earliest strong signal that a throw is coming, so
    // it is where the sound pool gets warmed - well before the first impact.
    if (slotIndex !== null) this.audio.prime();
    this.glass.setHover(slotIndex);
    this.setHoverCursor(this.glass.hasHover);
  }

  private setHoverCursor(hovering: boolean): void {
    if (hovering === this.hoveringGlass) return;
    this.hoveringGlass = hovering;
    this.onHoverChange?.(hovering);
  }

  private handlePick(): void {
    const pick = this.pointer.takePick();
    if (pick === null) return;
    // Touch has no hover, so a tap is also a priming opportunity. `prime` is a
    // no-op after the first call.
    this.audio.prime();
    // One shuriken in the air at a time. Extra clicks are simply ignored, which
    // is both the simplest rule and the one that cannot spam projectiles.
    if (this.shuriken.busy) return;

    const slotIndex = this.glass.pick(pick);
    if (slotIndex === null) return;
    if (!this.glass.reserve(slotIndex)) return;

    this.glass.positionOf(slotIndex, this.impactPoint);
    this.shuriken.throwAt(
      this.impactPoint,
      slotIndex,
      this.view.halfWidth,
      this.view.halfHeight,
    );
  }

  private resolveImpact(slotIndex: number, now: number): void {
    // Read the shard's live position rather than the aim point captured at
    // launch, so the burst starts exactly where the plate actually is.
    this.glass.positionOf(slotIndex, this.impactPoint);
    this.fragments.flash(this.impactPoint.x, this.impactPoint.y);
    this.fragments.burst(this.impactPoint.x, this.impactPoint.y);
    this.glass.shatter(slotIndex, now);
    // Always downstream of the click that threw the shuriken, so the document
    // already has user activation and playback is allowed.
    this.audio.play();
  }

  /* -- diagnostics -------------------------------------------------------- */

  debug(): Record<string, unknown> {
    const halfW = this.view.halfWidth;
    const halfH = this.view.halfHeight;
    return {
      // Screen-space centres of every slot, so an automated pass can aim at a
      // shard without guessing.
      shards: this.glass.report.map((shard) => ({
        index: shard.index,
        state: shard.state,
        band: shard.band,
        screenX: Math.round(((shard.x / halfW) * 0.5 + 0.5) * this.width),
        screenY: Math.round((0.5 - (shard.y / halfH) * 0.5) * this.height),
        radiusPx: Math.round((shard.reach / halfH) * 0.5 * this.height),
      })),
      viewport: { width: this.width, height: this.height },
      bandTargets: this.glass.bandTargets,
      running: this.running,
      quiet: this.quiet,
      hidden: this.hidden,
      dpr: this.view.renderer.getPixelRatio(),
      glassCount: this.tuning.glassCount,
      glassStates: this.glass.census,
      activeFragments: this.fragments.activeCount,
      shurikenBusy: this.shuriken.busy,
      audioVoices: this.audio.voiceCount,
      sceneChildren: this.view.scene.children.length,
      renderCalls: this.view.renderer.info.render.calls,
      geometries: this.view.renderer.info.memory.geometries,
      textures: this.view.renderer.info.memory.textures,
      programs: this.view.renderer.info.programs?.length ?? 0,
    };
  }

  /* -- teardown ----------------------------------------------------------- */

  dispose(): void {
    this.destroyed = true;
    this.setHoverCursor(false);
    this.syncLoop();
    window.clearTimeout(this.quietTimer);

    this.resizeObserver.disconnect();
    this.quietObserver?.disconnect();
    window.removeEventListener('orientationchange', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibility);

    const canvas = this.view.renderer.domElement;
    canvas.removeEventListener('webglcontextlost', this.handleContextLost);

    this.pointer.dispose();
    this.shuriken.cancel();
    this.audio.dispose();

    this.view.scene.remove(
      this.glass.root,
      this.fragments.root,
      this.shuriken.root,
    );
    this.glass.dispose();
    this.shuriken.dispose();
    this.fragments.dispose();
    this.view.dispose();

    canvas.remove();
  }
}
