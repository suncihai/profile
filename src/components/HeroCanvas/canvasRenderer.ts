import { FRAME_HEIGHT, FRAME_WIDTH } from './frameSource'

/**
 * Canvas sizing and painting. Deliberately free of React and of any pixel-readback
 * API (getImageData / toDataURL), so cross-origin R2 frames draw without needing
 * CORS headers.
 */

export type FitMode = 'cover' | 'contain'

export interface CanvasMetrics {
  cssWidth: number
  cssHeight: number
  dpr: number
  fit: FitMode
  drawX: number
  drawY: number
  drawWidth: number
  drawHeight: number
}

/**
 * Below this viewport aspect ratio, `cover` would crop the 16:9-ish frame so hard
 * that the subject falls outside the viewport, so we letterbox instead.
 */
const CONTAIN_ASPECT_THRESHOLD = 0.8

export function pickFitMode(cssWidth: number, cssHeight: number): FitMode {
  if (cssHeight <= 0) return 'cover'
  return cssWidth / cssHeight < CONTAIN_ASPECT_THRESHOLD ? 'contain' : 'cover'
}

export function maxDevicePixelRatio(isCompact: boolean): number {
  const raw = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  // Capped so we never allocate a 3x retina buffer for a full-viewport canvas.
  return Math.min(raw, isCompact ? 1.5 : 2)
}

/**
 * Compute the destination rectangle for the frame, preserving the source aspect
 * ratio in both fit modes. Source dimensions are the measured intrinsic size
 * (1920x1088), never an assumed 16:9.
 */
export function computeMetrics(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  srcWidth = FRAME_WIDTH,
  srcHeight = FRAME_HEIGHT,
): CanvasMetrics {
  const fit = pickFitMode(cssWidth, cssHeight)
  const scale =
    fit === 'cover'
      ? Math.max(cssWidth / srcWidth, cssHeight / srcHeight)
      : Math.min(cssWidth / srcWidth, cssHeight / srcHeight)

  const drawWidth = srcWidth * scale
  const drawHeight = srcHeight * scale

  return {
    cssWidth,
    cssHeight,
    dpr,
    fit,
    drawX: (cssWidth - drawWidth) / 2,
    drawY: (cssHeight - drawHeight) / 2,
    drawWidth,
    drawHeight,
  }
}

/** Resize the backing store to match CSS size * DPR, and scale the context to CSS pixels. */
export function resizeCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  metrics: CanvasMetrics,
): void {
  const backingWidth = Math.max(1, Math.round(metrics.cssWidth * metrics.dpr))
  const backingHeight = Math.max(1, Math.round(metrics.cssHeight * metrics.dpr))

  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth
    canvas.height = backingHeight
  }
  canvas.style.width = `${metrics.cssWidth}px`
  canvas.style.height = `${metrics.cssHeight}px`

  ctx.setTransform(metrics.dpr, 0, 0, metrics.dpr, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
}

/** Paint one frame. Letterbox bars are filled black so `contain` never shows page background. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  metrics: CanvasMetrics,
): void {
  if (metrics.fit === 'contain') {
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, metrics.cssWidth, metrics.cssHeight)
  }
  ctx.drawImage(image, metrics.drawX, metrics.drawY, metrics.drawWidth, metrics.drawHeight)
}
