# CIHAI · Code Ninja

A cinematic personal profile site: one continuous scroll-driven frame sequence rendered
to a Canvas, with all typography living in real DOM above it.

Built with **React + Vite + TypeScript + GSAP/ScrollTrigger + Canvas 2D**. No Next.js,
no backend, no database, no Three.js, and no `<video>` scrubbing.

---

## Architecture

```
CinematicStage (src/App.tsx)
├── HeroCanvasLayer        fixed, z-0   — the streamed 483-frame sequence
├── ThreeInteractionLayer  fixed, z-1   — Phase 2A: transparent WebGL floating glass
│   ├── GlassSystem                     — 2-3 intact shards, spawn / float / break / respawn
│   ├── ShurikenSystem                  — one pooled projectile, ~220-350ms flight
│   ├── FragmentSystem                  — pooled shatter splinters + impact flash
│   └── PointerInteraction              — window-level pointer capture + raycasting
├── EditorialStoryLayer            z-2  — every headline, chapter and project (real DOM)
└── Navigation + Loader            z-20 — chrome
```

The Canvas is **only** a picture. No website typography is ever painted into it, which is
what keeps the copy selectable, accessible, responsive, and translatable — and what leaves
room for Phase 2 to mount an interactive layer between the image and the text.

### Why the canvas is not driven by React state

Scrolling changes the target frame up to 60 times a second. Pushing that through
`setState` would re-render the tree on every tick. Instead:

- GSAP scrubs a single mutable object, `playheadRef.current = { frame }`.
- A `requestAnimationFrame` loop reads that ref and repaints.
- A repaint happens **only** when the integer frame changes, when a better image
  finishes loading, or after a resize — never the same bitmap twice in a row.

React state is used for exactly two things: the startup progress counter and the
one-time "ready" flip.

### Key files

| File | Responsibility |
| --- | --- |
| `src/components/HeroCanvas/frameSource.ts` | The single authority on frame URLs and counts |
| `src/components/HeroCanvas/frameCache.ts` | Bounded LRU of decoded frames + nearest-frame lookup |
| `src/components/HeroCanvas/frameLoader.ts` | Prioritised queue, bounded concurrency, retry/abort |
| `src/components/HeroCanvas/frameStreamer.ts` | Streaming policy: velocity → window → priorities |
| `src/components/HeroCanvas/canvasRenderer.ts` | Sizing, cover/contain, DPR, painting |
| `src/components/HeroCanvas/HeroCanvas.tsx` | Wires the above to the rAF loop and the DOM |
| `src/hooks/useStoryReveal.ts` | Scrubbed enter/hold/leave for every copy block |
| `src/data/content.ts` | All written content, including the experience facts |

---

## Frame hosting: hybrid local + R2

The sequence is **483 frames**, numbered `1` … `483`, WebP, **1920 × 1088** each.

| Frames | Location | Served from |
| --- | --- | --- |
| **1 – 20** | `public/video_frames/{n}.webp` (in this repo) | GitHub Pages, under the Vite base path |
| **21 – 483** | Cloudflare R2 | `https://storage.lovetwee.com/static/profile/frames/{n}.webp` |

Why: shipping all 483 frames would put roughly 45 MB into the Pages artifact. Keeping only
the first 20 locally means the artifact is **~2.8 MB** (1.6 MB of which is frames) and the
site is interactive after ~500 ms without a single third-party request. The remaining 463
frames stream in from the CDN as the visitor actually scrolls toward them.

### Resolving a frame URL

`getHeroFrameUrl(n)` in `frameSource.ts` is the **only** place a frame URL is constructed.

```ts
getHeroFrameUrl(7)   // "/profile/video_frames/7.webp"      (local, base-path aware)
getHeroFrameUrl(240) // "https://storage.lovetwee.com/static/profile/frames/240.webp"
```

Local frames go through `import.meta.env.BASE_URL`, never a hardcoded `/video_frames/…`,
because the site is served from the `/profile/` subpath on GitHub Pages. Remote frames are
absolute and therefore completely independent of the base path.

### Configuring the CDN base

Set `VITE_HERO_FRAME_CDN_BASE` (see `.env.example`). It defaults to the production R2 domain,
so no `.env` file is needed to build or deploy. Trailing slashes are normalised.

```bash
VITE_HERO_FRAME_CDN_BASE=https://cdn.example.com/frames npm run build
```

---

## The loader

Four stages, all in `frameStreamer.ts` + `frameLoader.ts`.

**Stage A — local bootstrap.** Frames 1–20 are requested in ascending order so frame 1
paints first. The site becomes usable off these alone; **no R2 request is issued before the
loader is dismissed**. Because `publish()` replaces the pending queue wholesale, the
bootstrap set is tracked separately so a first scroll can never drop its tail.

