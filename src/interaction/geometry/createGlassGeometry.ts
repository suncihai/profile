import * as THREE from 'three'
import { FRAGMENT_VARIANTS, GLASS_VARIANTS } from '../config'
import { createRng, randRange } from '../rng'
import type { Rng } from '../rng'

/** One pre-baked silhouette: the extruded plate plus its edge wireframe. */
export interface GlassVariant {
  solid: THREE.BufferGeometry
  outline: THREE.BufferGeometry
  /** Bounding radius in local units, used to size the pointer hit proxy. */
  radius: number
}

const GLASS_DEPTH = 0.038
const BEVEL = 0.013
/** Z displacement applied to the caps to break up the reflection. */
const FACET_AMOUNT = 0.075

/**
 * Build one irregular broken-glass polygon.
 *
 * Vertices are sampled in strictly increasing polar order, which guarantees a
 * simple (non self-intersecting) contour without any clipping work. The angular
 * steps are jittered and then normalised back to a full turn, so shards get long
 * spikes and short notches instead of a regular n-gon.
 */
function buildShardContour(rng: Rng): { points: THREE.Vector2[]; radius: number } {
  const count = Math.floor(randRange(5, 9, rng)) // 5..8
  const weights: number[] = []
  let total = 0
  for (let i = 0; i < count; i += 1) {
    const w = randRange(0.32, 1.9, rng)
    weights.push(w)
    total += w
  }

  // One guaranteed long spike per shard: without it, evenly sampled radii read as
  // a rounded pebble rather than as something that was broken off.
  const spike = Math.floor(rng() * count)

  const points: THREE.Vector2[] = []
  let angle = rng() * Math.PI * 2
  for (let i = 0; i < count; i += 1) {
    const radius = i === spike ? randRange(1.05, 1.35, rng) : randRange(0.3, 0.92, rng)
    points.push(new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius))
    angle += (weights[i] / total) * Math.PI * 2
  }

  // Re-centre on the contour centroid before measuring, so the hit proxy and the
  // float pivot both sit in the middle of the visible shape.
  const centroid = new THREE.Vector2()
  for (const p of points) centroid.add(p)
  centroid.divideScalar(points.length)

  let radius = 0
  for (const p of points) {
    p.sub(centroid)
    radius = Math.max(radius, p.length())
  }

  return { points, radius }
}

/** Stable per-position hash, so vertices sharing an XY move together. */
function facetOffset(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return (n - Math.floor(n)) * 2 - 1
}

/**
 * Break the two flat caps into facets.
 *
 * The overlay camera is orthographic, so a perfectly flat plate has one constant
 * reflection vector across its whole face and reads as a dead cutout. Nudging
 * the vertices along Z gives every triangle its own normal, so the moon travels
 * across the shard in patches as it drifts - which is what makes it read as
 * glass rather than as a shape.
 *
 * Z displacement cannot change the silhouette under an orthographic camera, so
 * the outline computed before this step still registers exactly.
 */
function facetCaps(geometry: THREE.BufferGeometry, amount: number): void {
  const position = geometry.attributes.position
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i)
    const y = position.getY(i)
    position.setZ(i, position.getZ(i) + facetOffset(x, y) * amount)
  }
  position.needsUpdate = true
  // ExtrudeGeometry is non-indexed, so this yields hard per-triangle normals.
  geometry.computeVertexNormals()
}

function createGlassVariant(rng: Rng): GlassVariant {
  const { points, radius } = buildShardContour(rng)

  const shape = new THREE.Shape(points)
  const solid = new THREE.ExtrudeGeometry(shape, {
    depth: GLASS_DEPTH,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelOffset: 0,
    bevelSegments: 1,
    curveSegments: 1,
  })
  solid.translate(0, 0, -GLASS_DEPTH / 2)

  // The rim carries most of the visual identity, so the silhouette and the bevel
  // creases are drawn as explicit lines rather than left to a translucent
  // surface. Taken before faceting, so no interior crease clutter appears.
  const outline = new THREE.EdgesGeometry(solid, 22)

  facetCaps(solid, FACET_AMOUNT)

  return { solid, outline, radius }
}

/** Pre-bake the whole silhouette set once, at module-init cost only. */
export function createGlassVariants(): GlassVariant[] {
  const rng = createRng(0x5ca1ed)
  const variants: GlassVariant[] = []
  for (let i = 0; i < GLASS_VARIANTS; i += 1) variants.push(createGlassVariant(rng))
  return variants
}

/**
 * Small, flat, irregular splinters for the shatter. Shared by the whole fragment
 * pool - nothing here is ever built at animation time.
 */
export function createFragmentVariants(): THREE.BufferGeometry[] {
  const rng = createRng(0x9f22b1)
  const variants: THREE.BufferGeometry[] = []

  for (let i = 0; i < FRAGMENT_VARIANTS; i += 1) {
    const corners = i % 2 === 0 ? 3 : 4
    const points: THREE.Vector2[] = []
    let angle = rng() * Math.PI * 2
    for (let c = 0; c < corners; c += 1) {
      const radius = randRange(0.45, 1, rng)
      points.push(new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius))
      angle += (Math.PI * 2) / corners + randRange(-0.3, 0.3, rng)
    }
    const geometry = new THREE.ShapeGeometry(new THREE.Shape(points))
    geometry.center()
    variants.push(geometry)
  }

  return variants
}
