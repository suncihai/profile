import { useEffect } from 'react'
import type { RefObject } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * Wires every `[data-reveal]` block inside the story to a scrubbed enter/hold/leave
 * timeline, using its enclosing `.story-section` as the trigger.
 *
 * Variants:
 *   full  - fade in, hold, fade out (default; used by mid-story chapters)
 *   enter - fade in and stay (hero, footer: nothing should dissolve at the ends)
 *   exit  - visible from the start, fades out on the way past
 */
export function useStoryReveal(scopeRef: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    const scope = scopeRef.current
    if (scope === null || !enabled) return

    const ctx = gsap.context(() => {
      const blocks = scope.querySelectorAll<HTMLElement>('[data-reveal]')
      blocks.forEach((block) => {
        const variant = block.dataset.reveal || 'full'
        const section = block.closest<HTMLElement>('.story-section') ?? block

        const timeline = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        })

        if (variant === 'exit') {
          gsap.set(block, { opacity: 1, y: 0, filter: 'blur(0px)' })
          timeline.to(block, { duration: 1.35 })
        } else {
          timeline.fromTo(
            block,
            { opacity: 0, y: 44, filter: 'blur(5px)' },
            { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1, ease: 'power2.out' },
          )
          timeline.to(block, { duration: 1.15 })
        }

        if (variant !== 'enter') {
          timeline.to(block, {
            opacity: 0,
            y: -32,
            filter: 'blur(5px)',
            duration: 1,
            ease: 'power2.in',
          })
        }
      })

      // Staggered detail lines inside a revealed block, kept very restrained.
      const details = scope.querySelectorAll<HTMLElement>('[data-reveal-stagger] > *')
      details.forEach((item, index) => {
        gsap.fromTo(
          item,
          { opacity: 0, y: 22 },
          {
            opacity: 1,
            y: 0,
            duration: 0.7,
            ease: 'power2.out',
            delay: index * 0.08,
            scrollTrigger: { trigger: item, start: 'top 88%', once: true },
          },
        )
      })
    }, scope)

    // Layout settles after fonts and the canvas mount; recompute once.
    const refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 250)

    return () => {
      window.clearTimeout(refreshTimer)
      ctx.revert()
    }
  }, [scopeRef, enabled])
}
