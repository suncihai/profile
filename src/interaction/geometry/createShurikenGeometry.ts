import * as THREE from 'three'

/**
 * Procedural four-bladed shuriken, built to match the CIHAI reference silhouette:
 * four curved blades that sweep out to a hooked tip, with a concave scoop between
 * them and a small centre opening.
 *
 * Each blade is two quadratic curves in polar space:
 *   root -> tip   swept leading edge (control point pushed out near the root)
 *   tip  -> root  concave trailing edge (control point pulled in near the hub)
 *
 * The CIHAI lettering from the reference is deliberately not modelled - see the
 * implementation report. The projectile is ~4% of viewport height and in frame
 * for ~300ms, so silhouette and specular response are what actually read.
 */

const HUB_RADIUS = 0.3
const TIP_RADIUS = 1
const HOLE_RADIUS = 0.095
const DEPTH = 0.07

/** Fractions of a blade's 90 degree sector. Tuned against the reference: the
 *  notch cuts deep toward the hub and sits close behind the tip, which is what
 *  turns a pinwheel into a hooked blade. */
const TIP_SWEEP = 0.54
const LEADING_CONTROL_SWEEP = 0.17
const LEADING_CONTROL_RADIUS = 0.8
const TRAILING_CONTROL_SWEEP = 0.66
const TRAILING_CONTROL_RADIUS = 0.2

const polarX = (radius: number, angle: number) => Math.cos(angle) * radius
const polarY = (radius: number, angle: number) => Math.sin(angle) * radius

function buildShurikenShape(): THREE.Shape {
  const shape = new THREE.Shape()
  const sector = Math.PI / 2

  shape.moveTo(polarX(HUB_RADIUS, 0), polarY(HUB_RADIUS, 0))

  for (let blade = 0; blade < 4; blade += 1) {
    const root = blade * sector
    const tip = root + sector * TIP_SWEEP
    const nextRoot = root + sector

    shape.quadraticCurveTo(
      polarX(LEADING_CONTROL_RADIUS, root + sector * LEADING_CONTROL_SWEEP),
      polarY(LEADING_CONTROL_RADIUS, root + sector * LEADING_CONTROL_SWEEP),
      polarX(TIP_RADIUS, tip),
      polarY(TIP_RADIUS, tip),
    )

    shape.quadraticCurveTo(
      polarX(TRAILING_CONTROL_RADIUS, root + sector * TRAILING_CONTROL_SWEEP),
      polarY(TRAILING_CONTROL_RADIUS, root + sector * TRAILING_CONTROL_SWEEP),
      polarX(HUB_RADIUS, nextRoot),
      polarY(HUB_RADIUS, nextRoot),
    )
  }

  shape.closePath()

  const hole = new THREE.Path()
  hole.absarc(0, 0, HOLE_RADIUS, 0, Math.PI * 2, true)
  shape.holes.push(hole)

  return shape
}

/** Silhouette wireframe, drawn over the metal to keep the blades crisp. */
export function createShurikenOutlineGeometry(
  solid: THREE.BufferGeometry,
): THREE.BufferGeometry {
  return new THREE.EdgesGeometry(solid, 30)
}

export function createShurikenGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(buildShurikenShape(), {
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.009,
    bevelOffset: 0,
    bevelSegments: 2,
    curveSegments: 14,
  })
  geometry.translate(0, 0, -DEPTH / 2)
  geometry.computeVertexNormals()
  return geometry
}
