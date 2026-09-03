import * as THREE from 'three'
import { FLIGHT_BOW, FLIGHT_MS, FLIGHT_REVOLUTIONS, SHURIKEN_SCALE, Z_SHURIKEN } from '../config'
import type { Tuning } from '../config'
import {
  createShurikenGeometry,
  createShurikenOutlineGeometry,
} from '../geometry/createShurikenGeometry'
import {
  createShurikenMaterial,
  createShurikenOutlineMaterial,
} from '../materials/createShurikenMaterial'

/**
 * Exactly one shuriken exists for the lifetime of the page. It is thrown, it
 * lands, it is hidden, it is thrown again - no allocation, no disposal churn, and
 * structurally impossible to spam: a claim is refused while `busy` is true.
 */
export class ShurikenSystem {
  readonly root = new THREE.Group()

  private readonly geometry: THREE.BufferGeometry
  private readonly material: THREE.MeshStandardMaterial
  private readonly mesh: THREE.Mesh
  private readonly outlineGeometry: THREE.BufferGeometry
  private readonly outlineMaterial: THREE.LineBasicMaterial
  /** Holds the flight pose; the mesh inside it owns the spin. */
  private readonly pivot = new THREE.Group()

  private readonly origin = new THREE.Vector3()
  private readonly control = new THREE.Vector3()
  private readonly target = new THREE.Vector3()
  private readonly scratch = new THREE.Vector3()

  private flying = false
  private elapsed = 0
  private duration = 0
  private spin = 0
  private slotIndex = -1
  private tuning: Tuning

  constructor(tuning: Tuning) {
    this.tuning = tuning
    this.geometry = createShurikenGeometry()
    this.material = createShurikenMaterial()

    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.scale.setScalar(SHURIKEN_SCALE)

    this.outlineGeometry = createShurikenOutlineGeometry(this.geometry)
    this.outlineMaterial = createShurikenOutlineMaterial()
    this.mesh.add(new THREE.LineSegments(this.outlineGeometry, this.outlineMaterial))

    // A fixed tilt off the screen plane, so the blades catch the key light
    // instead of reading as a flat silhouette while they spin.
    this.pivot.rotation.x = -0.46
    this.pivot.rotation.y = 0.2
    this.pivot.add(this.mesh)
    this.pivot.visible = false
    this.root.add(this.pivot)
  }

  applyTuning(tuning: Tuning): void {
    this.tuning = tuning
  }

  get busy(): boolean {
    return this.flying
  }

  /** Which shard this throw belongs to, or -1 when idle. */
  get claimedSlot(): number {
    return this.slotIndex
  }

  /**
   * Launch from just outside the nearest lower edge - the visitor throws it, not
   * the ninja in the frame sequence, whose hand moves across 483 images.
   */
  throwAt(target: THREE.Vector3, slotIndex: number, halfWidth: number, halfHeight: number): void {
    this.target.copy(target)
    this.target.z = Z_SHURIKEN

    const fromRight = target.x >= 0
    this.origin.set(
      (fromRight ? 1 : -1) * halfWidth * 1.16,
      -halfHeight * 1.22,
      Z_SHURIKEN,
    )

    // Gentle quadratic bow, bent away from the straight line - a read of speed,
    // not a ballistic arc.
    this.control
      .copy(this.origin)
      .add(this.target)
      .multiplyScalar(0.5)
    const dx = this.target.x - this.origin.x
    const dy = this.target.y - this.origin.y
    const distance = Math.hypot(dx, dy)
    const bow = distance * FLIGHT_BOW * (fromRight ? 1 : -1)
    // Perpendicular to the travel direction.
    this.control.x += (-dy / (distance || 1)) * bow
    this.control.y += (dx / (distance || 1)) * bow

    const raw = 180 + distance * 16
    this.duration =
      (Math.min(FLIGHT_MS[1], Math.max(FLIGHT_MS[0], raw)) * this.tuning.flightScale) / 1000

    this.spin = FLIGHT_REVOLUTIONS * Math.PI * 2 * (fromRight ? -1 : 1)
    this.elapsed = 0
    this.slotIndex = slotIndex
    this.flying = true

    this.mesh.rotation.z = 0
    this.pivot.visible = true
    this.applyPose(0)
  }

  private applyPose(t: number): void {
    // Quadratic Bezier, reused vectors only.
    const inv = 1 - t
    const a = inv * inv
    const b = 2 * inv * t
    const c = t * t

    this.scratch.set(
      a * this.origin.x + b * this.control.x + c * this.target.x,
      a * this.origin.y + b * this.control.y + c * this.target.y,
      Z_SHURIKEN,
    )
    this.pivot.position.copy(this.scratch)
    this.mesh.rotation.z = this.spin * t
    // Reads as closing distance on the way in.
    this.mesh.scale.setScalar(SHURIKEN_SCALE * (0.72 + 0.42 * t))
  }

  /** Returns the slot index on the frame it lands, otherwise null. */
  update(deltaSeconds: number): number | null {
    if (!this.flying) return null

    this.elapsed += deltaSeconds
    const linear = Math.min(1, this.elapsed / this.duration)
    // Slight acceleration into the target.
    const eased = linear * (0.66 + 0.34 * linear)
    this.applyPose(eased)

    if (linear < 1) return null

    this.flying = false
    this.pivot.visible = false
    const landed = this.slotIndex
    this.slotIndex = -1
    return landed
  }

  /** Abort mid-flight (used on teardown paths). */
  cancel(): void {
    this.flying = false
    this.slotIndex = -1
    this.pivot.visible = false
  }

  dispose(): void {
    this.pivot.clear()
    this.root.clear()
    this.geometry.dispose()
    this.material.dispose()
    this.outlineGeometry.dispose()
    this.outlineMaterial.dispose()
  }
}
