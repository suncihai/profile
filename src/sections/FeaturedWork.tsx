import { PROJECTS, WORK } from '../data/content';

/**
 * Typographic project panels. No invented descriptions, metrics, or stock imagery -
 * the projects carry only the facts that were supplied.
 */
export function FeaturedWork() {
  return (
    <>
      <section className="story-section story-section--work-intro" id="work">
        <div className="story-inner" data-reveal="full">
          <p className="meta">
            <span className="meta__index">{WORK.index}</span>
            {WORK.title}
          </p>
          <h2 className="display display--md">{WORK.headline}</h2>
        </div>
      </section>

      <section className="story-section story-section--work-list">
        <div className="story-inner story-inner--wide" data-reveal="full">
          <ul className="project-list" data-reveal-stagger>
            {PROJECTS.map((project) => (
              <li className="project" key={project.name}>
                <span className="project__index">{project.index}</span>
                <div className="project__text">
                  <span className="project__name">{project.name}</span>
                  <span className="project__description">
                    {project.description}
                  </span>
                </div>
                <a
                  href={project.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img
                    src={
                      project?.badge ? project.badge : '/images/apple_badge.png'
                    }
                    alt="Download on the App Store"
                    className="project__badge"
                  />
                </a>
                <span className="project__platform">{project.platform}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
