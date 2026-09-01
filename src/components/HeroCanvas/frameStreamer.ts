import { FrameCache } from './frameCache'
import { FrameLoader, PRIORITY_IDLE_PREFETCH } from './frameLoader'
import { LOCAL_FRAME_COUNT, TOTAL_FRAMES, clampFrame } from './frameSource'

/**
 * Scroll-aware streaming policy: turns "the viewer is at frame N moving forward at
 * V frames/second" into a prioritised set of frames to hold in memory.
 *
 * Three stages, as designed:
 *   A. bootstrap  - local frames 1..20, loaded immediately, highest priority.
 *   B. transition - a small idle-time prefetch of the first remote frames so that
 *                   crossing the 20 -> 21 boundary never stalls.
 *   C. streaming  - a direction-biased window that follows the playhead.
 */

export interface StreamProfile {
  /** Decoded-frame budget. */
  cacheCapacity: number
  /** Simultaneous network requests. */
  maxConcurrent: number
  /** Lookahead bounds, in frames. */
  minLookahead: number
  maxLookahead: number
  /** How many already-passed frames to keep queued as a reverse-scroll safety net. */
  behind: number
  /** Upper bound of the stage-B idle prefetch range (starts at LOCAL_FRAME_COUNT + 1). */
  transitionPrefetchTo: number
}

export const DESKTOP_PROFILE: StreamProfile = {
  cacheCapacity: 72,
  maxConcurrent: 6,
  minLookahead: 15,
  maxLookahead: 70,
  behind: 10,
  transitionPrefetchTo: 50,
}

export const COMPACT_PROFILE: StreamProfile = {
  cacheCapacity: 34,
  maxConcurrent: 4,
  minLookahead: 10,
  maxLookahead: 40,
  behind: 6,
  transitionPrefetchTo: 36,
}

export const SAVE_DATA_PROFILE: StreamProfile = {
  cacheCapacity: 24,
  maxConcurrent: 3,
  minLookahead: 8,
  maxLookahead: 24,
  behind: 4,
  transitionPrefetchTo: 28,
}

interface ConnectionLike {
  saveData?: boolean
}

/**
 * Network Information API is used only as an optional hint; every code path works
 * when it is absent.
 */
export function pickProfile(isCompact: boolean): StreamProfile {
  const connection = (navigator as Navigator & { connection?: ConnectionLike }).connection
  if (connection?.saveData === true) return SAVE_DATA_PROFILE
  return isCompact ? COMPACT_PROFILE : DESKTOP_PROFILE
}

/** Velocity -> forward horizon. Simple, clamped, and cheap on purpose. */
export function computeLookahead(
  framesPerSecond: number,
  profile: StreamProfile,
): number {
  const speed = Math.abs(framesPerSecond)
  const horizon = profile.minLookahead + speed * 0.28
  return Math.round(Math.min(profile.maxLookahead, Math.max(profile.minLookahead, horizon)))
}

export class FrameStreamer {
  readonly cache: FrameCache
  readonly loader: FrameLoader
  readonly profile: StreamProfile

  /** Frames still wanted at idle priority (stage B). Drains as they arrive. */
  private readonly backgroundQueue = new Set<number>()

  /**
   * Local frames not yet decoded (stage A). Held separately from the pending queue
   * because `publish()` replaces that queue wholesale: without this, the very first
   * scroll window would silently drop the tail of the bootstrap set and startup
   * would stall until the safety timeout.
   */
  private readonly bootstrapQueue = new Set<number>()

  private lastTarget = 1
  private lastSampleTime = 0
  private smoothedVelocity = 0
  private direction: 1 | -1 = 1
  private lastLookahead: number

  constructor(profile: StreamProfile, onFrameReady?: (frame: number) => void) {
    this.profile = profile
    this.lastLookahead = profile.minLookahead
    this.cache = new FrameCache({ capacity: profile.cacheCapacity })
    this.loader = new FrameLoader({
      cache: this.cache,
      maxConcurrent: profile.maxConcurrent,
      onFrameReady,
    })
  }

