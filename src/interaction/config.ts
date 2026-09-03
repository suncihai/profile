/**
 * Floating-glass tuning. Everything the interaction can be dialled with lives
 * here so the systems stay readable and the numbers stay reviewable.
 *
 * World units: the overlay uses an orthographic camera whose frustum is always
 * VIEW_HEIGHT units tall, whatever the viewport is. So 1 world unit == 10% of the
 * viewport height, and every size below reads as a fraction of screen height
 * rather than as pixels.
 */

/** Vertical size of the orthographic frustum, in world units. */
export const VIEW_HEIGHT = 10

/** Never allocate a 3x retina WebGL buffer for a full-viewport overlay. */
export const MAX_DPR = 1.5

/** Depth slots. Camera looks down -Z from +Z, so larger Z is nearer. */
export const Z_GLASS_MIN = -0.5
export const Z_GLASS_MAX = 0.5
export const Z_FRAGMENT = 0.8
export const Z_FLASH = 0.95
export const Z_SHURIKEN = 1.4

/** How many distinct pre-baked glass silhouettes exist. */
export const GLASS_VARIANTS = 8

/** Absolute ceiling on simultaneous intact shards; slots are allocated once. */
export const MAX_GLASS_SLOTS = 5

/**
 * Pooled fragment meshes. Allocated once, recycled forever. Sized so two bursts
 * can overlap - a new throw can land while the previous shatter is still fading.
 */
export const FRAGMENT_POOL_SIZE = 40

/** Distinct pre-baked fragment shapes shared across the pool. */
export const FRAGMENT_VARIANTS = 6

/* -- glass ---------------------------------------------------------------- */

export const GLASS_BASE_OPACITY = 0.62
export const GLASS_EDGE_OPACITY = 0.5
/** Extra opacity/brightness applied at full hover. */
export const GLASS_HOVER_GAIN = 0.6

/** Vertical drift cycle, seconds. Suspended in air, not orbiting. */
export const GLASS_FLOAT_PERIOD = [8, 15] as const
/** Vertical drift amplitude, world units. */
export const GLASS_FLOAT_AMPLITUDE = [0.12, 0.26] as const
/** Horizontal drift is deliberately a fraction of the vertical one. */
export const GLASS_DRIFT_RATIO = 0.34
/** Radians per second. A full turn takes 100-300s. */
export const GLASS_ROTATION_SPEED = [0.021, 0.062] as const
/** Peak tilt out of the screen plane, radians. Drives the travelling glint. */
export const GLASS_TILT = [0.22, 0.55] as const

export const GLASS_FADE_IN_MS = [300, 700] as const
export const GLASS_RESPAWN_DELAY_MS = [1000, 2000] as const
/** How long a shard stays in the `breaking` state before it becomes claimable. */
export const GLASS_BREAK_MS = 200

/** Minimum separation between two live shards, in normalised viewport units. */
export const MIN_ZONE_SEPARATION = 0.18

/* -- shuriken ------------------------------------------------------------- */

export const SHURIKEN_SCALE = 0.56
/**
 * Flight duration envelope. Phase 2A ran 220-350ms, which was decisive but too
 * quick to actually read the blades or the arc. These numbers keep the throw
 * sharp while giving the eye time to register the silhouette, the curve and the
 * spin before impact.
 */
export const FLIGHT_MS = [340, 500] as const
/** duration = FLIGHT_BASE_MS + travel distance (world units) * FLIGHT_PER_UNIT_MS. */
export const FLIGHT_BASE_MS = 250
export const FLIGHT_PER_UNIT_MS = 22
/**
 * Full revolutions across the whole flight. Held at Phase 2A's count while the
 * flight got longer, so the spin itself slowed from ~16 to ~10 rev/s - which is
 * the part that makes the shape readable.
 */
export const FLIGHT_REVOLUTIONS = 4.5
/** Sideways bow of the quadratic Bezier, as a fraction of travel distance. */
export const FLIGHT_BOW = 0.16

/* -- impact / fragments --------------------------------------------------- */

export const FLASH_MS = 190
export const FRAGMENT_COUNT = [9, 14] as const
export const FRAGMENT_LIFETIME = [0.9, 1.4] as const
export const FRAGMENT_SPEED = [2.4, 7.2] as const
export const FRAGMENT_GRAVITY = 6.5
export const FRAGMENT_DRAG = 1.15
export const FRAGMENT_SPIN = 9
export const FRAGMENT_SCALE = [0.055, 0.16] as const

/* -- scroll --------------------------------------------------------------- */

/** Total parallax travel across the entire 900vh document, in world units. */
export const PARALLAX_RANGE = 0.6

/**
 * Viewport aspect below which shards start shrinking with the width. Anything
 * this wide or wider keeps full size.
 */
export const PORTRAIT_ASPECT = 0.72

/* -- spawn zones ---------------------------------------------------------- */

/** Horizontal thirds of the composition, used to keep placement balanced. */
export type PlacementBand = 'left' | 'center' | 'right'

export const PLACEMENT_BANDS: readonly PlacementBand[] = ['left', 'center', 'right']

/**
 * Relative share of the live shards each band should hold.
 *
 * Right is weighted highest because it is measurably the calmest column and
 * because the shattered window in the frame sequence sits there - but left is
 * weighted high enough that it always claims a shard once three or more are
 * live, which is what stops the scene reading as right-heavy.
 */
export const BAND_WEIGHTS: Readonly<Record<PlacementBand, number>> = {
  left: 0.3,
  center: 0.32,
  right: 0.38,
}

