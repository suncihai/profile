import * as THREE from 'three'
import { MAX_DPR, VIEW_HEIGHT } from '../config'
import { createEnvironment } from '../materials/createEnvironment'
import type { Environment } from '../materials/createEnvironment'

/**
 * The transparent WebGL shell that sits over the frame-sequence canvas.
 *
 * Orthographic on purpose: the overlay is a screen-space effect, so a fixed
 * VIEW_HEIGHT frustum makes "place this shard at 82% across, 24% down" exact,
 * makes raycasting trivially correct, and keeps shard size a stable fraction of
 * viewport height on every display. There is no depth parallax to gain here -
 * the depth in the shot belongs to the image sequence underneath.
 */
export class InteractionScene {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.OrthographicCamera

  /** Half the frustum width in world units; changes with the viewport aspect. */
  halfWidth = VIEW_HEIGHT / 2
  /** Half the frustum height. Constant by construction. */
  readonly halfHeight = VIEW_HEIGHT / 2

  private readonly environment: Environment

  constructor() {
    // The context is created here rather than left to WebGLRenderer so that an
    // unsupported device fails as a plain thrown Error we can swallow, instead of
    // a red THREE.WebGLRenderer console error on a visitor's machine. Attributes
    // mirror Three's own defaults, with alpha and antialias turned on.
    const canvas = document.createElement('canvas')
    const context =
      canvas.getContext('webgl2', {
        alpha: true,
        antialias: true,
        depth: true,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
      }) ?? null
    if (context === null) throw new Error('WebGL2 unavailable')

    this.renderer = new THREE.WebGLRenderer({ canvas, context })
    // Fully transparent: everything behind this canvas is the Phase 1 sequence.
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR))
    this.renderer.shadowMap.enabled = false
    this.renderer.toneMapping = THREE.NoToneMapping

    this.scene = new THREE.Scene()

    const half = this.halfHeight
    this.camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 100)
    this.camera.position.set(0, 0, 10)
    this.camera.lookAt(0, 0, 0)

    this.environment = createEnvironment(this.renderer)
    this.scene.environment = this.environment.texture

    // Moonlit key from the upper right, cool fill from the lower left, plus a
    // dim ambient so the unlit side of a shard never goes fully black.
    const ambient = new THREE.AmbientLight(0x24354a, 0.6)
    const key = new THREE.DirectionalLight(0xbcd8ff, 2.3)
    key.position.set(2.2, 3, 4)
    const rim = new THREE.DirectionalLight(0x4a6f96, 0.85)
    rim.position.set(-3, -1.4, 2.4)
    this.scene.add(ambient, key, rim)
  }

  resize(width: number, height: number): void {
    const aspect = height > 0 ? width / height : 1
    this.halfWidth = this.halfHeight * aspect

    this.camera.left = -this.halfWidth
    this.camera.right = this.halfWidth
    this.camera.top = this.halfHeight
    this.camera.bottom = -this.halfHeight
    this.camera.updateProjectionMatrix()

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR))
    this.renderer.setSize(width, height, false)
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.scene.environment = null
    this.environment.dispose()
    this.scene.clear()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}
