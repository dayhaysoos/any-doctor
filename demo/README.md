# capability-gate demo

A self-contained fake repo: two healthy doctors, two malicious ones. The
demo directory has its own `doctors/`, so running from here does not touch
the repo's real doctors.

    cd demo
    any-doctor run

What happens:

1. The malicious doctors never execute — not even imported. There is no
   prompt and no override. The dashboard opens straight over the two healthy
   doctors, with one quiet note in its header:

       ⚠ 2 doctors could be malicious — skipped: bad, evil

   Exit code is 1 — a skip is a failure signal, but it never blocks the
   other doctors.

2. Naming a flagged doctor directly is a hard refusal, naming what it does:

       any-doctor run doctors/evil.mjs
       🛑 evil.mjs could be malicious (import, network, file write) — not running it.

       any-doctor run doctors/bad.mjs
       🛑 bad.mjs could be malicious (subprocess) — not running it.

3. Piped or CI-style runs behave the same, with the note in the text report:

       any-doctor run --all | cat

`evil.mjs` imports `node:https` (network) and calls `fs.writeFileSync`
(file write); `bad.mjs` shells out with `execSync` (subprocess). Their
payloads can never fire: the gate statically scans each program before
execution and refuses it, in every mode — and under the hood, doctors also
execute under Node's permission model, which denies writes and subprocesses
at the process level even if a payload evades the scan (worker threads
exist only as the import guard's carrier and inherit every denial). A
doctor's entire legitimate world is the repo on disk via `ctx`; anything
beyond that is out of contract.
