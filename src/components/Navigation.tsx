import { useCallback } from 'react'

interface NavigationProps {
  visible: boolean
}

/** Smooth-scroll to a story anchor without touching the URL hash. */
function scrollToSection(id: string) {
  const target = document.getElementById(id)
  if (target === null) return
  const top = window.scrollY + target.getBoundingClientRect().top
  window.scrollTo({ top, behavior: 'smooth' })
}

export function Navigation({ visible }: NavigationProps) {
  const goExperience = useCallback(() => scrollToSection('experience'), [])
  const goWork = useCallback(() => scrollToSection('work'), [])
  const goTop = useCallback(() => window.scrollTo({ top: 0, behavior: 'smooth' }), [])

  return (
    <header className={`site-nav${visible ? ' is-visible' : ''}`}>
      <button type="button" className="site-nav__brand" onClick={goTop}>
        <span className="site-nav__mark">CIHAI</span>
        <span className="site-nav__divider">/</span>
        <span className="site-nav__role">CODE NINJA</span>
      </button>
      <nav className="site-nav__links" aria-label="Primary">
        <button type="button" onClick={goExperience}>
          EXPERIENCE
        </button>
        <button type="button" onClick={goWork}>
          WORK
        </button>
        <button type="button" onClick={goTop}>
          TOP
        </button>
      </nav>
    </header>
  )
}
