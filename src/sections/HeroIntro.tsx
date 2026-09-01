import { HERO } from '../data/content'
import { useTypewriter } from '../hooks/useTypewriter'

interface HeroIntroProps {
  reducedMotion: boolean
  /** Typing starts only once the local bootstrap has revealed the stage. */
  started: boolean
}

export function HeroIntro({ reducedMotion, started }: HeroIntroProps) {
  const { rendered, activeLine, done } = useTypewriter({
    lines: HERO.typedLines,
    speed: 45,
    linePause: 420,
    startDelay: 520,
    disabled: reducedMotion || !started,
  })

  return (
    <section className="story-section story-section--hero" id="hero">
      <div className="story-inner" data-reveal="exit">
        <p className="meta meta--eyebrow">{HERO.eyebrow}</p>

        <h1 className="hero-headline">
          {HERO.typedLines.map((line, index) => (
            <span className="hero-headline__line" key={line}>
              {/* The full line is kept in the accessibility tree so screen readers
                  never see a half-typed sentence. */}
              <span className="visually-hidden">{line}</span>
              <span aria-hidden="true">
                {rendered[index] ?? ''}
                {!done && activeLine === index ? <span className="caret" /> : null}
              </span>
            </span>
          ))}
        </h1>

        <div className="hero-support" data-reveal-stagger>
          {HERO.support.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>

        <p className="meta meta--hint">{HERO.scrollHint}</p>
      </div>
    </section>
  )
}
