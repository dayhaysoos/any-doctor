# Finding lifecycle: milestones and handoff

Status: M1 and M2 shipped; M3 and M4 are planned. Read
[proposal](proposal.md) and [design](design.md) before implementing a remaining
slice. This is a scope/evidence map, not authorization to execute every milestone
or publish a version.

## Delivered: M1 — identity and comparable Git-base scans

M1 delivered A1+A2 from the
[analysis improvements plan](../analysis-improvements.md): source-bound evidence,
versioned host identity and movement-aware comparison in the existing `--base`
workflow. Exact fixture verification remains location-strict.

The implementation surfaces content-only fallback, ambiguity, stale evidence,
line-scoped evidence and unavailable context. It preserves namespace separation,
literal meaning, source/doctor provenance and linear duplicate matching. D30 and
its repair amendment record the accepted contract and residual limitations.

M1 did not add persistent state, arbitrary rename tracking, a general call graph,
type checking or a whole-program value engine.

## Delivered: M2 — remember one local decision end to end

M2 delivered accepted and not-applicable decisions with required reasons,
reversal and reassessment. The dashboard, report, JSON and agent interface derive
from one review view. Active lists hide applicable decisions; raw findings remain
inspectable and gates continue to judge raw findings.

State is created lazily at `<target>/.any-doctor/decisions.local.json` and written
by atomic replacement. This deliberately replaced the proposed SQLite delivery:
decision-only volume did not justify a database or native-binding matrix. D31
records the choice, concurrency limitations, shell-safe keys, provenance rules and
repair evidence.

M2 did not add project scope, cross-machine history, automatic fixing, telemetry
or autonomous authority to dismiss findings.

## Next: M3 — share and reconcile project decisions

**Deliver:** reviewable Git-tracked project records that a fresh checkout and
read-only CI can apply without private local state. Local decisions remain explicit
and private. A checked-out branch's records are authoritative; deletion and
reversal must not resurrect records from another branch or cache.

**Acceptance:**

- Two equivalent checkouts apply identical project decisions despite different
  private histories.
- Independent records merge predictably; semantically conflicting records fail
  closed even if Git merges their text.
- Branch switches, worktrees, dirty records, deletion/reversal, doctor revision
  changes and malformed state are visible and conservative.
- A crash during a project-record write cannot destroy unrelated decisions.
- Fresh read-only CI applies project records without an init step or writable
  project database.
- Raw, active and reviewed counts remain distinct; an accepted finding is never
  labeled fixed.

**Resolve in M3:** record partitioning and serialization, doctor namespace and
rename identity, project decision authority, CI suppression semantics, score
presentation and local/project precedence.

**Exclude:** database replication, hosted accounts, synchronized personal history,
issue tracking and automatic code modification.

## Later: M4 — bounded history and comparable rescans

**Deliver:** first/last observations, new/continuing/no-longer-detected/reappeared
views, and claimed-fix records with explicit rescan evidence. Add retention,
storage limits, summaries and bounded query/export behavior.

M4 is the point to select and validate an indexed local store such as SQLite.
History volume, query needs and the supported Node/platform matrix must justify
the dependency; M2's flat decision file remains authoritative until superseded by
an accepted migration.

**Acceptance:** a comparable complete scan can establish absence; omitted files,
disabled rules, degraded analysis, changed detector meaning and aborted runs
cannot. Retention preserves durable decisions and current state, labels expired
detail, and never turns incomplete coverage into a clean result.

**Exclude:** claims that disappearance proves a bug was fixed, hosted analytics
and issue tracking.

## Completion evidence for each remaining milestone

- Bind the delivered scope and update accepted choices in the design and decision
  log.
- Reproduce motivating cases and test correctness, recovery, conflicts and scale.
- Review the exact candidate against repository standards and the milestone spec.
- Run focused and full tests, all-doctor verification and capability-gap stakes.
- Build and pack; exercise the installed artifact on a clean consumer and a
  representative real repository without modifying the target.
- Record source/tool revisions, working-tree state, outcomes, limitations and
  measured resource costs.
- Update feature availability, glossary terms and [HANDOFF](../../HANDOFF.md).

Publication and version changes are separate maintainer decisions.
