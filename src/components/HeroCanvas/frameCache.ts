/**
 * Bounded LRU cache of decoded frames.
 *
 * A decoded 1920x1088 frame costs roughly 1920 * 1088 * 4 bytes ~= 8.4 MB of
 * bitmap memory. Retaining all 483 would be ~4 GB, so the cache is capped and
 * evicts least-recently-used entries. The HTTP layer, not this cache, is the
 * long-term store: scrolling back re-requests frames rather than holding them.
 *
 * Frames are HTMLImageElement rather than ImageBitmap because the R2 origin does
 * not send Access-Control-Allow-Origin (verified). `drawImage` works fine with a
 * no-CORS image; only pixel readback would be blocked, and the renderer never
 * reads pixels back.
 */

export interface FrameCacheOptions {
  capacity: number
}

export class FrameCache {
  /** Insertion order doubles as recency order: re-inserting moves an entry to the end. */
  private readonly entries = new Map<number, HTMLImageElement>()
  private readonly protectedFrames = new Set<number>()
  private capacity: number

  constructor(options: FrameCacheOptions) {
    this.capacity = Math.max(8, options.capacity)
  }

  get size(): number {
    return this.entries.size
  }

  getCapacity(): number {
    return this.capacity
  }

  setCapacity(capacity: number): void {
    this.capacity = Math.max(8, capacity)
    this.evictIfNeeded()
  }

  has(frame: number): boolean {
    return this.entries.has(frame)
  }

  /** Look up a frame and mark it as most-recently-used. */
  get(frame: number): HTMLImageElement | undefined {
    const image = this.entries.get(frame)
    if (image === undefined) return undefined
    // Re-insert so this frame becomes the newest entry in iteration order.
    this.entries.delete(frame)
    this.entries.set(frame, image)
    return image
  }

  /** Look up without disturbing recency (used by the nearest-frame fallback scan). */
  peek(frame: number): HTMLImageElement | undefined {
    return this.entries.get(frame)
  }

  set(frame: number, image: HTMLImageElement): void {
    if (this.entries.has(frame)) this.entries.delete(frame)
    this.entries.set(frame, image)
    this.evictIfNeeded()
  }

  /**
   * Replace the protected set. Protected frames are never evicted, which keeps the
   * frame currently on screen and its immediate lookahead alive even when the
   * cache is under pressure.
   */
  protect(frames: Iterable<number>): void {
    this.protectedFrames.clear()
    for (const frame of frames) this.protectedFrames.add(frame)
  }

  /**
   * Nearest cached frame to `target`, preferring `direction` when both sides are
   * equally close. Returns undefined only when the cache is completely empty.
   */
  nearest(target: number, direction: 1 | -1): { frame: number; image: HTMLImageElement } | undefined {
    const exact = this.entries.get(target)
    if (exact !== undefined) return { frame: target, image: exact }

    let best: number | undefined
    let bestScore = Number.POSITIVE_INFINITY
    for (const frame of this.entries.keys()) {
      const delta = frame - target
      const distance = Math.abs(delta)
      // Tie-break toward the scroll direction, and mildly prefer it in general so
      // the held frame is one the viewer is heading toward.
      const aligned = delta === 0 || Math.sign(delta) === direction
      const score = distance * (aligned ? 1 : 1.15)
      if (score < bestScore) {
        bestScore = score
        best = frame
      }
    }
    if (best === undefined) return undefined
    return { frame: best, image: this.entries.get(best)! }
  }

  private evictIfNeeded(): void {
    if (this.entries.size <= this.capacity) return
    for (const frame of this.entries.keys()) {
      if (this.entries.size <= this.capacity) break
      if (this.protectedFrames.has(frame)) continue
      // Dropping the application reference lets the browser reclaim the decoded
      // bitmap. (If this ever moves to ImageBitmap, close() belongs here.)
      this.entries.delete(frame)
    }
  }

  clear(): void {
    this.entries.clear()
    this.protectedFrames.clear()
  }

  loadedFrames(): number[] {
    return [...this.entries.keys()]
  }
}
