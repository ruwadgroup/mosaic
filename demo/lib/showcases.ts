import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Showcase } from '@/lib/showcase-meta';

type Copy = Omit<Showcase, 'id' | 'source'>;

const COPY: Record<string, Copy> = {
  'review-changes': {
    title: 'Review changes',
    blurb: "Untick a file and the commit button's label, count, and args re-derive.",
    prompt:
      'Refactor the session store to Effect atoms, then show me what changed before you commit anything.',
    description:
      'A refactor diff, ready for your call. Untick anything you want to hold back - the commit button always reflects exactly what it will do, because its label, count, and intent args derive from the same checkboxes.',
    group: 'Ship',
    meta: '5 files · needs your call',
    followups: {
      commit:
        "Committed 5 files on mosaic/effect-atoms · a41c9e2. CI is running; I'll flag anything red.",
      openDiff:
        'Opened the full diff in your editor - 5 files, +214 -87. The schema change is in the last hunk.',
      discardAll:
        'Discarded the working tree. mosaic/effect-atoms is back at 9f31d02; nothing was committed.',
    },
  },
  'test-results': {
    title: 'Test results',
    blurb:
      '321 tests, 3 failures - two flaky, one real, and a re-run that takes exactly the failures.',
    prompt: 'Run the suite and show me what broke.',
    description:
      '321 tests, 3 failures, 41.2s. Two of the three are known flaky - the real regression is the proration test, and it is a timezone assumption in the fixture. Excerpts inline; re-run takes exactly the failing tests.',
    group: 'Ship',
    meta: '318 passed · 3 failed',
    followups: {
      rerunFailed:
        'Re-ran the 3 failures in isolation: both flaky ones pass now, billing/invoice.test.ts fails deterministically. Want me to pin the fixture to UTC?',
      openTest: 'Opened billing/invoice.test.ts:148 in your editor.',
    },
  },
  'command-approval': {
    title: 'Command approval',
    blurb: 'An approval prompt where your scope choice travels inside the intent.',
    prompt: "Finish the session-store work - run whatever's left.",
    description:
      'The agent wants to run a migration that writes to your local database, so it asks first. Pick a scope - the Allow button carries it as a typed intent, so your approval policy becomes data, not a modal click.',
    group: 'Ship',
    meta: 'wants to run a migration',
    followups: {
      approveCommand:
        'Ran pnpm drizzle-kit migrate in 640 ms - 0042_sessions.sql applied, sessions now has last_seen_at. Your approval scope was recorded with the intent.',
      denyCommand:
        'Skipped the migration. The code changes still work against the old schema; I left a TODO to run it before deploy.',
    },
  },
  'expense-approval': {
    title: 'Expense approval',
    blurb:
      'Untick a line item and the approval total, held-back stat, and button label re-derive instantly.',
    prompt:
      "Priya's expense report from the Chicago trip is in my queue - lay it out so I can approve it line by line.",
    description:
      'Six line items as checkboxes over one record array, with two policy flags. The flagged callout only appears while a flagged line is still ticked, and Approve carries the exact computed total and flagged count it displays.',
    group: 'Ship',
    meta: '6 line items · $1,267.30',
    followups: {
      approveExpenses:
        "Approved 5 items for $1,225.30 and queued the reimbursement for Friday's payroll run; Priya has been notified.",
      returnFlagged:
        'Sent E-3 and E-5 back to Priya with a note citing the $75 meal cap and the minibar rule in travel policy 4.2.',
      rejectReport:
        'Rejected the report and sent Priya the policy references so she can resubmit corrected lines.',
    },
  },
  'plan-migration': {
    title: 'Postgres migration plan',
    blurb: 'Filter the milestones by owner and the progress stats re-derive from the same rows.',
    prompt: 'Plan the migration off the legacy Postgres, with owners and risks.',
    description:
      'Six milestones across five phases, target GA Aug 05. Filter the list by owner - the progress stats derive from the same baked-in data, so they can never drift.',
    group: 'Ship',
    meta: '6 milestones',
  },

  'model-compare': {
    title: 'Which model for this refactor',
    blurb: 'Flip the priority and the verdict, badges, and button all re-score locally.',
    prompt: 'Which model should run the session-store refactor - is fable overkill?',
    description:
      'Four candidates, priced and timed for one refactor job. Flip the priority - the recommendation, the verdict, and the button all re-derive from the same choice, so what you click is exactly what runs.',
    group: 'Decide',
    meta: 'cost vs quality',
    followups: {
      selectModel:
        "Locked in - the run is queued with your pick. I'll open a review-changes thread when the diff is ready.",
    },
  },
  'dependency-upgrades': {
    title: 'Dependency upgrades',
    blurb: 'Select upgrades; the breaking-change warning and the button count track your picks.',
    prompt: 'Anything outdated? Check our dependencies.',
    description:
      'Four packages behind, one of them a major. The vitest 3 jump is the only one with real migration work - keep it ticked and the breaking-change callout stays. The button count tracks your selection.',
    group: 'Decide',
    meta: '4 outdated · 1 breaking',
    followups: {
      upgradeDeps:
        'Upgraded: lockfile bumped, suite re-run - green. PR #218 is up, vitest config migration included.',
      snoozeUpgrades:
        "Snoozed. I'll bring these back next week, or sooner if a security advisory lands.",
    },
  },
  'ab-test-results': {
    title: 'A/B test readout',
    blurb:
      'Flip the target metric and the winner badge, chart, verdict, and ship button all switch sides.',
    prompt:
      'EXP-114 wrapped up - show me the one-page checkout results and tell me which variant to ship.',
    description:
      'One experiment scored three ways: variant B wins conversion and revenue but loses D30 retention, so the recommendation is a function of what you optimize for. The Ship button re-derives the winning variant from the selected metric.',
    group: 'Decide',
    meta: '96k sessions · 3 metrics',
    followups: {
      shipVariant:
        'Rolling variant B to 100% behind the checkout flag now; I will watch conversion and the retention cohort for 48 hours and report back.',
      extendExperiment:
        'Extended EXP-114 by two weeks so the D30 retention cohort matures; I will re-run this readout when it closes.',
    },
  },
  'compare-memory-layer': {
    title: 'AI memory layers',
    blurb: 'A product comparison that re-scores itself when you flip the audience.',
    prompt: 'Which AI memory layer should we adopt - Mem0, Zep, Letta, or Cognee?',
    description:
      'The 2026 landscape, scored for where each product actually fits. Flip the audience at the bottom - the verdicts re-score locally, no round-trip.',
    group: 'Decide',
    meta: 'Mem0 vs Zep vs Letta',
  },

  'usage-cost': {
    title: 'Session cost breakdown',
    blurb: 'Session spend, cache rate, and a compaction slider that re-projects the next 10 turns.',
    prompt: 'What has this session cost so far, and how do I keep it down?',
    description:
      '$3.42 over 24 turns, and caching already absorbed 61% of the input volume. The lever you control is context size: drag the compaction threshold and the projection recomputes from the same blended rate.',
    group: 'Understand',
    meta: '$3.42 · 61% cached',
    followups: {
      setCompaction:
        "Set. I'll compact the conversation whenever context crosses your threshold - summaries stay pinned, code stays verbatim.",
    },
  },
  'incident-review': {
    title: 'Incident post-review',
    blurb:
      'Tick the action items worth filing and the follow-ups button carries the exact count and ids.',
    prompt:
      "Write up the post-review for yesterday's checkout outage - what happened, the impact, and the action items we should actually file.",
    description:
      'A SEV-1 digested into a Timeline of phases, a blast-radius stat row, and a checklist that filters by area. Unticking the alerting fix surfaces a warning callout, and the File follow-ups intent folds over the same records the count label does.',
    group: 'Understand',
    meta: 'SEV-1 · 43 min · 5 follow-ups',
    followups: {
      fileFollowups:
        'Filed 3 follow-up tickets with owners and due dates, linked them to INC-2043, and posted the list in #eng-incidents.',
      sharePostmortem:
        'Shared the post-review to #eng-incidents and added INC-2043 to the incident index.',
    },
  },
  'network-waterfall': {
    title: 'Checkout waterfall',
    blurb:
      'Nine requests drawn as a real waterfall, with the serial tail a fix would actually move.',
    prompt: 'Why is /checkout slow on a cold cache?',
    description:
      'Nine requests over 642 ms. The document, styles, and script load fine - the serial tail at the end (cart → checkout → payment) is the 291 ms a fix would actually move.',
    group: 'Understand',
    meta: '642 ms cold',
  },
  'request-path': {
    title: 'Request path',
    blurb: 'An architecture diagram you click through; the detail card is local state.',
    prompt: 'Walk me through how a request flows through prod - and why checkout is slow.',
    description:
      'The production path, drawn. Click any node - the detail card below it is local state, no round-trip. Everything is healthy except the jobs queue, and checkout blocks on its 3.4s enqueue.',
    group: 'Understand',
    meta: 'queue p95 3.4s',
    followups: {
      openRunbook:
        'Opened the queue runbook at the fsync section. Quick mitigation is batching the fsync; the real fix is making the checkout enqueue fire-and-forget.',
    },
  },

  'mock-settings': {
    title: 'Settings screen mock',
    blurb: 'A settings screen mocked as live controls; Save hands back one settings object.',
    prompt: 'Mock the workspace settings screen before we commit to building it.',
    description:
      'Tabs open on Profile by default. Every control is live against local state - timezone autocomplete, notification channels, domain allow-list - and Save hands your app one settings object.',
    group: 'Mock',
    meta: 'live controls',
    followups: {
      saveSettings:
        'Saved - one settings object, exactly the shape your API would take. This is the payload a real backend would receive.',
      resetSettings: 'Reset to the defaults the mock shipped with.',
    },
  },
  'pricing-estimator': {
    title: 'Pricing estimator',
    blurb: 'Drag the seats and every figure recomputes - totals, savings, and the chart.',
    prompt: 'Mock our pricing page - I want to feel the seat math before we build it.',
    description:
      'Every figure here is derived. Drag the seats, flip annual billing - the totals, the savings, and the comparison chart recompute as you go. Checkout hands your app the computed total.',
    group: 'Mock',
    meta: 'derived seat math',
    followups: {
      startCheckout:
        'Checkout intent received with the computed total - in a real app this opens billing with the exact figure you saw.',
    },
  },
  'customer-details': {
    title: 'Customer details mock',
    blurb: 'An AML console mock: filter the ledger and the flagged totals re-derive.',
    prompt: 'Mock the customer details screen for the AML console - a high-risk trading company.',
    description:
      'Meridian Trading FZE: risk posture up top, a transaction ledger you can filter (the flagged totals derive from the same rows), screening hits, and the audit trail. Escalate hands your case system the whole picture - flagged count and value computed at click time.',
    group: 'Mock',
    meta: 'AML console',
    followups: {
      escalateToCase:
        'Case CASE-1187 opened with the computed snapshot: flagged count, flagged value, and both open holds attached.',
      requestKyc:
        'KYC refresh requested from the relationship manager; due before the Jul 15 review.',
      addNote: 'Note appended to the audit trail, attributed to you.',
    },
  },
  'flight-picker': {
    title: 'Flight picker',
    blurb:
      'Toggle nonstop or drag the price cap and the card list, match count, and best-value pick all re-derive.',
    prompt:
      'Find me a flight from SFO to JFK on July 10 - show the options so I can pick one and book it.',
    description:
      'Four fares filtered live by a nonstop toggle and a price slider, with a best-value callout that re-sorts whatever survives. Selecting the red-eye triggers a warning, and Book quotes the selected flight plus the bag fee as computed intent args.',
    group: 'Mock',
    meta: '4 flights · SFO to JFK',
    followups: {
      bookFlight:
        'Booked JetBlue B6-616 for $352 with a checked bag; confirmation and the seat map are in your email.',
      trackPrices:
        'Watching SFO to JFK fares for Jul 10; I will ping you if anything under your $360 cap drops or a nonstop goes on sale.',
    },
  },
  'tip-splitter': {
    title: 'Tip splitter',
    blurb: 'A working calculator: preset tips, clamped steppers, per-person math on the spot.',
    prompt: 'Split the dinner bill - 4 of us, and make the tip adjustable.',
    description:
      'A small working calculator. The preset buttons write a computed tip back into state, the steppers clamp at sensible bounds, and the per-person figure derives from the same three numbers.',
    group: 'Mock',
    meta: 'local math only',
  },
  'spec-review': {
    title: 'Spec review: @mentions',
    blurb: 'A feature spec on one screen, with a live sign-off checklist.',
    prompt: 'Turn spec 033 (@mentions in comments) into something I can review at a glance.',
    description:
      "The whole spec on one screen: what's already scaffolded vs dead wiring, the two parallel work units, and the STOP conditions. The sign-off tab is live - tick the human checks and Approve hands your tracker the decision with the count baked in.",
    group: 'Mock',
    meta: 'sign-off live',
    followups: {
      approveSpec:
        'Spec 033 approved and tagged go, with your confirmed check count recorded. Execution can fan out.',
      requestChanges:
        'Marked as needs-changes. Tell me what to tighten and I will revise the spec.',
    },
  },
};

