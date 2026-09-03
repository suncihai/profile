/**
 * Glass-break sound, pooled.
 *
 * Deliberately HTMLAudioElement rather than WebAudio: three short one-shots that
 * never need mixing, filtering or scheduling do not justify an AudioContext, and
 * an AudioContext would additionally need its own suspend/resume handling.
 *
 * Autoplay policy: nothing is fetched at page load and nothing is ever played
 * unprompted. `prime()` creates and preloads the elements, and is only called
 * from a real pointer event; `play()` only ever runs from an impact, which is
 * always downstream of the click that threw the shuriken - so by the time audio
 * plays the document has sticky user activation. A rejected `play()` promise is
 * swallowed rather than surfaced, because a muted or policy-blocked browser is
 * not an error worth breaking a decorative interaction over.
 */

const CLIP_FILES = ['glass_broken_1.mp3', 'glass_broken_2.mp3', 'glass_broken_3.mp3'] as const

/**
 * Concurrent voices per clip. Two is enough for the throw cadence (one shuriken
 * in the air at a time) while still letting a tail overlap the next hit, and it
 * caps the element count at a fixed six.
 */
const VOICES_PER_CLIP = 2

/** Kept well under the frame sequence's own presence in the mix. */
const VOLUME_RANGE = [0.3, 0.44] as const

/** Subtle only - enough to stop repeated hits sounding like a sample loop. */
const RATE_RANGE = [0.94, 1.06] as const

interface Voice {
  element: HTMLAudioElement
  /** When this voice was last started, so the oldest can be stolen. */
  startedAt: number
}

export class ShatterAudio {
  private readonly voices: Voice[] = []
  private primed = false
  private disposed = false

  /**
   * Create and preload the pool. Safe to call on every pointer event: it does
   * work exactly once. Call it from a user gesture so the files are warm by the
   * time the first shuriken lands.
   */
  prime(): void {
    if (this.primed || this.disposed) return
    if (typeof Audio !== 'function') return
    this.primed = true

    // BASE_URL, not a bare '/', so the assets resolve under a project-page base.
    const base = `${import.meta.env.BASE_URL}sound/`
    for (const file of CLIP_FILES) {
      for (let voice = 0; voice < VOICES_PER_CLIP; voice += 1) {
        const element = new Audio(`${base}${file}`)
        element.preload = 'auto'
        element.load()
        this.voices.push({ element, startedAt: 0 })
      }
    }
  }

  /** One random clip, at a slightly varied level and rate. */
  play(): void {
    if (this.disposed || !this.primed || this.voices.length === 0) return

    const clip = Math.floor(Math.random() * CLIP_FILES.length)
    const first = clip * VOICES_PER_CLIP

    // Prefer an idle voice of the chosen clip; otherwise steal its oldest, which
    // keeps the element count fixed no matter how fast shards are broken.
    let chosen = this.voices[first]
    for (let i = 0; i < VOICES_PER_CLIP; i += 1) {
      const candidate = this.voices[first + i]
      if (candidate.element.paused || candidate.element.ended) {
        chosen = candidate
        break
      }
      if (candidate.startedAt < chosen.startedAt) chosen = candidate
    }

    const { element } = chosen
    element.volume = VOLUME_RANGE[0] + Math.random() * (VOLUME_RANGE[1] - VOLUME_RANGE[0])
    element.playbackRate = RATE_RANGE[0] + Math.random() * (RATE_RANGE[1] - RATE_RANGE[0])
    chosen.startedAt = performance.now()

    try {
      element.currentTime = 0
    } catch {
      // Seeking before metadata has arrived throws on some browsers; play anyway.
    }
    // Blocked or muted playback is not an error worth propagating.
    void element.play()?.catch(() => {})
  }

  /** Dev-only census, used to prove the pool never grows. */
  get voiceCount(): number {
    return this.voices.length
  }

  dispose(): void {
    this.disposed = true
    for (const { element } of this.voices) {
      element.pause()
      // Dropping the source and reloading aborts any in-flight request and lets
      // the decoded buffer go, rather than leaving detached elements holding it.
      element.removeAttribute('src')
      element.load()
    }
    this.voices.length = 0
  }
}
