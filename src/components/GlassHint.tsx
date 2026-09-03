import { useCallback, useEffect, useState } from 'react';

/** Long enough for the hero reveal and the typewriter to have started. */
const APPEAR_DELAY_MS = 900;
const AUTO_DISMISS_MS = 4600;
/** Must match the CSS transition duration below. */
const FADE_MS = 420;

type Phase = 'waiting' | 'visible' | 'leaving' | 'done';

export interface GlassHintProps {
  /**
   * True once the cinematic stage is revealed *and* the interactive glass layer
   * actually came up. Gating on the layer matters: without WebGL there is no
   * glass to shoot, so promising the interaction would be a lie.
   */
  active: boolean;
}

/**
 * Hint for the floating-glass interaction.
 *
 * A quiet frosted panel, not a modal: it never covers the copy, never takes
 * focus, and disappears on its own.
 */
export function GlassHint({ active }: GlassHintProps) {
  const [phase, setPhase] = useState<Phase>('waiting');

  const dismiss = useCallback(() => {
    setPhase((current) => (current === 'visible' ? 'leaving' : current));
  }, []);

  useEffect(() => {
    if (!active || phase !== 'waiting') return;
    const timer = window.setTimeout(() => setPhase('visible'), APPEAR_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [active, phase]);

  useEffect(() => {
    if (phase !== 'visible') return;
    const timer = window.setTimeout(() => setPhase('leaving'), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // Leave the tree entirely once faded, so nothing lingers over the canvas.
  useEffect(() => {
    if (phase !== 'leaving') return;
    const timer = window.setTimeout(() => setPhase('done'), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === 'waiting' || phase === 'done') return null;

  return (
    <div className="glass-hint-layer" data-no-glass-interaction>
      <aside
        className={`glass-hint${phase === 'visible' ? ' is-visible' : ''}`}
        role="status"
        aria-live="polite"
      >
        <span className="glass-hint__mark" aria-hidden="true" />
        <p className="glass-hint__text">
          Shoot your shuriken to smash floating glass!
        </p>
        <button type="button" className="glass-hint__action" onClick={dismiss}>
          Got it
        </button>
      </aside>
    </div>
  );
}
