import * as THREE from 'three'

/**
 * A tiny procedural "moonlit night" environment, pre-filtered once at startup.
 *
 * Both the glass clearcoat and the gunmetal shuriken get their entire character
 * from specular reflection, and with no image-based environment they read as flat
 * grey plastic. This is a 128x64 equirectangular gradient with a single cool moon
 * highlight - a few kilobytes, built and filtered once, never touched again.
 */
export interface Environment {
  texture: THREE.Texture
  dispose(): void
}

const WIDTH = 128
const HEIGHT = 64

/** Where the moon sits, in equirect UV space. */
const MOON_U = 0.72
const MOON_V = 0.17
const MOON_SIZE = 0.055

export function createEnvironment(renderer: THREE.WebGLRenderer): Environment {
  const data = new Uint8Array(WIDTH * HEIGHT * 4)

  for (let y = 0; y < HEIGHT; y += 1) {
    const v = y / (HEIGHT - 1)
    // Sky gradient: cool near the zenith, near-black below the horizon.
    const sky = 1 - Math.min(1, Math.max(0, (v - 0.1) / 0.75))
    const baseR = 6 + sky * 22
    const baseG = 10 + sky * 34
    const baseB = 16 + sky * 56

    for (let x = 0; x < WIDTH; x += 1) {
      const u = x / (WIDTH - 1)
      // Wrap the horizontal distance so the moon does not seam at u = 0.
      let du = Math.abs(u - MOON_U)
      if (du > 0.5) du = 1 - du
      const dv = v - MOON_V
      const falloff = Math.exp(-(du * du + dv * dv) / (MOON_SIZE * MOON_SIZE))

      const index = (y * WIDTH + x) * 4
      data[index] = Math.min(255, baseR + falloff * 226)
      data[index + 1] = Math.min(255, baseG + falloff * 238)
      data[index + 2] = Math.min(255, baseB + falloff * 255)
      data[index + 3] = 255
    }
  }

  const source = new THREE.DataTexture(data, WIDTH, HEIGHT, THREE.RGBAFormat)
  source.mapping = THREE.EquirectangularReflectionMapping
  source.colorSpace = THREE.SRGBColorSpace
  source.needsUpdate = true

  const pmrem = new THREE.PMREMGenerator(renderer)
  const target = pmrem.fromEquirectangular(source)

  pmrem.dispose()
  source.dispose()

  return {
    texture: target.texture,
    dispose: () => target.dispose(),
  }
}
