# Security Policy

Mosaic's security claims live in [§8 of the proposal](../docs/proposal.md#8-security). The short version: Mosaic cannot express executable code by construction, and every action is the host's - an `on:event` hands the host a named intent, and the artifact cannot reach the network, call a tool, or navigate on its own. If you think one of those two claims is wrong, that's a security issue.

## Reporting a vulnerability

> [!WARNING]
> **Don't open a public GitHub issue for a security report.** Public disclosure before a fix is shipped puts users at risk. Email me directly instead.

- **[tamimbinhakim.work@gmail.com](mailto:tamimbinhakim.work@gmail.com)** — subject line starting with `[mosaic-security]`.

Tell me:

1. What you found.
2. How to reproduce it (a minimal Mosaic payload or a minimal repro of an implementation flaw).
3. What you think the impact is.
4. Whether you'd like to be credited when the fix ships.

I'll acknowledge within **72 hours**. I'll aim to triage within a week. For a confirmed issue, I'll cut a fix and coordinate disclosure with you on a timeline that fits the severity — usually 30–90 days.

## Scope

In scope:

- Compiler bugs that let Mosaic express executable code.
- Renderer bugs that let an artifact act without the host - reaching the network, calling a tool, or navigating on its own.
- `<Embed>` policy bypasses.
- Bugs that let an artifact fire a host action the user did not trigger, or that hide which action a control will fire.
- Diff-stability / canonical-IR bugs that could be weaponized to hide changes.

Out of scope (right now):

- Social engineering that talks a user into triggering a host action - that's a known residual risk (§8 of the proposal). Reports on the _action-confirmation UI_ are welcome though.
- Issues in third-party MCP servers — please file with the relevant server's maintainers.
- Issues in dependency packages — please file upstream and let me know so I can pin around them.

## Disclosure policy

I'll publish a security advisory once the fix is shipped, credit you (unless you'd rather not be named), and add a `Security` entry to the changelog. I won't sit on fixes — if a patch is ready, it ships.

— Tamim
