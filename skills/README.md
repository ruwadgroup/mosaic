# `skills/` - attachable agent skills

Templates a host attaches to its agent so the agent emits Mosaic well.
They follow the [Agent Skills](https://agentskills.io) layout (`SKILL.md` + reference files), which Claude Code and compatible agents load natively.

| Skill                        | What it does                                                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [`mosaic/`](mosaic/SKILL.md) | Teaches the agent when to emit an artifact, the mosaic-jsx rules, the block vocabulary, local interactivity, and a pre-emit self-check |

## These are templates

A skill here is an **example the host is meant to edit** - the same posture as the block catalog itself.
Ship it as-is and it targets the reference implementation's defaults; tune it and it targets you:

- **Mirror your manifest.** Replace the skill's Blocks section with the components your renderer actually supports (your `components_supported`, plus any macros you register).
  Unsupported rich blocks still decompose, but an agent that targets what you draw natively produces better artifacts.
- **Swap the examples.** Replace the generic example with one or two in your house idiom - your domain's plan, your review card - since examples steer composition more than rules do.
- **Keep the rules.** The safety subset (data-never-code, tokens-not-values, baked-in data, `alt`, the fence) is the format, not a preference; hosts must not relax it.
- **Never expose the IR to the model.** The agent writes the Mosaic pattern and nothing else; compiling to the IR, serializing it, and delivering it over MCP are your side of the line.
  Keep IR shapes, `mosaic-json`, and resource plumbing out of anything the model reads - the skill deliberately never mentions them ([invariant 5](../ARCHITECTURE.md#invariants)).

## Attaching

- **Claude Code / compatible agents:** copy `mosaic/` into the project's or user's skills directory (e.g. `.claude/skills/mosaic/`).
- **Anything else:** inline `SKILL.md`'s body in the system prompt, alongside the compact manifest (`compactManifest(m)` from `@mosaic/core`).

The skill and the manifest do different jobs: the manifest says what this host supports; the skill says how to write Mosaic at all.
