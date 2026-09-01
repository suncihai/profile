import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { computeMetrics, drawFrame, maxDevicePixelRatio, resizeCanvas } from './canvasRenderer'
import type { CanvasMetrics } from './canvasRenderer'
import { FrameStreamer, pickProfile } from './frameStreamer'
import { LOCAL_FRAME_COUNT, TOTAL_FRAMES, clampFrame } from './frameSource'

/** Shared, mutable playhead written by GSAP and read by the render loop. */
export interface Playhead {
  frame: number
}

export interface HeroCanvasProps {
  playheadRef: RefObject<Playhead>
  reducedMotion: boolean
  /** Local-bootstrap progress, 0..LOCAL_FRAME_COUNT. */
  onBootstrapProgress?: (loaded: number) => void
  /** Fired once when enough local frames exist to reveal the experience. */
  onReady?: () => void
}

/** Frame held for reduced-motion visitors. Local, so it is always available offline of R2. */
const REDUCED_MOTION_FRAME = 12

/** Reveal even if the local bootstrap is still finishing on a slow connection. */
const READY_TIMEOUT_MS = 4000

/** Viewports narrower than this get the reduced streaming/DPR profile. */
const COMPACT_BREAKPOINT = 820

export function HeroCanvas({
  playheadRef,
  reducedMotion,
  onBootstrapProgress,
  onReady,
}: HeroCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Callbacks are held in refs so the effect below never re-runs (and never tears
  // down the streamer) just because a parent re-rendered.
  const onBootstrapProgressRef = useRef(onBootstrapProgress)
  const onReadyRef = useRef(onReady)
  onBootstrapProgressRef.current = onBootstrapProgress
  onReadyRef.current = onReady

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (container === null || canvas === null) return

    const ctx = canvas.getContext('2d', { alpha: false })
    if (ctx === null) return

    const isCompact = window.innerWidth < COMPACT_BREAKPOINT
    const profile = pickProfile(isCompact)

    let metrics: CanvasMetrics = computeMetrics(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
      maxDevicePixelRatio(isCompact),
    )
    resizeCanvas(canvas, ctx, metrics)

    // Bumped whenever a frame lands, so the loop knows a better image may exist
    // without having to diff the cache on every tick.
    let cacheVersion = 0
    let renderedVersion = -1
    let drawnFrame = -1
    let lastTarget = -1
    let needsRedraw = true
    let localLoaded = 0
    let ready = false
    let rafId = 0

    const streamer = new FrameStreamer(profile, (frame) => {
      cacheVersion += 1
      if (frame <= LOCAL_FRAME_COUNT) {
        localLoaded += 1
        onBootstrapProgressRef.current?.(Math.min(localLoaded, LOCAL_FRAME_COUNT))
        if (localLoaded >= LOCAL_FRAME_COUNT) markReady()
      }
    })

    const markReady = () => {
      if (ready) return
      ready = true
      onReadyRef.current?.()
      // Reduced motion holds a single local frame, so there is no 20 -> 21 boundary
      // to protect and no reason to touch R2 at all.
      if (reducedMotion) return
      // Stage B: only once the page is actually usable, and only when the browser
      // says it is idle, do we reach across to R2 for the transition range.
      const startTransitionPrefetch = () => streamer.queueTransitionPrefetch()
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(startTransitionPrefetch, { timeout: 2000 })
      } else {
        window.setTimeout(startTransitionPrefetch, 600)
      }
    }

    const readyTimer = window.setTimeout(() => {
      // Slow network: reveal as soon as anything is paintable rather than blocking.
      if (streamer.cache.size > 0) markReady()
    }, READY_TIMEOUT_MS)

    const paint = (target: number) => {
      const best = streamer.cache.nearest(target, streamer.currentDirection)
      if (best === undefined) return false
      // Never clear to blank: if the exact frame is missing we simply hold the
      // nearest loaded one until a better image arrives.
      if (best.frame === drawnFrame && !needsRedraw) return true
      drawFrame(ctx, best.image, metrics)
      drawnFrame = best.frame
      needsRedraw = false
      return true
    }

    const tick = () => {
      rafId = requestAnimationFrame(tick)

      const target = clampFrame(playheadRef.current?.frame ?? 1)
      const targetChanged = target !== lastTarget
      const cacheChanged = cacheVersion !== renderedVersion

      if (!targetChanged && !cacheChanged && !needsRedraw) return

      if (targetChanged) {
        lastTarget = target
        streamer.update(target, performance.now())
      }
      renderedVersion = cacheVersion
      paint(target)
    }

    const handleResize = () => {
      const width = container.clientWidth || window.innerWidth
      const height = container.clientHeight || window.innerHeight
      if (width === metrics.cssWidth && height === metrics.cssHeight) return
      // Recompute compactness from the live viewport so a rotated or resized
      // window gets the right DPR cap, not the one measured at mount.
      metrics = computeMetrics(width, height, maxDevicePixelRatio(width < COMPACT_BREAKPOINT))
      resizeCanvas(canvas, ctx, metrics)
      needsRedraw = true
      // Repaint immediately so a resize never leaves a stretched or blank canvas.
      paint(clampFrame(playheadRef.current?.frame ?? drawnFrame))
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(container)
    window.addEventListener('orientationchange', handleResize)

    if (reducedMotion) {
      // No 483-frame scrub: load one representative local frame and hold it.
      streamer.loader.request(REDUCED_MOTION_FRAME, 0)
      for (let frame = 1; frame <= 4; frame += 1) streamer.loader.request(frame, 10 + frame)
      streamer.loader.pump()
      const holdStill = () => {
        const best = streamer.cache.nearest(REDUCED_MOTION_FRAME, 1)
        if (best !== undefined) {
          drawFrame(ctx, best.image, metrics)
          drawnFrame = best.frame
          needsRedraw = false
        }
      }
      const interval = window.setInterval(holdStill, 200)
      const stopHolding = window.setTimeout(() => window.clearInterval(interval), 8000)
      window.setTimeout(markReady, 400)
      return () => {
        window.clearInterval(interval)
        window.clearTimeout(stopHolding)
        window.clearTimeout(readyTimer)
        resizeObserver.disconnect()
        window.removeEventListener('orientationchange', handleResize)
        streamer.destroy()
      }
    }

    streamer.bootstrapLocalFrames()
    rafId = requestAnimationFrame(tick)

    if (import.meta.env.DEV) {
      // Dev-only diagnostics. Deliberately pull-based: no per-scroll logging.
      ;(window as unknown as Record<string, unknown>).__heroDebug = () => ({
        targetFrame: lastTarget,
        drawnFrame,
        totalFrames: TOTAL_FRAMES,
        loadedFrames: streamer.cache.size,
        cacheCapacity: streamer.cache.getCapacity(),
        inFlight: streamer.loader.inFlightCount,
        pending: streamer.loader.pendingCount,
        failed: streamer.loader.failedCount,
        velocityFps: Math.round(streamer.velocity),
        lookahead: streamer.lookahead,
        direction: streamer.currentDirection,
        fit: metrics.fit,
        dpr: metrics.dpr,
        cachedFrameNumbers: streamer.cache.loadedFrames().sort((a, b) => a - b),
      })
    }

    return () => {
      cancelAnimationFrame(rafId)
      window.clearTimeout(readyTimer)
      resizeObserver.disconnect()
      window.removeEventListener('orientationchange', handleResize)
      streamer.destroy()
      if (import.meta.env.DEV) {
        delete (window as unknown as Record<string, unknown>).__heroDebug
      }
    }
  }, [playheadRef, reducedMotion])

  return (
    <div className="hero-canvas-layer" ref={containerRef} aria-hidden="true">
      <canvas className="hero-canvas" ref={canvasRef} />
      <div className="hero-canvas-vignette" />
    </div>
  )
}
