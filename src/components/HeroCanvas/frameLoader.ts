import { FrameCache } from './frameCache'
import { clampFrame, getHeroFrameUrl, isRemoteFrame } from './frameSource'

/**
 * Prioritised, bounded-concurrency image loader.
 *
 * The scroll controller republishes a whole desired window on every integer frame
 * change; the loader treats that as the current truth. Pending work outside the
 * window is dropped rather than drained, which is what makes a fast jump to frame
 * 300 stop downloading frames 60..100 and start on 300 immediately.
 */

export interface FrameLoaderOptions {
  cache: FrameCache
  /** Max simultaneous in-flight image requests. */
  maxConcurrent?: number
  /** Called whenever a newly decoded frame lands, so the renderer can re-evaluate. */
  onFrameReady?: (frame: number) => void
}

interface PendingRequest {
  frame: number
  priority: number
}

interface InFlightRequest {
  frame: number
  priority: number
  image: HTMLImageElement
  cleanup: () => void
}

/** Priority bands. Lower number wins. */
export const PRIORITY_EXACT = 0
export const PRIORITY_IDLE_PREFETCH = 100_000

const MAX_ATTEMPTS = 3
const BASE_RETRY_DELAY_MS = 400
const MAX_RETRY_DELAY_MS = 6_000
/** In-flight requests further than this from the target are aborted on a big jump. */
const ABORT_DISTANCE = 120

export class FrameLoader {
  private readonly cache: FrameCache
  private readonly maxConcurrent: number
  private readonly onFrameReady?: (frame: number) => void

  private readonly pending = new Map<number, PendingRequest>()
  private readonly inFlight = new Map<number, InFlightRequest>()
  private readonly attempts = new Map<number, number>()
  private readonly failed = new Set<number>()
  private readonly retryTimers = new Map<number, ReturnType<typeof setTimeout>>()

  private destroyed = false

  constructor(options: FrameLoaderOptions) {
    this.cache = options.cache
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 6)
    this.onFrameReady = options.onFrameReady
  }

  get inFlightCount(): number {
    return this.inFlight.size
  }

  get pendingCount(): number {
    return this.pending.size
  }

  get failedCount(): number {
    return this.failed.size
  }

  /** Queue a single frame at a given priority (or raise the priority of an existing request). */
  request(frame: number, priority: number): void {
    if (this.destroyed) return
    const n = clampFrame(frame)
    if (this.cache.has(n) || this.failed.has(n) || this.retryTimers.has(n)) return

    const active = this.inFlight.get(n)
    if (active !== undefined) {
      if (priority < active.priority) active.priority = priority
      return
    }

    const existing = this.pending.get(n)
    if (existing !== undefined) {
      if (priority < existing.priority) existing.priority = priority
      return
    }
    this.pending.set(n, { frame: n, priority })
  }

  /**
   * Replace the pending queue with a fresh prioritised window.
   *
   * `window` is ordered by urgency; anything already pending but absent from the
   * window is discarded so stale work cannot starve the new target.
   */
  setWindow(window: Array<{ frame: number; priority: number }>, target: number): void {
    if (this.destroyed) return
    this.pending.clear()
    for (const { frame, priority } of window) {
      this.request(frame, priority)
    }
    this.abortStale(target)
    this.pump()
  }

  /** Abort in-flight loads that the viewer has scrolled far away from. */
  private abortStale(target: number): void {
    for (const [frame, request] of this.inFlight) {
      if (Math.abs(frame - target) <= ABORT_DISTANCE) continue
      request.cleanup()
      // Setting src to an empty value is the standard way to abort an image load.
      request.image.src = ''
      this.inFlight.delete(frame)
      // Not a failure: allow this frame to be requested again later.
      this.attempts.delete(frame)
    }
  }

  /** Start loads until the concurrency budget is full, always taking the most urgent first. */
  pump(): void {
    if (this.destroyed) return
    while (this.inFlight.size < this.maxConcurrent && this.pending.size > 0) {
      const next = this.takeMostUrgent()
      if (next === undefined) break
      this.start(next)
    }
  }

  private takeMostUrgent(): PendingRequest | undefined {
    let best: PendingRequest | undefined
    for (const request of this.pending.values()) {
      if (best === undefined || request.priority < best.priority) best = request
    }
    if (best !== undefined) this.pending.delete(best.frame)
    return best
  }

  private start(request: PendingRequest): void {
    const { frame, priority } = request
    const image = new Image()
    // No crossOrigin: the R2 origin does not send Access-Control-Allow-Origin, and
    // the renderer only ever calls drawImage, which does not require CORS.
    image.decoding = 'async'
    image.fetchPriority = priority <= PRIORITY_EXACT ? 'high' : 'auto'

    let settled = false
    const cleanup = () => {
      image.onload = null
      image.onerror = null
    }

    const finish = () => {
      if (settled || this.destroyed) return
      settled = true
      cleanup()
      this.inFlight.delete(frame)
      this.attempts.delete(frame)
      this.cache.set(frame, image)
      this.onFrameReady?.(frame)
      this.pump()
    }

    image.onload = () => {
      // Decoding off the main thread avoids a jank spike on the first drawImage.
      // If decode() is unsupported or rejects, the loaded image is still usable.
      if (typeof image.decode === 'function') {
        image.decode().then(finish, finish)
      } else {
        finish()
      }
    }

    image.onerror = () => {
      if (settled || this.destroyed) return
      settled = true
      cleanup()
      this.inFlight.delete(frame)
      this.scheduleRetry(frame, priority)
      this.pump()
    }

    this.inFlight.set(frame, { frame, priority, image, cleanup })
    image.src = getHeroFrameUrl(frame)
  }

  /** Bounded exponential backoff. After MAX_ATTEMPTS the frame is abandoned for good. */
  private scheduleRetry(frame: number, priority: number): void {
    const attempt = (this.attempts.get(frame) ?? 0) + 1
    this.attempts.set(frame, attempt)

    if (attempt >= MAX_ATTEMPTS) {
      this.failed.add(frame)
      this.attempts.delete(frame)
      if (import.meta.env.DEV) {
        console.warn(
          `[hero] frame ${frame} failed after ${MAX_ATTEMPTS} attempts (${
            isRemoteFrame(frame) ? 'remote' : 'local'
          }); nearest loaded frame will be held instead.`,
        )
      }
      return
    }

    const delay = Math.min(
      MAX_RETRY_DELAY_MS,
      BASE_RETRY_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 200,
    )
    const timer = setTimeout(() => {
      this.retryTimers.delete(frame)
      if (this.destroyed || this.cache.has(frame)) return
      this.pending.set(frame, { frame, priority })
      this.pump()
    }, delay)
    this.retryTimers.set(frame, timer)
  }

  destroy(): void {
    this.destroyed = true
    for (const request of this.inFlight.values()) {
      request.cleanup()
      request.image.src = ''
    }
    for (const timer of this.retryTimers.values()) clearTimeout(timer)
    this.retryTimers.clear()
    this.inFlight.clear()
    this.pending.clear()
    this.attempts.clear()
  }
}
