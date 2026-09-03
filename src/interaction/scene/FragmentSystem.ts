import * as THREE from 'three'
import {
  FLASH_MS,
  FRAGMENT_COUNT,
  FRAGMENT_DRAG,
  FRAGMENT_GRAVITY,
  FRAGMENT_LIFETIME,
  FRAGMENT_POOL_SIZE,
  FRAGMENT_SCALE,
  FRAGMENT_SPEED,
  FRAGMENT_SPIN,
  Z_FLASH,
  Z_FRAGMENT,
} from '../config'
import type { Tuning } from '../config'
import { randInt, randRange } from '../rng'
import { createFragmentVariants } from '../geometry/createGlassGeometry'
import {
  createFlashMaterial,
  createFlashTexture,
  createFragmentMaterial,
} from '../materials/createImpactMaterials'

interface Fragment {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  vx: number
  vy: number
  spinX: number
  spinY: number
  spinZ: number
  life: number
  ttl: number
  peakOpacity: number
  active: boolean
}

/**
 * The shatter. No fracture solver and no physics engine: the intact plate is
 * simply hidden and a pooled burst of splinters is thrown outward from the hit
 * point under hand-integrated motion. The animation sells it.
 *
 * The pool, its geometries and its materials are all allocated once in the
 * constructor. `burst` only ever writes numbers into existing objects.
 */
export class FragmentSystem {
  readonly root = new THREE.Group()

  private readonly variants: THREE.BufferGeometry[]
  private readonly fragments: Fragment[] = []

  private readonly flashTexture: THREE.CanvasTexture
  private readonly flashGeometry: THREE.PlaneGeometry
  private readonly flashMaterial: THREE.MeshBasicMaterial
  private readonly flashMesh: THREE.Mesh
  private flashElapsed = 0
  private flashing = false

  private tuning: Tuning

  constructor(tuning: Tuning) {
    this.tuning = tuning
    this.variants = createFragmentVariants()

    for (let i = 0; i < FRAGMENT_POOL_SIZE; i += 1) {
      const material = createFragmentMaterial()
      const mesh = new THREE.Mesh(this.variants[i % this.variants.length], material)
      mesh.visible = false
      this.root.add(mesh)
      this.fragments.push({
        mesh,
        material,
        vx: 0,
        vy: 0,
        spinX: 0,
        spinY: 0,
        spinZ: 0,
        life: 0,
        ttl: 1,
        peakOpacity: 1,
        active: false,
      })
    }

    this.flashTexture = createFlashTexture()
    this.flashGeometry = new THREE.PlaneGeometry(1, 1)
    this.flashMaterial = createFlashMaterial(this.flashTexture)
    this.flashMesh = new THREE.Mesh(this.flashGeometry, this.flashMaterial)
    this.flashMesh.visible = false
    this.root.add(this.flashMesh)
  }

  applyTuning(tuning: Tuning): void {
    this.tuning = tuning
  }

  /** Brief cool-white crack of light at the point of impact. */
  flash(x: number, y: number): void {
    this.flashMesh.position.set(x, y, Z_FLASH)
    this.flashMesh.rotation.z = randRange(0, Math.PI)
    this.flashMesh.scale.setScalar(0.4)
    this.flashMaterial.opacity = 1
    this.flashMesh.visible = true
    this.flashElapsed = 0
    this.flashing = true
  }

  /**
   * Throw a burst of splinters outward from the impact. A couple of them are
   * deliberately tiny and fast - those read as sparks.
   */
  burst(x: number, y: number): void {
    const scale = this.tuning.shatterScale
    const count = Math.max(6, Math.round(randInt(FRAGMENT_COUNT[0], FRAGMENT_COUNT[1]) * scale))

    let spawned = 0
    for (const fragment of this.fragments) {
      if (spawned >= count) break
      if (fragment.active) continue

      const spark = spawned % 4 === 3
      const angle = randRange(0, Math.PI * 2)
      const speed = randRange(FRAGMENT_SPEED[0], FRAGMENT_SPEED[1]) * (spark ? 1.5 : 1)
      const size =
        randRange(FRAGMENT_SCALE[0], FRAGMENT_SCALE[1]) *
        (spark ? 0.42 : 1) *
        this.tuning.glassScale

      fragment.mesh.geometry = this.variants[randInt(0, this.variants.length - 1)]
      fragment.mesh.position.set(x + randRange(-0.05, 0.05), y + randRange(-0.05, 0.05), Z_FRAGMENT)
      fragment.mesh.rotation.set(randRange(0, 6.28), randRange(0, 6.28), randRange(0, 6.28))
      fragment.mesh.scale.setScalar(size)
      fragment.mesh.visible = true

      fragment.vx = Math.cos(angle) * speed
      // Slight upward bias so the burst opens before gravity takes it down.
      fragment.vy = Math.sin(angle) * speed + randRange(0.2, 1.1)
      fragment.spinX = randRange(-FRAGMENT_SPIN, FRAGMENT_SPIN)
      fragment.spinY = randRange(-FRAGMENT_SPIN, FRAGMENT_SPIN)
      fragment.spinZ = randRange(-FRAGMENT_SPIN, FRAGMENT_SPIN)
      fragment.life = 0
      fragment.ttl = randRange(FRAGMENT_LIFETIME[0], FRAGMENT_LIFETIME[1]) * scale
      fragment.peakOpacity = spark ? 1 : randRange(0.55, 0.9)
      fragment.material.opacity = fragment.peakOpacity
      fragment.active = true
      spawned += 1
    }
  }

  update(deltaSeconds: number): void {
    if (this.flashing) {
      this.flashElapsed += deltaSeconds * 1000
      const t = Math.min(1, this.flashElapsed / (FLASH_MS * this.tuning.shatterScale))
      this.flashMesh.scale.setScalar(0.4 + t * 1.9)
      this.flashMaterial.opacity = (1 - t) * (1 - t)
      if (t >= 1) {
        this.flashing = false
        this.flashMesh.visible = false
      }
    }

    const drag = Math.max(0, 1 - FRAGMENT_DRAG * deltaSeconds)

    for (const fragment of this.fragments) {
      if (!fragment.active) continue

      fragment.life += deltaSeconds
      if (fragment.life >= fragment.ttl) {
        fragment.active = false
        fragment.mesh.visible = false
        fragment.material.opacity = 0
        continue
      }

      fragment.vy -= FRAGMENT_GRAVITY * deltaSeconds
      fragment.vx *= drag
      fragment.vy *= drag

      fragment.mesh.position.x += fragment.vx * deltaSeconds
      fragment.mesh.position.y += fragment.vy * deltaSeconds
      fragment.mesh.rotation.x += fragment.spinX * deltaSeconds
      fragment.mesh.rotation.y += fragment.spinY * deltaSeconds
      fragment.mesh.rotation.z += fragment.spinZ * deltaSeconds

      // Hold full brightness through the burst, then fade over the tail.
      const progress = fragment.life / fragment.ttl
      const fade = progress < 0.55 ? 1 : 1 - (progress - 0.55) / 0.45
      fragment.material.opacity = fragment.peakOpacity * fade
    }
  }

  /** Dev-only census, used to prove the pool is recycled rather than grown. */
  get activeCount(): number {
    let count = 0
    for (const fragment of this.fragments) if (fragment.active) count += 1
    return count
  }

  dispose(): void {
    for (const fragment of this.fragments) fragment.material.dispose()
    for (const variant of this.variants) variant.dispose()
    this.flashGeometry.dispose()
    this.flashMaterial.dispose()
    this.flashTexture.dispose()
    this.root.clear()
    this.fragments.length = 0
  }
}
