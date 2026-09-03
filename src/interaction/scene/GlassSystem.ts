import * as THREE from 'three'
import {
  GLASS_BASE_OPACITY,
  GLASS_BREAK_MS,
  GLASS_DRIFT_RATIO,
  GLASS_EDGE_OPACITY,
  GLASS_FADE_IN_MS,
  GLASS_FLOAT_AMPLITUDE,
  GLASS_FLOAT_PERIOD,
  GLASS_HOVER_GAIN,
  GLASS_RESPAWN_DELAY_MS,
  GLASS_ROTATION_SPEED,
  GLASS_TILT,
  MAX_GLASS_SLOTS,
  MIN_ZONE_SEPARATION,
  PARALLAX_RANGE,
  PORTRAIT_ASPECT,
  SPAWN_ZONES,
  Z_GLASS_MAX,
  Z_GLASS_MIN,
} from '../config'
import type { Tuning } from '../config'
import { randInt, randRange } from '../rng'
import { createGlassVariants } from '../geometry/createGlassGeometry'
import type { GlassVariant } from '../geometry/createGlassGeometry'
import {
  createGlassEdgeMaterial,
  createGlassMaterial,
  createHitProxyMaterial,
} from '../materials/createGlassMaterial'

/**
 * Lifecycle of a single shard.
 *
 *   floating  - alive, drifting, and the only state the pointer may claim
 *   targeted  - a shuriken is inbound; further clicks are refused
 *   breaking  - the intact plate is gone, fragments are away
 *   cooldown  - waiting out the respawn delay, or parked (count reduced)
 */
export type GlassState = 'floating' | 'targeted' | 'breaking' | 'cooldown'

interface GlassSlot {
  index: number
  group: THREE.Group
  mesh: THREE.Mesh
  outline: THREE.LineSegments
  hit: THREE.Mesh
  surface: THREE.MeshPhysicalMaterial
  edge: THREE.LineBasicMaterial

  state: GlassState
  /** Wall-clock deadline for the current timed state, in ms. */
  deadline: number
  /** True while the slot is parked because the live count shrank. */
  parked: boolean

  zone: number
  variant: number
  normX: number
  normY: number
  baseX: number
  baseY: number

  phase: number
  floatSpeed: number
  floatAmp: number
  driftSpeed: number
  driftAmp: number
  rotationSpeed: number
  tiltSpeed: number
  tiltX: number
  tiltY: number

  scale: number
  aspect: number
  radius: number

  /** Spawn fade, 0..1, and its per-second rate. */
  fade: number
  fadeRate: number

  hover: number
  hoverTarget: number
}

const HIT_PROXY_SEGMENTS = 12

export class GlassSystem {
  readonly root = new THREE.Group()

  private readonly variants: GlassVariant[]
  private readonly hitGeometry: THREE.CircleGeometry
  private readonly hitMaterial: THREE.MeshBasicMaterial
  private readonly slots: GlassSlot[] = []

  /** Reused across raycasts so hover testing never allocates. */
  private readonly hitTargets: THREE.Object3D[] = []
  private readonly intersections: THREE.Intersection[] = []

  private tuning: Tuning
  private halfWidth: number
  private halfHeight: number
  private parallax = 0
  private hovered: GlassSlot | null = null

  constructor(tuning: Tuning, halfWidth: number, halfHeight: number) {
    this.tuning = tuning
    this.halfWidth = halfWidth
    this.halfHeight = halfHeight

    this.variants = createGlassVariants()
    this.hitGeometry = new THREE.CircleGeometry(1, HIT_PROXY_SEGMENTS)
    this.hitMaterial = createHitProxyMaterial()

    for (let i = 0; i < MAX_GLASS_SLOTS; i += 1) this.slots.push(this.createSlot(i))
    this.applyTuning(tuning)
  }

  /* -- construction ------------------------------------------------------- */

