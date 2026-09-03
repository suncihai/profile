import * as THREE from 'three'

/**
 * Glass surface. Not a physically correct refraction of what is underneath - the
 * cinematic frames live on a separate 2D canvas, so there is nothing for
 * transmission to sample. This is the visual approximation instead.
 *
 * Two decisions do all the work:
 *
 *   near-black base colour  - so diffuse shading contributes almost nothing and
 *                             everything you see is specular: the clearcoat and
 *                             the moonlit environment. That is what glass is.
 *   additive blending       - the frames underneath are almost black, and any
 *                             alpha-blended fill over them reads as a solid dark
 *                             chip. Real glass in a night shot only ever *adds*
 *                             light, so the shard glints instead of blotting.
 */
export function createGlassMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0x0b141d,
    transparent: true,
    opacity: 0,
    roughness: 0.05,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    ior: 1.52,
    reflectivity: 0.7,
    envMapIntensity: 3.2,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    // Translucent overlapping plates sort by draw order, not by depth buffer.
    depthWrite: false,
  })
}

/** The rim. Carries most of the shard's identity against a dark frame. */
export function createGlassEdgeMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: 0xdcecff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
}

/**
 * Pointer hit proxy. `colorWrite: false` means it draws nothing at all while
 * still being a raycast target, which lets the tappable area be slightly larger
 * than the shard without any visible halo.
 */
export function createHitProxyMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    transparent: true,
    opacity: 0,
  })
}
