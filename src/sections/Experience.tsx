import { EXPERIENCE } from '../data/content'

/**
 * Each employer is a cinematic chapter rather than a resume card. Alignment
 * alternates so the copy does not sit on the same part of the frame every time.
 */
export function Experience() {
  return (
    <>
      {EXPERIENCE.map((chapter, index) => (
        <section
          key={chapter.company}
          className={`story-section story-section--chapter align-${chapter.align}`}
          id={index === 0 ? 'experience' : undefined}
        >
          <div className="story-inner" data-reveal="full">
            <p className="meta">
              <span className="meta__index">{chapter.index}</span>
              CHAPTER · {chapter.index} / 05
            </p>
            <h2 className="display display--lg">{chapter.company}</h2>
            <div className="chapter-meta">
              {/* Only rendered when the fact exists - no placeholder titles. */}
              {chapter.role !== null ? <p className="chapter-role">{chapter.role}</p> : null}
              {chapter.role === null && chapter.label !== null ? (
                <p className="meta meta--label">{chapter.label}</p>
              ) : null}
              <p className="meta meta--date">{chapter.dateline}</p>
            </div>
            <p className="chapter-body">{chapter.description}</p>
          </div>
        </section>
      ))}
    </>
  )
}
