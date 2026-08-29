# Planned features — doctor discovery & registry

Status: DESIGNED, NOT BUILT. This file is the build spec. Any session
implementing these features should follow it and, where reality forces
deviations, update this file in the same commit.

Source: Nick's direction (2026-08-29) — "when someone types any-doctor
verify or any-doctor run without specifying which doctor, there should be
a select for it, searchable with fuzzy search; and doctors that get
created should be automatically stored somewhere — its own little doctors
directory that doesn't interfere."

## F1 — No-argument interactive selection

When `run` or `verify` is invoked WITHOUT a doctor path:

- **TTY session:** show a fuzzy-searchable picker. Type to filter,
  ↑↓ to move, enter to select, esc/q to cancel. Picker lists every
  discovered doctor with its meta: id, one-line description, severity.
  On select: proceed exactly as if the path had been typed
  (`verify` → fixture gate; `run` → report + findings browser).
- **Non-TTY (piped/CI):** never prompt. Print the discovered doctor list
  and exit non-zero with a clear "specify a doctor" message.
- Precedence for discovery: `./doctors/` (repo-local) first, then the
  user registry (F2), each entry labeled with its origin.

## F2 — Doctor registry & auto-save

Any doctor created by `generate` is automatically **saved** — registered
so the picker in F1 can find it later. Two scopes, no mixing:

- **Repo-local:** `./doctors/` — already the format. A doctor lives next
  to its fixtures; committing both to the consuming repo is encouraged.
- **User-global:** `~/.any-doctor/doctors/` — for doctors a user wants
  available in every repo. `generate --global` writes here; a doctor
  here is usable from any directory.

Registration data lives beside the doctor (its `meta` is the registry
entry — id, description, severity, blindSpots), plus a thin index at
`<scope>/index.json` (auto-maintained by generate/verify: slug, intent
that created it, created date, protocol version). The index is a cache;
the picker must work from scanning the directory alone if the index is
missing or stale.

**Non-interference rule:** discovery and registry reads never write to
the target repo being scanned. `run` reads doctors and code; it writes
nothing anywhere. `verify` writes only to its own temp sandbox.

## F3 — Related (noted, not designed)

- `run --all` — execute every discovered doctor, one combined report.
- `verify --all` — fixture-gate every discovered doctor; exit non-zero
  if any fails.
- Registry collision policy: same slug in both scopes → repo-local wins,
  picker shows the origin suffix.
- Sharing/publishing doctor packs — out of scope until F1/F2 exist.

## Implementation notes

- Fuzzy matching must be a small zero-dep scorer (subsequence match,
  prefer consecutive runs and word starts — same spirit as React
  Doctor's fuzzy-match.ts, which predates this spec).
- The picker is raw-mode like the findings browser; frame-builder stays
  pure and golden-testable, per the architecture review.
- New glossary terms go into CONTEXT.md when these land: "registry",
  "scope" (repo-local vs user-global).
