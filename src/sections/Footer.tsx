import { BriefcaseBusiness, Mail } from 'lucide-react';

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
          <div className="footer-contacts">
            <a className="footer-contact" href="mailto:suncihai@gmail.com">
              <Mail aria-hidden="true" size={18} strokeWidth={1.6} />
              <span>suncihai@gmail.com</span>
            </a>
            <a
              className="footer-contact"
              href="https://www.linkedin.com/in/cihai-sun-5620a375/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <BriefcaseBusiness
                aria-hidden="true"
                size={18}
                strokeWidth={1.6}
              />
              <span>LinkedIn</span>
            </a>
          </div>
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