// Within each group, the demo that impresses fastest leads.
const ORDER = [
  // Ship
  'review-changes',
  'expense-approval',
  'test-results',
  'plan-migration',
  'command-approval',
  // Understand
  'request-path',
  'network-waterfall',
  'incident-review',
  'usage-cost',
  // Decide
  'ab-test-results',
  'model-compare',
  'compare-memory-layer',
  'dependency-upgrades',
  // Mock
  'pricing-estimator',
  'flight-picker',
  'customer-details',
  'mock-settings',
  'spec-review',
  'tip-splitter',
];

export function loadShowcases(): Showcase[] {
  const dir = join(process.cwd(), '..', 'examples');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.mosaic'))
    .map((file): Showcase => {
      const id = file.replace('.mosaic', '');
      const copy: Copy = COPY[id] ?? {
        title: id,
        blurb: 'An unlisted example from examples/.',
        prompt: `Show me ${id}.`,
        description: 'Live, composed from general blocks.',
        group: 'Mock',
        meta: 'unlisted example',
      };
      return { id, source: readFileSync(join(dir, file), 'utf8'), ...copy };
    })
    .sort((a, b) => {
      const ai = ORDER.indexOf(a.id);
      const bi = ORDER.indexOf(b.id);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== bi) return ai === -1 ? 1 : -1;
      return a.title.localeCompare(b.title);
    });
}
