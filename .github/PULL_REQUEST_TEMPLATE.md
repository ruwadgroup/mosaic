## What

<!-- One or two sentences. What changes, at the level of "added X" / "fixed Y" / "renamed Z". -->

## Why

<!-- Why this change. Link the issue if there is one. If the change touches the spec, cite the proposal section. -->

## Scope

- [ ] Spec (`spec/`)
- [ ] Docs (`docs/`)
- [ ] Examples (`examples/`)
- [ ] TS package(s): <!-- name them -->
- [ ] Native package(s): <!-- swift / kotlin / dart -->
- [ ] Tooling (`tools/`, `.github/`, configs)

## Checklist

- [ ] Tests added or updated (or N/A — explain).
- [ ] `pnpm run check` passes locally.
- [ ] `pnpm run typecheck` passes locally.
- [ ] If this changes a public API in a package, I ran `pnpm changeset`.
- [ ] If this changes the spec, I bumped the relevant version and noted the change in `CHANGELOG.md`.
- [ ] If this changes Mosaic or the IR, I described the migration in the PR body.

## Out of scope

<!-- Anything intentionally left out. Helps a reviewer not ask for it. -->
