/**
 * All written content for the site.
 *
 * Employment facts are recorded exactly as supplied. Where a title or an end date
 * was not provided it is `null` here and simply not rendered - nothing is invented
 * to fill a gap in the layout.
 */

export interface ExperienceChapter {
  /** Two-digit chapter label used in the editorial treatment. */
  index: string;
  company: string;
  /** Null when no formal title was supplied. */
  role: string | null;
  /** Small uppercase label used when no formal title exists. */
  label: string | null;
  /** Rendered verbatim; null end dates are never guessed. */
  dateline: string;
  description: string;
  align: 'left' | 'right';
}

export const EXPERIENCE: ExperienceChapter[] = [
  {
    index: '02',
    company: 'STOCKTWITS',
    role: 'Senior Engineer',
    label: null,
    dateline: 'Oct 2021 — Present',
    description:
      'Built and shipped major web product experiences across the Stocktwits platform, including Trade, KYC, Options, Earnings Calls, CryptoTwits, and more.',
    align: 'left',
  },
  {
    index: '03',
    company: 'PAXFUL',
    role: null,
    label: 'ENGINEERING',
    // No end date was supplied, so only the known start is shown.
    dateline: 'Mar 2020',
    description:
      'Bitcoin peer-to-peer marketplace. Worked on KYC and major web refactoring.',
    align: 'right',
  },
  {
    index: '04',
    company: 'BITMART',
    role: null,
    label: 'ENGINEERING',
    // No end date was supplied, so only the known start is shown.
    dateline: 'Jan 2017',
    description:
      'Crypto exchange. Responsible for development of the trading platform’s web experience.',
    align: 'left',
  },
];

export interface Project {
  badge?: string;
  href?: string;
  description: string;
  index: string;
  name: string;
  platform: string;
}

export const PROJECTS: Project[] = [
  {
    description: 'Todo app for couples.',
    href: 'https://apps.apple.com/us/app/twodos/id6769847117',
    index: '01',
    name: 'TwoDos',
    platform: 'iOS App',
  },
  {
    description: 'Home inventory app for couples.',
    href: 'https://apps.apple.com/us/app/findit-home/id6794023527',
    index: '02',
    name: 'FindIt',
    platform: 'iOS App',
  },
  {
    description: 'AI companion apps.',
    badge: '/images/lovetwee_badge.jpg',
    href: 'https://www.lovetwee.com/ai-girlfriend',
    index: '03',
    name: 'LoveTwee',
    platform: 'Web + iOS',
  },
];

export const HERO = {
  eyebrow: 'CIHAI · CODE NINJA',
  typedLines: ['I’m a code ninja.', 'Fast. Precise. Decisive.'],
  support: ['Move fast.', 'Cut through complexity.', 'Ship with precision.'],
  scrollHint: 'SCROLL TO ENTER',
};

export const PHILOSOPHY = {
  index: '01',
  title: 'PHILOSOPHY',
  headline: 'The blade is drawn once.',
  body: 'Read the problem completely. Choose the smallest cut that solves it. Then commit — no hesitation, no second swing.',
  columns: [
    {
      title: 'Speed.',
      body: 'Momentum is a feature. Decisions made early and cheaply beat decisions made perfectly and late.',
    },
    {
      title: 'Precision.',
      body: 'Fast is only fast when it lands. Small surface area, clear boundaries, code that does exactly what it claims.',
    },
  ],
};

export const WORK = {
  index: '05',
  title: 'FEATURED WORK',
  headline: 'Things built outside the day job.',
};

export const FOOTER = {
  headline: ['Ready to look again?'],
  action: 'SCROLL BACK',
  copyright: '© 2026 CIHAI',
};