  /** Stage A: pull every local frame in ascending order so frame 1 paints first. */
  bootstrapLocalFrames(): void {
    for (let frame = 1; frame <= LOCAL_FRAME_COUNT; frame += 1) {
      this.bootstrapQueue.add(frame)
      this.loader.request(frame, frame)
    }
    this.loader.pump()
  }

  /** Stage B: queue the first remote frames at idle priority. */
  queueTransitionPrefetch(): void {
    const end = Math.min(TOTAL_FRAMES, this.profile.transitionPrefetchTo)
    for (let frame = LOCAL_FRAME_COUNT + 1; frame <= end; frame += 1) {
      if (!this.cache.has(frame)) this.backgroundQueue.add(frame)
    }
    this.publish(this.lastTarget)
  }

  get currentDirection(): 1 | -1 {
    return this.direction
  }

  get velocity(): number {
    return this.smoothedVelocity
  }

  get lookahead(): number {
    return this.lastLookahead
  }

  /**
   * Stage C: called whenever the integer target frame changes. Updates the velocity
   * estimate, then republishes the desired window to the loader.
   */
  update(target: number, now: number): void {
    const clamped = clampFrame(target)
    const elapsed = now - this.lastSampleTime

    if (this.lastSampleTime > 0 && elapsed > 0) {
      const instantaneous = ((clamped - this.lastTarget) / elapsed) * 1000
      // Exponential moving average: enough smoothing to ignore wheel jitter without
      // lagging behind a genuine fling.
      this.smoothedVelocity = this.smoothedVelocity * 0.7 + instantaneous * 0.3
    }

    if (clamped !== this.lastTarget) {
      this.direction = clamped > this.lastTarget ? 1 : -1
    }

    this.lastTarget = clamped
    this.lastSampleTime = now
    this.publish(clamped)
  }

  private publish(target: number): void {
    const lookahead = computeLookahead(this.smoothedVelocity, this.profile)
    this.lastLookahead = lookahead

    const window: Array<{ frame: number; priority: number }> = []
    const seen = new Set<number>()

    const push = (frame: number, priority: number) => {
      const n = clampFrame(frame)
      if (seen.has(n)) return
      seen.add(n)
      if (this.cache.has(n)) return
      window.push({ frame: n, priority })
    }

    // 1. the exact frame the viewer is on
    push(target, 0)

    // 2/3. nearest missing frames, biased hard toward the direction of travel
    // 4. a shorter backward safety net
    const span = Math.max(lookahead, this.profile.behind)
    for (let i = 1; i <= span; i += 1) {
      if (i <= lookahead) push(target + this.direction * i, i * 2)
      if (i <= this.profile.behind) push(target - this.direction * i, i * 6 + 3)
    }

    // 4b. any local bootstrap frame still missing, so stage A always completes.
    // Priority mirrors frame order (frame 1 first) but never outranks the frame
    // currently on screen.
    for (const frame of this.bootstrapQueue) {
      if (this.cache.has(frame)) {
        this.bootstrapQueue.delete(frame)
        continue
      }
      push(frame, frame)
    }

    // 5. idle/background prefetch, always last
    let idleRank = 0
    for (const frame of this.backgroundQueue) {
      if (this.cache.has(frame)) {
        this.backgroundQueue.delete(frame)
        continue
      }
      push(frame, PRIORITY_IDLE_PREFETCH + idleRank)
      idleRank += 1
    }

    // Keep the on-screen frame and its immediate neighbourhood un-evictable.
    const protectedFrames: number[] = []
    for (let i = -3; i <= Math.min(lookahead, 24); i += 1) {
      protectedFrames.push(clampFrame(target + this.direction * i))
    }
    this.cache.protect(protectedFrames)

    this.loader.setWindow(window, target)
  }

  destroy(): void {
    this.loader.destroy()
    this.cache.clear()
    this.backgroundQueue.clear()
    this.bootstrapQueue.clear()
  }
}