  private createSlot(index: number): GlassSlot {
    const variant = this.variants[index % this.variants.length]

    const surface = createGlassMaterial()
    const edge = createGlassEdgeMaterial()

    const mesh = new THREE.Mesh(variant.solid, surface)
    const outline = new THREE.LineSegments(variant.outline, edge)
    const hit = new THREE.Mesh(this.hitGeometry, this.hitMaterial)
    hit.userData.slotIndex = index

    const group = new THREE.Group()
    group.add(mesh, outline, hit)
    group.visible = false
    this.root.add(group)

    const slot: GlassSlot = {
      index,
      group,
      mesh,
      outline,
      hit,
      surface,
      edge,
      state: 'cooldown',
      deadline: 0,
      parked: true,
      zone: -1,
      variant: index % this.variants.length,
      normX: 0.5,
      normY: 0.5,
      baseX: 0,
      baseY: 0,
      phase: 0,
      floatSpeed: 0,
      floatAmp: 0,
      driftSpeed: 0,
      driftAmp: 0,
      rotationSpeed: 0,
      tiltSpeed: 0,
      tiltX: 0,
      tiltY: 0,
      scale: 1,
      aspect: 1,
      radius: variant.radius,
      fade: 0,
      fadeRate: 1,
      hover: 0,
      hoverTarget: 0,
    }

    return slot
  }

  /* -- spawning ----------------------------------------------------------- */

  private zoneIsFree(zone: number, exclude: GlassSlot): boolean {
    const candidate = SPAWN_ZONES[zone]
    for (const slot of this.slots) {
      if (slot === exclude || slot.parked) continue
      if (slot.state === 'cooldown') continue
      if (slot.zone === zone) return false
      const dx = candidate.x - slot.normX
      const dy = candidate.y - slot.normY
      if (Math.hypot(dx, dy) < MIN_ZONE_SEPARATION) return false
    }
    return true
  }

