/**
 * The single authoritative description of where hero frames come from.
 *
 * The sequence is hybrid-hosted on purpose:
 *   frames 1..20    -> shipped in this repository (public/video_frames), served by
 *                      GitHub Pages under the Vite base path. These bootstrap the
 *                      experience so the site is usable before any network round trip
 *                      to a third-party origin.
 *   frames 21..483   -> Cloudflare R2 behind the storage.lovetwee.com custom domain.
 *                      Streamed in on demand so the Pages artifact stays ~1.6 MB
 *                      instead of ~45 MB.
 *
 * No other module should ever build a frame URL by hand.
 */

/** Total frames in the cinematic sequence. Frame 484 is a verified 404 on the CDN. */
export const TOTAL_FRAMES = 483

/** Frames 1..LOCAL_FRAME_COUNT live in the repository. */
export const LOCAL_FRAME_COUNT = 20

/** Intrinsic size of every frame, verified locally and against the CDN. */
export const FRAME_WIDTH = 1920
export const FRAME_HEIGHT = 1088

/**
 * Remote base, overridable per-environment via VITE_HERO_FRAME_CDN_BASE.
 * The default is production-safe so no .env file is required to build or deploy.
 */
const RAW_CDN_BASE =
  import.meta.env.VITE_HERO_FRAME_CDN_BASE ??
  'https://storage.lovetwee.com/static/profile/frames'

/** Normalised remote base with any trailing slashes removed. */
export const HERO_FRAME_CDN_BASE = RAW_CDN_BASE.replace(/\/+$/, '')

export function clampFrame(frame: number): number {
  if (!Number.isFinite(frame)) return 1
  return Math.min(TOTAL_FRAMES, Math.max(1, Math.round(frame)))
}

/** True when the frame has to be fetched cross-origin from R2. */
export function isRemoteFrame(frame: number): boolean {
  return clampFrame(frame) > LOCAL_FRAME_COUNT
}

/**
 * Resolve the URL for a frame number.
 *
 * Local frames are resolved through `import.meta.env.BASE_URL` (which Vite always
 * emits with a trailing slash), so they keep working when the site is served from
 * a GitHub project subpath such as `/profile/`. Remote frames are absolute and are
 * deliberately independent of the Pages base path.
 */
export function getHeroFrameUrl(frame: number): string {
  const n = clampFrame(frame)
  if (n <= LOCAL_FRAME_COUNT) {
    return `${import.meta.env.BASE_URL}video_frames/${n}.webp`
  }
  return `${HERO_FRAME_CDN_BASE}/${n}.webp`
}
