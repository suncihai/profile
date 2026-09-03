import { useEffect, useRef } from 'react'
import { InteractionRuntime } from './scene/InteractionRuntime'

export interface ThreeInteractionLayerProps {
  reducedMotion: boolean
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
export function ThreeInteractionLayer({ reducedMotion }: ThreeInteractionLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return

    let runtime: InteractionRuntime
    try {
      runtime = new InteractionRuntime({
        container,
        reducedMotion,
        // The frosted footer means the overlay is no longer visually relevant.
        // Queried by class rather than wired through props to keep this layer
        // decoupled from the Phase 1 section components.
        quietZone: document.querySelector('.story-section--footer'),
      })
    } catch (error) {
      // Progressive enhancement: no WebGL, no glass, and the Phase 1 site is
      // completely untouched.
      if (import.meta.env.DEV) {
        console.warn('[glass] Three.js interaction layer unavailable', error)
      }
      return
    }

    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__glassDebug = () => runtime.debug()
    }

    return () => {
      runtime.dispose()
      if (import.meta.env.DEV) {
        delete (window as unknown as Record<string, unknown>).__glassDebug
      }
    }
  }, [reducedMotion])

  return (
    <div
      className="future-interactive-layer three-interaction-layer"
      id="future-interactive-layer"
      ref={containerRef}
      aria-hidden="true"
    />
  )
}
