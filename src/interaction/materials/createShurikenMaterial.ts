import * as THREE from 'three'

/**
 * Gunmetal. High metalness so the read comes from the environment, but a low
 * envMapIntensity so the body stays near-black and the highlight does the
 * talking - dangerous rather than chrome.
 */
export function createShurikenMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x0c0f13,
    metalness: 0.9,
    roughness: 0.26,
    envMapIntensity: 0.85,
  })
}

/**
 * A faint cool line along the blades. Under an orthographic camera a flat plate
 * reflects one constant direction, so without this the silhouette reads as a
 * grey cut-out at speed.
 */
export function createShurikenOutlineMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: 0x9fc3e8,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  })
}
