import { useEffect, useRef, useState } from 'react';
import { InteractionRuntime } from './scene/InteractionRuntime';

export interface ThreeInteractionLayerProps {
  reducedMotion: boolean;
  /**
   * Reports whether the WebGL layer actually came up. Lifecycle-level only -
   * fired once per mount, never per frame - so callers can gate UI that would
   * otherwise promise an interaction this browser cannot provide.
   */
  onActiveChange?: (active: boolean) => void;
}

/**
 * Phase 2A - floating glass interaction.
 *
 * A transparent WebGL canvas layered between the Phase 1 frame sequence and the
 * editorial DOM. The canvas itself is `pointer-events: none`; pointer handling
 * happens at the window and stands down for real controls, so the site's own UI
 * always wins.
 *
 * React only mounts and unmounts the runtime. No per-frame state crosses this
 * boundary - see InteractionRuntime.
 *
 * Imported lazily by App, and rendered only once the cinematic bootstrap has
 * revealed the stage, so neither the Three.js chunk nor this WebGL context ever
 * competes with the frame loader for bandwidth or main-thread time during the
 * first paint.
 */
export function ThreeInteractionLayer({
  reducedMotion,
  onActiveChange,
}: ThreeInteractionLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const [hoveringGlass, setHoveringGlass] = useState(false);

  // Held in a ref so a parent re-render can never tear the runtime down.
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;

  useEffect(() => {
    const moveCursor = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || cursorRef.current === null) return;
      cursorRef.current.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
    };

    window.addEventListener('pointermove', moveCursor, { passive: true });
    return () => window.removeEventListener('pointermove', moveCursor);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle(
      'is-hovering-glass',
      hoveringGlass,
    );
    return () => document.documentElement.classList.remove('is-hovering-glass');
  }, [hoveringGlass]);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    let runtime: InteractionRuntime;
    try {
      runtime = new InteractionRuntime({
        container,
        reducedMotion,
        onHoverChange: setHoveringGlass,
        // The frosted footer means the overlay is no longer visually relevant.
        // Queried by class rather than wired through props to keep this layer
        // decoupled from the Phase 1 section components.
        quietZone: document.querySelector('.story-section--footer'),
      });
    } catch (error) {
      // Progressive enhancement: no WebGL, no glass, and the Phase 1 site is
      // completely untouched.
      if (import.meta.env.DEV) {
        console.warn('[glass] Three.js interaction layer unavailable', error);
      }
      onActiveChangeRef.current?.(false);
      return;
    }

    onActiveChangeRef.current?.(true);

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__glassDebug = () =>
        runtime.debug();
    }

    return () => {
      runtime.dispose();
      onActiveChangeRef.current?.(false);
      if (import.meta.env.DEV) {
        delete (window as unknown as Record<string, unknown>).__glassDebug;
      }
    };
  }, [reducedMotion]);

  return (
    <div
      className="future-interactive-layer three-interaction-layer"
      id="future-interactive-layer"
      ref={containerRef}
      aria-hidden="true"
    >
      <div
        className={`shuriken-cursor${hoveringGlass ? ' is-visible' : ''}`}
        ref={cursorRef}
      >
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M24 3C26 11 28 16 32 19L45 24C37 26 32 28 29 32L24 45C22 37 20 32 16 29L3 24C11 22 16 20 19 16Z" />
          <circle cx="24" cy="24" r="3.2" />
        </svg>
      </div>
    </div>
  );
}
