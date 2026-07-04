# Mosaic demo - watch a reply arrive

This is the demo site for [Mosaic](../README.md): a single page in two sections.
The hero states the idea; the demo section below it replays, for any example you pick, the moment Mosaic exists for - you ask, the agent answers, and the answer streams in as a live interface instead of prose.

Nothing here is a screenshot or a canned image.
Each demo is a hand-written `.mosaic` file from [`../examples`](../examples), streamed line-by-line through `@mosaicjs/react`'s progressive rendering and drawn by this site's own component set.
When the stream finishes the artifact is simply live: move a slider and totals recompute, click a button and the host receives one structured intent with computed args - answered inline by the follow-up a real agent would send.

## Run it

```bash
pnpm install && pnpm build && pnpm demo
```

Then open <http://localhost:3000>.
Demos deep-link by hash, e.g. `/#review-changes`.

## The demos

Each group in the picker is a job an agent does; each demo is one use case where live UI beats markdown.

**Ship** - the agent's work products, ready for your call: `review-changes`, `test-results`, `command-approval`, `expense-approval`, `plan-migration`.

**Decide** - choices with live trade-offs: `model-compare`, `dependency-upgrades`, `ab-test-results`, `compare-memory-layer`.

**Understand** - runtime behavior made visible: `usage-cost`, `network-waterfall`, `request-path`, `incident-review`.

**Mock** - UI proposed before anyone builds it: `mock-settings`, `pricing-estimator`, `flight-picker`, `tip-splitter`, `customer-details`, `spec-review`.

## How it hangs together

- `lib/showcases.ts` (server) reads `../examples/*.mosaic` off disk and pairs each with its copy: the ask, what to notice, and the canned follow-up per intent.
- `components/chat-demo.tsx` is the animated exchange: the ask appears, the reply streams word-by-word, the artifact streams line-by-line (real `isStreaming` rendering, not a video), and intents land inline with their follow-ups.
- `components/home.tsx` is the page: centered hero, the demo section with its Select picker, GSAP entrances.
- `components/mosaic-blocks.tsx` maps every Mosaic block to this app's `components/ui/*` kit, proving the host-owned-design story: the artifact carries meaning, the app owns every pixel.
- `components/ui/*` is the vendored design system (shadcn `base-mira` style on `@base-ui/react`).

A note for agents working in this directory lives in [`AGENTS.md`](AGENTS.md): this Next.js version has breaking changes, read `node_modules/next/dist/docs/` first.