  private pickZone(slot: GlassSlot): number {
    const pool: number[] = []
    for (let i = 0; i < SPAWN_ZONES.length; i += 1) {
      if (this.tuning.compactZonesOnly && !SPAWN_ZONES[i].compact) continue
      // Never reuse the zone this slot just occupied.
      if (i === slot.zone) continue
      pool.push(i)
    }
    if (pool.length === 0) return slot.zone >= 0 ? slot.zone : 0

    // A handful of tries against the separation rule, then take whatever is left
    // rather than looping forever on a crowded compact viewport.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const zone = pool[randInt(0, pool.length - 1)]
      if (this.zoneIsFree(zone, slot)) return zone
    }
    return pool[randInt(0, pool.length - 1)]
  }

  /** Give a slot a fresh silhouette, zone, drift signature and fade-in. */
  private spawn(slot: GlassSlot): void {
    const zone = this.pickZone(slot)
    const spec = SPAWN_ZONES[zone]

    slot.zone = zone
    slot.normX = spec.x + randRange(-spec.jitterX, spec.jitterX)
    slot.normY = spec.y + randRange(-spec.jitterY, spec.jitterY)

    // A different silhouette than last time, so respawns never look mechanical.
    let variant = randInt(0, this.variants.length - 1)
    if (variant === slot.variant) variant = (variant + 1) % this.variants.length
    slot.variant = variant
    slot.mesh.geometry = this.variants[variant].solid
    slot.outline.geometry = this.variants[variant].outline
    slot.radius = this.variants[variant].radius

    slot.scale = randRange(0.34, 0.46)
    slot.aspect = randRange(0.78, 1.24)
    slot.mesh.rotation.z = randRange(0, Math.PI * 2)
    slot.outline.rotation.z = slot.mesh.rotation.z
    slot.group.rotation.z = 0
    slot.group.position.z = randRange(Z_GLASS_MIN, Z_GLASS_MAX)

    slot.phase = randRange(0, Math.PI * 2)
    slot.floatSpeed = (Math.PI * 2) / randRange(GLASS_FLOAT_PERIOD[0], GLASS_FLOAT_PERIOD[1])
    slot.floatAmp = randRange(GLASS_FLOAT_AMPLITUDE[0], GLASS_FLOAT_AMPLITUDE[1])
    slot.driftSpeed = slot.floatSpeed * randRange(0.55, 0.8)
    slot.driftAmp = slot.floatAmp * GLASS_DRIFT_RATIO
    slot.rotationSpeed =
      randRange(GLASS_ROTATION_SPEED[0], GLASS_ROTATION_SPEED[1]) * (Math.random() < 0.5 ? -1 : 1)
    // Slow tilt out of the screen plane. This is what actually makes a shard
    // glint: the facets swing through the moon highlight as it turns.
    slot.tiltSpeed = slot.floatSpeed * randRange(0.42, 0.68)
    slot.tiltX = randRange(GLASS_TILT[0], GLASS_TILT[1]) * (Math.random() < 0.5 ? -1 : 1)
    slot.tiltY = randRange(GLASS_TILT[0], GLASS_TILT[1]) * (Math.random() < 0.5 ? -1 : 1)

    slot.fade = 0
    slot.fadeRate = 1000 / randRange(GLASS_FADE_IN_MS[0], GLASS_FADE_IN_MS[1])
    slot.hover = 0
    slot.hoverTarget = 0
    slot.state = 'floating'
    slot.parked = false
    slot.group.visible = true

    this.layoutSlot(slot)
    this.applyScale(slot)
  }

  /* -- layout ------------------------------------------------------------- */

  /**
   * World units are a fraction of viewport *height*, so on a tall phone a shard
   * sized for a landscape desktop eats a fifth of the width. Portrait viewports
   * therefore get a proportionally smaller shard; landscape ones are unaffected.
   */
  private get viewportScale(): number {
    const aspect = this.halfHeight > 0 ? this.halfWidth / this.halfHeight : 1
    return Math.min(1, aspect / PORTRAIT_ASPECT)
  }

  private worldScale(slot: GlassSlot): number {
    return slot.scale * this.tuning.glassScale * this.viewportScale
  }

  /** Half-extent the shard occupies in world units, longest axis. */
  private reachOf(slot: GlassSlot): number {
    return slot.radius * this.worldScale(slot) * Math.max(1, slot.aspect)
  }

  /**
   * Normalised viewport coordinates -> orthographic world coordinates, clamped so
   * the whole shard stays inside the frustum however narrow the viewport is. The
   * bottom margin also carries the parallax range, since scrolling only ever
   * pushes shards downward.
   */
  private layoutSlot(slot: GlassSlot): void {
    const reach = this.reachOf(slot)
    const limitX = Math.max(0, this.halfWidth - reach - slot.driftAmp)
    const limitTop = Math.max(0, this.halfHeight - reach - slot.floatAmp)
    const limitBottom = Math.max(0, limitTop - PARALLAX_RANGE)

    const x = (slot.normX * 2 - 1) * this.halfWidth
    const y = (1 - slot.normY * 2) * this.halfHeight

    slot.baseX = Math.min(limitX, Math.max(-limitX, x))
    slot.baseY = Math.min(limitTop, Math.max(-limitBottom, y))
  }

  private applyScale(slot: GlassSlot): void {
    const s = this.worldScale(slot)
    slot.mesh.scale.set(s * slot.aspect, s, s)
    slot.outline.scale.copy(slot.mesh.scale)
    const reach = slot.radius * s * this.tuning.hitPadding
    slot.hit.scale.set(reach * Math.max(1, slot.aspect), reach, 1)
  }

  resize(halfWidth: number, halfHeight: number): void {
    this.halfWidth = halfWidth
    this.halfHeight = halfHeight
    for (const slot of this.slots) {
      this.applyScale(slot)
      this.layoutSlot(slot)
    }
  }

  applyTuning(tuning: Tuning): void {
    this.tuning = tuning
    for (const slot of this.slots) {
      const live = slot.index < tuning.glassCount
      if (!live && !slot.parked) {
        // The viewport shrank: retire the extra shard rather than popping it.
        slot.parked = true
        slot.state = 'cooldown'
        slot.deadline = Number.POSITIVE_INFINITY
        slot.group.visible = false
      } else if (live && slot.parked && slot.state === 'cooldown') {
        slot.deadline = 0
      }
      this.applyScale(slot)
      this.layoutSlot(slot)
    }
  }

  /**
   * Arm the first spawn. Staggered so the shards do not all fade in on the same
   * frame as the story copy.
   */
  start(nowMs: number): void {
    for (const slot of this.slots) {
      if (slot.index >= this.tuning.glassCount) continue
      slot.deadline = nowMs + slot.index * 420
    }
  }

  setParallax(offset: number): void {
    this.parallax = offset
  }

  /* -- frame -------------------------------------------------------------- */

  update(deltaSeconds: number, nowMs: number): void {
    const time = nowMs * 0.001
    const motion = this.tuning.motionScale

    for (const slot of this.slots) {
      if (slot.state === 'breaking' && nowMs >= slot.deadline) {
        slot.state = 'cooldown'
        slot.deadline =
          nowMs + randRange(GLASS_RESPAWN_DELAY_MS[0], GLASS_RESPAWN_DELAY_MS[1]) - GLASS_BREAK_MS
      }

      if (slot.state === 'cooldown') {
        if (slot.index >= this.tuning.glassCount) continue
        if (nowMs < slot.deadline) continue
        this.spawn(slot)
      }

      if (slot.fade < 1) slot.fade = Math.min(1, slot.fade + slot.fadeRate * deltaSeconds)

      // Exponential-ish approach, frame-rate independent enough for a hover cue.
      slot.hover += (slot.hoverTarget - slot.hover) * Math.min(1, deltaSeconds * 9)

      const floatY = Math.sin(time * slot.floatSpeed + slot.phase) * slot.floatAmp * motion
      const driftX = Math.sin(time * slot.driftSpeed + slot.phase * 1.7) * slot.driftAmp * motion

      slot.group.position.x = slot.baseX + driftX
      slot.group.position.y = slot.baseY + floatY + this.parallax
      slot.group.rotation.z += slot.rotationSpeed * motion * deltaSeconds
      slot.group.rotation.x = Math.sin(time * slot.tiltSpeed + slot.phase * 0.6) * slot.tiltX
      slot.group.rotation.y = Math.cos(time * slot.tiltSpeed * 0.8 + slot.phase) * slot.tiltY

      const gain = 1 + slot.hover * GLASS_HOVER_GAIN
      slot.surface.opacity = GLASS_BASE_OPACITY * slot.fade * gain
      slot.edge.opacity = GLASS_EDGE_OPACITY * slot.fade * gain
    }
  }

  /* -- interaction -------------------------------------------------------- */

  /** Nearest claimable shard under the ray, or null. */
  pick(raycaster: THREE.Raycaster): number | null {
    this.hitTargets.length = 0
    for (const slot of this.slots) {
      // Only `floating` shards are claimable, and only once they are visible
      // enough to be a fair target.
      if (slot.state !== 'floating' || slot.fade < 0.35) continue
      this.hitTargets.push(slot.hit)
    }
    if (this.hitTargets.length === 0) return null

    this.intersections.length = 0
    raycaster.intersectObjects(this.hitTargets, false, this.intersections)
    if (this.intersections.length === 0) return null

    const slotIndex = this.intersections[0].object.userData.slotIndex
    this.intersections.length = 0
    return typeof slotIndex === 'number' ? slotIndex : null
  }

  setHover(slotIndex: number | null): void {
    const next = slotIndex === null ? null : this.slots[slotIndex]
    if (next === this.hovered) return
    if (this.hovered !== null) this.hovered.hoverTarget = 0
    this.hovered = next
    if (next !== null) next.hoverTarget = 1
  }

  get hasHover(): boolean {
    return this.hovered !== null
  }

  /** Claim a shard for an inbound shuriken. Returns false if it is no longer free. */
  reserve(slotIndex: number): boolean {
    const slot = this.slots[slotIndex]
    if (slot === undefined || slot.state !== 'floating') return false
    slot.state = 'targeted'
    return true
  }

  /** Where the shuriken should aim, in world space. */
  positionOf(slotIndex: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.slots[slotIndex].group.position)
  }

  /** Impact: the intact plate leaves the scene immediately. */
  shatter(slotIndex: number, nowMs: number): void {
    const slot = this.slots[slotIndex]
    if (slot === undefined) return
    slot.state = 'breaking'
    slot.deadline = nowMs + GLASS_BREAK_MS
    slot.group.visible = false
    slot.hoverTarget = 0
    slot.hover = 0
    if (this.hovered === slot) this.hovered = null
  }

  /** Hand a reservation back if the throw could not start. */
  release(slotIndex: number): void {
    const slot = this.slots[slotIndex]
    if (slot !== undefined && slot.state === 'targeted') slot.state = 'floating'
  }

  /** Dev-only: world position, extent and state of every slot, for diagnostics. */
  get report(): { index: number; state: GlassState; x: number; y: number; reach: number }[] {
    return this.slots.map((slot) => ({
      index: slot.index,
      state: slot.state,
      x: slot.group.position.x,
      y: slot.group.position.y,
      reach: this.reachOf(slot),
    }))
  }

  /** Dev-only census, used to prove nothing leaks across many shatters. */
  get census(): Record<GlassState, number> {
    const counts: Record<GlassState, number> = {
      floating: 0,
      targeted: 0,
      breaking: 0,
      cooldown: 0,
    }
    for (const slot of this.slots) counts[slot.state] += 1
    return counts
  }

  dispose(): void {
    for (const slot of this.slots) {
      slot.group.clear()
      slot.surface.dispose()
      slot.edge.dispose()
    }
    for (const variant of this.variants) {
      variant.solid.dispose()
      variant.outline.dispose()
    }
    this.hitGeometry.dispose()
    this.hitMaterial.dispose()
    this.root.clear()
    this.slots.length = 0
  }
}
