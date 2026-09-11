# any-doctor — agent usage

You are running any-doctor, a deterministic code scanner. This is your
interface. Humans get an interactive dashboard; you get JSON and CLI
verbs. Never parse the human report or the dashboard.

## Scan

```bash
npx any-doctor@latest run --all <dir> --format json
```

One JSON object on stdout (diagnostics on stderr — ignore stderr unless
the exit code is nonzero). Every finding carries:

- `file`, `line`, `column`, `severity`, `message`
- `decisionKey` — the finding's stable identity; use it to record decisions
- `decision` — present only when a decision already applies to it

Exit codes: crashes and skipped doctors fail ALWAYS. `--fail-on
error|warning|info` sets a bar over RAW findings — recorded decisions
never flip a gate, so dismissing findings cannot fake a clean run.

## The workflow

1. **Scan** (above). Read the findings.
2. **Investigate** each one: read the cited code, the check's `impact`,
   `why`, and `fix` fields in the JSON.
3. **Act** — one of:
   - The finding is real → fix the code.
   - It is intentional or misread for this code → record a decision (below).
   - Unclear → leave it and report it to the human.
4. **Verify** by rescanning; confirm your fix removed it or your decision
   hides it.

Do not record decisions merely to produce a clean report. Deciding is
delegated authority: only do it when the human's task or the project's
instructions grant it. Otherwise report the findings and let the human
decide.

## Recording decisions

```bash
npx any-doctor@latest decide --key <decisionKey> --accepted --reason "<why>"
npx any-doctor@latest decide --key <decisionKey> --not-applicable --reason "<why>"
```

- `--accepted`: the concern is real but the code is intentional.
- `--not-applicable`: the check's interpretation is wrong for this code.
- `--reason` is required and must be specific enough for a human to
  evaluate later. Vague reasons are rejections of the tool, not decisions.

A decision attaches to the finding's identity — code moving around keeps
it applied; the flagged code changing, the doctor's meaning changing, or
duplicate identical occurrences resurface it for reassessment. Decisions
are reversible:

```bash
npx any-doctor@latest decisions <dir> --json     # inspect state
npx any-doctor@latest decisions <dir> --reverse <key>
```

## Diff against a base

```bash
npx any-doctor@latest run --all <dir> --format json --base main
```

The `diff` block reports `added`, `continuing`, `noLongerDetected` —
judged against the merge base, not the branch tip. Only added findings
gate.

## Reporting back to the human

Summarize: total findings by severity, what you fixed, what you decided
(with reasons), what you left uncertain. Link each item to
`file:line`. If the scan crashed or skipped doctors, report that first —
partial results are not a clean bill.
