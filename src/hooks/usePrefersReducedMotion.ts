import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/** Tracks the OS reduced-motion preference, including changes made after load. */
export function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(QUERY).matches
  })

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(QUERY)
    const onChange = (event: MediaQueryListEvent) => setPrefers(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return prefers
}
