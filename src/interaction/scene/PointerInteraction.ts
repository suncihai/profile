import * as THREE from 'three'

/**
 * Any of these under the pointer means the site's own UI owns the event. The
 * WebGL canvas is `pointer-events: none`, so we listen at the window instead and
 * raycast by hand - which makes it our job to stand down for real controls.
 */
const UI_SELECTOR = [
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'label',
  '[role="button"]',
  '[role="link"]',
  '[contenteditable]',
  '[data-no-glass-interaction]',
].join(',')

export interface PointerInteractionOptions {
  camera: THREE.Camera
  /** Element whose box maps pointer coordinates to normalised device space. */
  surface: HTMLElement
}

/**
 * Window-level pointer capture for the glass layer.
 *
 * Events are only recorded here; the ray is built and consumed once per frame by
 * the runtime, so a stream of pointermove events can never cost more than one
 * raycast per rendered frame.
 */
export class PointerInteraction {
  readonly raycaster = new THREE.Raycaster()

  private readonly camera: THREE.Camera
  private readonly surface: HTMLElement
  private readonly ndc = new THREE.Vector2()

  private pendingHover: { x: number; y: number } | null = null
  private hoverCleared = false
  private pendingPick: { x: number; y: number } | null = null
  private enabled = true

  constructor(options: PointerInteractionOptions) {
    this.camera = options.camera
    this.surface = options.surface

    window.addEventListener('pointerdown', this.onPointerDown, { passive: true })
    window.addEventListener('pointermove', this.onPointerMove, { passive: true })
    window.addEventListener('blur', this.onLeave)
    document.addEventListener('mouseleave', this.onLeave)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.pendingPick = null
      this.pendingHover = null
      this.hoverCleared = true
    }
  }

  private isOwnEvent(event: PointerEvent): boolean {
    if (!this.enabled) return false
    if (!event.isPrimary) return false
    // Mouse: primary button only. Touch/pen report button 0 as well.
    if (event.pointerType === 'mouse' && event.button !== 0) return false
    const target = event.target
    if (target instanceof Element && target.closest(UI_SELECTOR) !== null) return false
    return true
  }

  private onPointerDown = (event: PointerEvent) => {
    if (!this.isOwnEvent(event)) return
    this.pendingPick = { x: event.clientX, y: event.clientY }
    // A tap is also the only hover signal touch devices get.
    if (event.pointerType !== 'mouse') this.pendingHover = null
  }

  private onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return
    if (!this.enabled) return
    if (event.target instanceof Element && event.target.closest(UI_SELECTOR) !== null) {
      this.pendingHover = null
      this.hoverCleared = true
      return
    }
    this.pendingHover = { x: event.clientX, y: event.clientY }
  }

  private onLeave = () => {
    this.pendingHover = null
    this.hoverCleared = true
  }

  /** Build the ray for a recorded client position. */
  private aim(x: number, y: number): THREE.Raycaster {
    const rect = this.surface.getBoundingClientRect()
    this.ndc.set(
      ((x - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -(((y - rect.top) / Math.max(1, rect.height)) * 2 - 1),
    )
    this.raycaster.setFromCamera(this.ndc, this.camera)
    return this.raycaster
  }

  /** Consume this frame's hover, if the pointer moved. */
  takeHover(): THREE.Raycaster | 'clear' | null {
    if (this.hoverCleared) {
      this.hoverCleared = false
      this.pendingHover = null
      return 'clear'
    }
    const pending = this.pendingHover
    if (pending === null) return null
    this.pendingHover = null
    return this.aim(pending.x, pending.y)
  }

  /** Consume this frame's click/tap, if there was one. */
  takePick(): THREE.Raycaster | null {
    const pending = this.pendingPick
    if (pending === null) return null
    this.pendingPick = null
    return this.aim(pending.x, pending.y)
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('blur', this.onLeave)
    document.removeEventListener('mouseleave', this.onLeave)
  }
}
