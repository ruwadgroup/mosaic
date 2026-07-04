export type ShowcaseGroup = 'Ship' | 'Decide' | 'Understand' | 'Mock';

export type Showcase = {
  id: string;
  title: string;
  blurb: string;
  prompt: string;
  description: string;
  group: ShowcaseGroup;
  meta: string;
  source: string;
  followups?: Record<string, string>;
};

export const GROUPS: { id: ShowcaseGroup; tagline: string }[] = [
  { id: 'Ship', tagline: "The agent's work products, ready for your call" },
  { id: 'Understand', tagline: 'Runtime behavior made visible' },
  { id: 'Decide', tagline: 'Choices with live trade-offs' },
  { id: 'Mock', tagline: 'Screens proposed before anyone builds them' },
];