**Stage B — transition protection.** *After* the page is interactive, and inside
`requestIdleCallback` (with a `setTimeout` fallback), frames 21–50 are prefetched at the
lowest priority. This is what stops the 20 → 21 boundary from stalling. Skipped entirely
under reduced motion.

**Stage C — scroll-aware streaming.** On every integer frame change the streamer republishes
a window around the playhead, biased toward the direction of travel:

```
priority 0            the exact frame the viewer is on
priority i*2          frame target + direction*i     (forward, i = 1…lookahead)
priority i*6 + 3      frame target - direction*i     (backward safety, i = 1…10)
priority frame        any local bootstrap frame still missing
priority 100000 + n   idle background prefetch
```

Forward frame +4 therefore outranks backward frame −1: the bias is real, and it reverses
automatically when the visitor scrolls up.

**Adaptive lookahead.** `lookahead = clamp(15 + |framesPerSecond| * 0.28, 15, 70)`, on an
exponential moving average of the frame delta over time. Measured in-browser: ~15–25 frames
when reading, ~30–45 at normal scroll, saturating at 70 during a fling.

**Concurrency.** Maximum 6 simultaneous image loads on desktop (4 compact, 3 save-data). The
queue always starts the lowest-priority-number item first, so a jump to frame 300 begins
loading 300 immediately instead of draining stale work. In-flight requests more than 120
frames from the new target are aborted outright.

**Retry.** Up to 3 attempts with exponential backoff (400 ms → 800 ms → capped at 6 s, plus
jitter). After that the frame is abandoned permanently — never an infinite loop — and the
nearest-frame fallback covers the gap. Failures warn in dev only.

### Cross-origin note

`storage.lovetwee.com` does **not** send `Access-Control-Allow-Origin` (verified). The
renderer therefore uses `HTMLImageElement` **without** `crossOrigin`, and never calls
`getImageData()`, `toDataURL()`, or any other pixel-readback API — only `drawImage`, which
works fine with a tainted canvas. `fetch()` + `createImageBitmap()` was deliberately rejected
because it would require CORS that the origin does not currently grant.

---

## Memory

A decoded 1920 × 1088 frame costs roughly **8.4 MB** of bitmap memory. Retaining all 483
would be about **4 GB**, so decoded frames are capped:

| Profile | Decoded cache | Concurrency | Lookahead |
| --- | --- | --- | --- |
| Desktop | 72 frames | 6 | 15–70 |
| Compact (< 820 px) | 34 frames | 4 | 10–40 |
| `saveData` hint | 24 frames | 3 | 8–24 |

