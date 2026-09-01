import { LOCAL_FRAME_COUNT } from './HeroCanvas/frameSource'

interface LoaderProps {
  loaded: number
  hidden: boolean
}

/**
 * Startup readiness only. The counter tracks the 20 local bootstrap frames - never
 * all 483, because the sequence is streamed rather than preloaded.
 */
export function Loader({ loaded, hidden }: LoaderProps) {
  const count = String(Math.min(loaded, LOCAL_FRAME_COUNT)).padStart(2, '0')
  return (
    <div className={`loader${hidden ? ' is-hidden' : ''}`} aria-hidden={hidden}>
      <div className="loader__inner">
        <p className="loader__mark">CIHAI</p>
        <p className="loader__status">
          LOADING {count}/{LOCAL_FRAME_COUNT}
        </p>
        <div className="loader__bar">
          <span style={{ transform: `scaleX(${Math.min(loaded / LOCAL_FRAME_COUNT, 1)})` }} />
        </div>
      </div>
    </div>
  )
}
