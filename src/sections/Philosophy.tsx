import { PHILOSOPHY } from '../data/content'

export function Philosophy() {
  return (
    <section className="story-section story-section--philosophy" id="philosophy">
      <div className="story-inner" data-reveal="full">
        <p className="meta">
          <span className="meta__index">{PHILOSOPHY.index}</span>
          {PHILOSOPHY.title}
        </p>
        <h2 className="display display--md">{PHILOSOPHY.headline}</h2>
        <p className="lede">{PHILOSOPHY.body}</p>
        <div className="column-pair">
          {PHILOSOPHY.columns.map((column) => (
            <div className="column" key={column.title}>
              <h3>{column.title}</h3>
              <p>{column.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
