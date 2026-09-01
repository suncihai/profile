import { FOOTER } from '../data/content';

export function Footer() {
  return (
    <section className="story-section story-section--footer">
      <footer className="footer-glass" data-reveal="enter">
        <div className="footer-glass__top">
          <h2 className="display display--sm">
            {FOOTER.headline.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h2>
          <a target="_blank" href="mailto:suncihai@gmail.com">
            suncihai@gmail.com
          </a>
          <button
            type="button"
            className="footer-action"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <span>{FOOTER.action}</span>
            <span aria-hidden="true" className="footer-action__arrow">
              ↑
            </span>
          </button>
        </div>
        <hr className="footer-glass__rule" />
        <p className="meta meta--copyright">{FOOTER.copyright}</p>
      </footer>
    </section>
  );
}
