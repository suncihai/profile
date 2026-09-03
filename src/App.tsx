import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { HeroCanvas } from './components/HeroCanvas/HeroCanvas'
import type { Playhead } from './components/HeroCanvas/HeroCanvas'
import { TOTAL_FRAMES } from './components/HeroCanvas/frameSource'
import { Loader } from './components/Loader'
import { Navigation } from './components/Navigation'
import { DevDiagnostics } from './components/DevDiagnostics'
import { GlassHint } from './components/GlassHint'
import { HeroIntro } from './sections/HeroIntro'
import { Philosophy } from './sections/Philosophy'
import { Experience } from './sections/Experience'
import { FeaturedWork } from './sections/FeaturedWork'
import { Footer } from './sections/Footer'
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion'
import { useStoryReveal } from './hooks/useStoryReveal'

gsap.registerPlugin(ScrollTrigger)

/**
 * Phase 2A ships Three.js in its own chunk, requested only after the cinematic
 * bootstrap has revealed the stage. The first paint - and the 20-frame local
 * bootstrap it depends on - is byte-for-byte unaffected.
 */
const ThreeInteractionLayer = lazy(async () => ({
  default: (await import('./interaction/ThreeInteractionLayer')).ThreeInteractionLayer,
}))

/**
 * CinematicStage.
 *
 * Layering, back to front:
 *   1. HeroCanvasLayer          - the streamed frame sequence (fixed, decorative)
 *   2. ThreeInteractionLayer    - Phase 2A: transparent WebGL floating glass.
 *                                 pointer-events: none; picks are raycast from
 *                                 window-level pointer events
 *   3. EditorialStoryLayer      - all real DOM copy; no typography is ever painted
 *                                 into the canvas
 *   4. Navigation + Loader      - chrome
 *   5. GlassHint                - one-time frosted first-visit hint
 */
export default function App() {
  const reducedMotion = usePrefersReducedMotion()
  const storyRef = useRef<HTMLElement>(null)

  // Mutable playhead shared between the GSAP scrub and the canvas render loop.
  // Deliberately a ref: writing frame numbers through React state on every scroll
  // tick would re-render the whole tree ~60 times a second.
  const playheadRef = useRef<Playhead>({ frame: 1 })

  const [bootstrapLoaded, setBootstrapLoaded] = useState(0)
  const [ready, setReady] = useState(false)
  // Whether the Phase 2 glass layer actually came up. Lifecycle only - the
  // interaction itself never touches React state.
  const [glassActive, setGlassActive] = useState(false)

  const handleReady = useCallback(() => setReady(true), [])

  useStoryReveal(storyRef, !reducedMotion)

  // Scroll -> frame. One tween on the playhead object drives everything.
  useEffect(() => {
    const story = storyRef.current
    if (story === null || reducedMotion) return

    const ctx = gsap.context(() => {
      gsap.to(playheadRef.current, {
        frame: TOTAL_FRAMES,
        ease: 'none',
        scrollTrigger: {
          trigger: story,
          start: 'top top',
          // Finish the sequence one viewport before the document ends so frame 483
          // is already on screen, and stays there, behind the footer.
          end: () => `+=${Math.max(1, story.offsetHeight - window.innerHeight * 2)}`,
          scrub: 0.4,
          invalidateOnRefresh: true,
        },
      })
    })

    return () => ctx.revert()
  }, [reducedMotion])

  return (
    <div className="cinematic-stage" data-reduced-motion={reducedMotion ? 'true' : 'false'}>
      <HeroCanvas
        playheadRef={playheadRef}
        reducedMotion={reducedMotion}
        onBootstrapProgress={setBootstrapLoaded}
        onReady={handleReady}
      />

      {/*
        Phase 2A interaction layer. Sits above the cinematic canvas and below the
        editorial copy, and mounts only once the stage is revealed. Phase 2B
        (camera / gesture recognition) lands in the same slot.
      */}
      <Suspense fallback={null}>
        {ready ? (
          <ThreeInteractionLayer
            reducedMotion={reducedMotion}
            onActiveChange={setGlassActive}
          />
        ) : null}
      </Suspense>

      <Navigation visible={ready} />

      <main className={`story${ready ? ' is-ready' : ''}`} ref={storyRef}>
        <HeroIntro reducedMotion={reducedMotion} started={ready} />
        <Philosophy />
        <Experience />
        <FeaturedWork />
        <Footer />
      </main>

      <GlassHint active={ready && glassActive} />

      <Loader loaded={bootstrapLoaded} hidden={ready} />
      {import.meta.env.DEV ? <DevDiagnostics /> : null}
    </div>
  )
}
