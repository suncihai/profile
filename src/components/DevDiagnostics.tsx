import { useEffect, useState } from 'react'

type Diagnostics = Record<string, unknown>

/**
 * Dev-only loader inspector. Hidden until the "d" key is pressed and never
 * included in a production build (the caller guards on import.meta.env.DEV).
 */
export function DevDiagnostics() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Diagnostics | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'd' && !event.metaKey && !event.ctrlKey) setOpen((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    const read = () => {
      const probe = (window as unknown as { __heroDebug?: () => Diagnostics }).__heroDebug
      if (typeof probe === 'function') setData(probe())
    }
    read()
    const id = window.setInterval(read, 250)
    return () => window.clearInterval(id)
  }, [open])

  if (!open) return null

  return (
    <div className="dev-diagnostics">
      <strong>hero loader</strong>
      {data === null ? (
        <div>waiting…</div>
      ) : (
        Object.entries(data)
          .filter(([key]) => key !== 'cachedFrameNumbers')
          .map(([key, value]) => (
            <div key={key}>
              <span>{key}</span>
              <span>{String(value)}</span>
            </div>
          ))
      )}
      <div className="dev-diagnostics__hint">press d to close</div>
    </div>
  )
}
