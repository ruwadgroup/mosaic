# Design history

The origin story: why Markdown is too thin, why HTML is the wrong endpoint, and the move that unlocked the design.
The [proposal](proposal.md) is the definition; this is the path to it.

## The itch

A lot of what I ask an agent for comes back flattened.
Ask for a migration plan and you get paragraphs describing milestones that want to be a timeline.
Ask it to compare three options and you get prose walking a table that never gets drawn.
Ask for a pricing estimate and you get one number, when what you want is the slider.
The thinking is spatial; the medium is linear.
Thariq Shihipar's essay and gallery put a name on that gap for me, and this project started as an attempt to close it properly instead of case-by-case.

## Why Markdown is too thin

Markdown is the right instinct - a cheap, safe, host-styled format the model already speaks fluently.
But it tops out at headings, tables, and images.
There is no layout: nothing sits beside anything, nothing groups, nothing aligns.
There are no controls, no state, and no way for one value to drive another - the egg slider is unwritable.
Every extension path (HTML passthrough, custom fences, embedded scripts) breaks exactly the properties that made Markdown right: safety and host styling.
Markdown is a report.
I wanted an interface.

## Why HTML is the wrong endpoint

HTML can express everything, and that is the problem.
The moment the model emits HTML you inherit the whole web platform: script, styles, layout engines, and a trust model that ends in a sandboxed iframe.
The output arrives in a foreign look your app cannot theme, at a token cost that is absurd for what it carries - a plan that is 500 tokens of structure rides in 14,000 tokens of markup.
And an iframe is a wall: the host cannot see into the artifact, cannot restyle it, cannot own its actions.
Sandboxing is what you do when you cannot trust the medium.
The better move is a medium with nothing to distrust.

## The move that unlocked it

For a long time the design was stuck on a false choice: a language models write well (JSX) or a format machines process well (a typed tree) - each wrong for the other job.
The unlock was refusing to pick: **separate what the model writes from what the format is**.
The model writes a strict JSX pattern because that is the cheapest, most fluent surface a model has; it compiles one-way to a canonical IR, and the IR - not the JSX - is the format's identity and every renderer's contract.
Pandoc had proven that shape for documents: one reader, one tree, many writers.

Once the IR is the product, the rest of the design falls out of one commitment: **everything the agent emits is data**.

- Rendering: if the artifact is data, the host's renderer draws every block, so the design is the host's by construction - tokens like `tone="warn"` are names the host maps, never values that travel.
- Interactivity: the part everyone assumes needs code turns out to be the spreadsheet insight - a bounded, terminating expression language (CEL is the modern statement of it) covers derived values, conditionals, and lists, without ever becoming a program.
- Actions: whatever data cannot express becomes a named intent handed to the host, so authority stays where it was all along.
- Safety: there is no sandbox on the common path because there is nothing to sandbox - the compile-time grammar cannot represent code at all, which safe-mdx had already shown is a practical way to treat JSX.

None of the pieces is novel on its own - Adaptive Cards had host-themed catalogs, A2UI has declarative local interaction, CEL has bounded evaluation, Pandoc has the IR pipeline.
The design is the particular combination: a JSX wire a model emits for free, a canonical data-only IR underneath it, a spreadsheet-class expression language for the interactive part, and a host that owns every pixel and every action.

## Where it went from there

The [proposal](proposal.md) froze that shape section by section, the [invariants](../ARCHITECTURE.md#invariants) pinned what implementations must preserve, and the [specs](../specs/README.md) carry it forward capability by capability.
The block catalog and the schemas are deliberately the _proposed_ defaults - efficient starting points the spec process is meant to evolve - while the grammar, the IR, and the invariants are the parts meant to hold still.