export interface SpawnZone {
  /** Normalised viewport coordinates: 0,0 is top-left, 1,1 is bottom-right. */
  x: number
  y: number
  /** Half-extent of the jitter box around the anchor. */
  jitterX: number
  jitterY: number
  /** Which third of the composition this anchor belongs to. */
  band: PlacementBand
  /** Zones that survive a narrow viewport, where copy fills the full width. */
  compact: boolean
}

/**
 * Candidate zones, measured rather than guessed.
 *
 * Because the page is one continuous scroll, every editorial block sweeps
 * through every vertical position - so where copy lands is almost purely a
 * horizontal question. Sampling the union of real glyph rectangles across the
 * whole scroll range gives, for a shard-sized box:
 *
 *   x < 0.38     copy present at >20% of scroll positions  (left-aligned columns)
 *   x 0.38-0.73  ~10-16%                                   (headline tails)
 *   x 0.73-0.96  ~4-7%                                     (right-aligned chapters only)
 *
 * The right band therefore carries the most anchors, but every band carries
 * some, and the busier the band the harder its anchors hug the vertical
 * extremes - the top strip under the nav and the bottom strip under the copy -
 * where a shard is least likely to sit on a line of type. Shards are
 * translucent, additive and pointer-transparent, so an occasional graze reads
 * as glass floating in front of the scene rather than as an obstruction.
 *
 * Within each band every pair is at least MIN_ZONE_SEPARATION apart, so the
 * separation rule is always satisfiable for the configured shard count, and
 * each band has at least one `compact` anchor so narrow viewports can still
 * honour their quota.
 */
export const SPAWN_ZONES: readonly SpawnZone[] = [
  // left - the busiest column, so these hold to the top and bottom strips
  { x: 0.12, y: 0.16, jitterX: 0.04, jitterY: 0.03, band: 'left', compact: true },
  { x: 0.1, y: 0.84, jitterX: 0.035, jitterY: 0.035, band: 'left', compact: true },
  { x: 0.22, y: 0.66, jitterX: 0.04, jitterY: 0.045, band: 'left', compact: false },
  // centre
  { x: 0.44, y: 0.13, jitterX: 0.045, jitterY: 0.025, band: 'center', compact: true },
  { x: 0.38, y: 0.89, jitterX: 0.045, jitterY: 0.025, band: 'center', compact: true },
  { x: 0.46, y: 0.34, jitterX: 0.04, jitterY: 0.04, band: 'center', compact: false },
  { x: 0.57, y: 0.85, jitterX: 0.04, jitterY: 0.035, band: 'center', compact: false },
  // right - the calmest column, so it can also use the middle heights
  { x: 0.87, y: 0.17, jitterX: 0.04, jitterY: 0.035, band: 'right', compact: true },
  { x: 0.75, y: 0.44, jitterX: 0.04, jitterY: 0.045, band: 'right', compact: false },
  { x: 0.86, y: 0.68, jitterX: 0.04, jitterY: 0.045, band: 'right', compact: true },
  { x: 0.78, y: 0.91, jitterX: 0.04, jitterY: 0.025, band: 'right', compact: true },
  { x: 0.65, y: 0.27, jitterX: 0.04, jitterY: 0.04, band: 'right', compact: false },
  { x: 0.64, y: 0.62, jitterX: 0.04, jitterY: 0.045, band: 'right', compact: false },
]

/**
 * How many of `count` live shards each band should hold.
 *
 * Largest-remainder apportionment over BAND_WEIGHTS: deterministic, so the
 * balance is a property of the configuration rather than of the dice, and every
 * shard is always accounted for.
 */
export function resolveBandQuota(count: number): Record<PlacementBand, number> {
  const exact = PLACEMENT_BANDS.map((band) => ({ band, share: BAND_WEIGHTS[band] * count }))
  const quota: Record<PlacementBand, number> = { left: 0, center: 0, right: 0 }

  let assigned = 0
  for (const entry of exact) {
    quota[entry.band] = Math.floor(entry.share)
    assigned += quota[entry.band]
  }

  // Hand out what rounding dropped, largest fractional remainder first.
  const remainders = exact
    .map((entry) => ({ band: entry.band, rest: entry.share - Math.floor(entry.share) }))
    .sort((a, b) => b.rest - a.rest)

  for (let i = 0; assigned < count; i += 1) {
    quota[remainders[i % remainders.length].band] += 1
    assigned += 1
  }

  return quota
}

/* -- responsive tuning ---------------------------------------------------- */

export interface Tuning {
  /** Live intact shard count. Desktop 5, tablet 4, phone 2. */
  glassCount: number
  /** Multiplier on shard size. */
  glassScale: number
  /** Hit-proxy radius multiplier - generous on touch, tight on mouse. */
  hitPadding: number
  /** 1 normally, near-zero for reduced motion. */
  motionScale: number
  /** Shortens the throw for reduced-motion visitors. */
  flightScale: number
  /** Trims the shatter for reduced-motion visitors. */
  shatterScale: number
  /** Narrow viewports use the `compact` zone subset. */
  compactZonesOnly: boolean
}

const TABLET_BREAKPOINT = 1024
const PHONE_BREAKPOINT = 640

export function resolveTuning(width: number, reducedMotion: boolean): Tuning {
  const coarse =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches

  const phone = width < PHONE_BREAKPOINT
  const tablet = !phone && width < TABLET_BREAKPOINT

  return {
    glassCount: phone ? 2 : tablet ? 4 : 5,
    glassScale: phone ? 1.18 : tablet ? 1.1 : 1,
    hitPadding: coarse ? 1.55 : 1.18,
    motionScale: reducedMotion ? 0.14 : 1,
    flightScale: reducedMotion ? 0.68 : 1,
    shatterScale: reducedMotion ? 0.62 : 1,
    compactZonesOnly: phone,
  }
}