Eviction is LRU (a `Map`'s insertion order is the recency order; a hit re-inserts). The
current frame, its three predecessors, and up to 24 frames of lookahead are pinned and can
never be evicted. Local frames 1–20 are *not* pinned forever — once the visitor is deep in
the timeline they are evicted like anything else and re-fetched from the HTTP cache if the
visitor scrolls all the way back. Measured peak in-browser: **72 / 72**, flat across the
whole timeline.

---

## Missing-frame behaviour

The canvas is never cleared to blank. If the exact target frame is not decoded yet,
`FrameCache.nearest()` returns the closest frame that *is*, tie-breaking toward the scroll
direction, and that image is held. When the exact frame lands, the next animation tick draws
it. A blank canvas, white flash, or broken-image icon is not reachable by design — the only
degradation available is briefly holding a neighbouring frame.

Verified: a cold jump to frame 330 held frame 300 for ~250 ms, then resolved exactly. With
the CDN blocked entirely, the page kept rendering local frames, kept scrolling, and threw
no errors.

---

## Scroll timeline

- Story height: **900vh** (110 + 120 + 120 + 120 + 120 + 100 + 120 + 90).
- Mapping: `frame = 1 + progress * 482`, linear, `scrub: 0.4`.
- The frame tween ends **one viewport before** the document does, so frame 483 is reached as
  Featured Work finishes and is then **held**, frozen, behind the frosted footer. The canvas
  is never unmounted and the background never flashes.

Chapters: `00 HERO → 01 PHILOSOPHY → 02 STOCKTWITS → 03 PAXFUL → 04 BITMART →
05 FEATURED WORK → FOOTER`.

---

## Reduced motion

With `prefers-reduced-motion: reduce`:

- the typewriter is skipped and the full text renders immediately;
- the 483-frame scrub is not run at all — a single **local** frame (12) is held;
- Stage B never touches R2 (measured: **5 requests, 0 remote**);
- the 900vh runway collapses to a normal editorial page (~4.8vh);
- every reveal animation is disabled and all content is forced visible — **no information is
  lost**;
- the floating glass holds nearly still (drift amplitude scaled to ~14%, measured at 1–3px
  over 2.5s) and the shuriken/shatter interaction still works, with a shorter throw and a
  trimmed burst. The layer is `aria-hidden` and decorative — nothing is only expressed there.

---

## Development

```bash
npm install
npm run dev        # http://localhost:5173/profile/
npm run build      # tsc -b && vite build
npm run preview    # serve dist/ at http://localhost:4173/profile/
npm run lint
```

**Dev-only diagnostics.** Press <kbd>d</kbd> for a loader inspector, or call
`window.__heroDebug()` in the console for current/target frame, cache size, in-flight count,
velocity, lookahead, DPR and fit mode. `window.__glassDebug()` reports the Phase 2A layer:
per-shard state and screen position, loop/quiet/hidden flags, renderer DPR, active fragment
count, and live geometry / texture / program / scene-child counts for leak checking. All are
stripped from production builds (verified: both are `undefined` in `dist`). There is no
per-scroll logging.

---

## GitHub Pages deployment

Remote: `https://github.com/suncihai/profile.git` → project page at
`https://suncihai.github.io/profile/`, so `vite.config.ts` sets `base: '/profile/'`.

`.github/workflows/deploy.yml` runs on push to `main`: checkout → setup-node → `npm ci` →
lint → build → `configure-pages` → `upload-pages-artifact` → `deploy-pages`, with
`contents: read`, `pages: write`, `id-token: write`.

Only `dist/` is uploaded. **The 463 R2 frames are never part of the artifact.**

> If the repo is ever renamed, update `base` in `vite.config.ts` to match. For a
> `<username>.github.io` root repo, `base` becomes `'/'`.

---

## Replacing the sequence later

1. Re-extract frames as `1.webp` … `N.webp` at a consistent resolution.
2. Upload frames `LOCAL_FRAME_COUNT + 1` … `N` to R2 under the same prefix.
3. Copy the first 20 into `public/video_frames/`.
4. Update `TOTAL_FRAMES`, `FRAME_WIDTH`, and `FRAME_HEIGHT` in `frameSource.ts`.

Nothing else needs to change: sizing reads the declared intrinsic dimensions rather than
assuming 16:9, and every URL flows through `getHeroFrameUrl`.

---

## Phase 2A: floating glass interaction

`ThreeInteractionLayer` (`#future-interactive-layer`) mounts a transparent WebGL canvas
between the frame sequence and the copy. Two or three irregular glass shards drift slowly in
the scene; click one and a shuriken flies in from off screen, and on impact the shard bursts
into pooled splinters and a replacement fades in elsewhere 1–2 seconds later.

| File | Responsibility |
| --- | --- |
| `src/interaction/ThreeInteractionLayer.tsx` | Mounts and disposes the runtime; the only React in the feature |
| `src/interaction/scene/InteractionRuntime.ts` | The single rAF loop, resize, visibility, and system wiring |
| `src/interaction/scene/createInteractionScene.ts` | Renderer, orthographic camera, lights, environment |
| `src/interaction/scene/GlassSystem.ts` | Shard slots, lifecycle, drift, spawn zones, hit picking |
| `src/interaction/scene/ShurikenSystem.ts` | One pooled projectile: trajectory, spin, impact |
| `src/interaction/scene/FragmentSystem.ts` | Pooled splinters, hand-integrated motion, impact flash |
| `src/interaction/scene/PointerInteraction.ts` | Window pointer capture, UI exclusion, ray construction |
| `src/interaction/config.ts` | Every tunable number, including the measured spawn zones |

The rules this layer lives by:

- **It never captures input.** The canvas is `pointer-events: none`. Pointer events are read
  at the window and ignored whenever the target is inside `a`, `button`, `input`, `textarea`,
  `select`, `[role="button"]` or `[data-no-glass-interaction]`, so the site's own UI always wins.
- **It never touches Phase 1.** No import from the frame loader, the playhead or the GSAP
  timeline. The only coupling to the scroll experience is a passive `window.scrollY` read for
  a small parallax offset.
- **It costs nothing when idle or invisible.** One rAF loop, pre-baked geometry, pooled
  objects, DPR capped at 1.5, and the loop stops when the tab is hidden or when the frosted
  footer fills the viewport (after the layer has faded out, never while glass is visible).
- **It is progressive enhancement.** If a WebGL2 context cannot be created, the layer is
  skipped silently and Phase 1 is untouched. Three.js ships in its own lazy chunk, requested
  only after the cinematic bootstrap has revealed the stage.

## Phase 2B boundary

Camera gesture recognition, hand tracking, chapter-aware glass placement, sound, and
glass-to-navigation behaviour mount into the same layer. **None of it is implemented yet.**
