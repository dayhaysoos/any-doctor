# CONTEXT.md — domain glossary

Canonical vocabulary for any-doctor. Glossary only — no implementation.
When a term here conflicts with language elsewhere, this file wins.

## Doctor program

The artifact an LLM writes: a JavaScript module that inspects a target
codebase through the DoctorCtx and emits findings. One doctor program
encodes one convention the team cares about. Retired synonym: "lint rule."

## Doctor run

One execution of a doctor program against one target directory.
Deterministic for a given engine version: `ctx.search` shells out to the
locally installed ast-grep, so results can vary across engine upgrades.

## Finding

One emitted issue: a location (file, line) plus optional per-finding
message or severity override. The doctor-level truth (id, description,
default severity, blind spots) lives in the program's meta, not in
individual findings.

## Doctor contract

The interface shared by doctor programs, the runner, the report, the
fixture harness, and the generator prompt. The single place where the
shape of ctx, meta, findings, and the runner protocol is defined.

## DoctorCtx (ctx)

The capability boundary a doctor program is expected to use: read-only,
repo-scoped file access, structural search, and a finding emitter.
Honoring this boundary is a contract expectation enforced by review today;
the runner seam is where a technical sandbox will enforce it.

## Meta

A doctor program's declared data: id, description, default severity,
blind spots. Authored as data, never as comments; read by the report and
the generator prompt.

## Seed

A set of inline files (paths + contents) a fixture materializes into a
temporary directory so a doctor program can be exercised against
known input.

## Fixture

One seed plus the findings expected from running a doctor program against
it. Expected findings match exactly on (file, line): a missing expected
finding is a recall failure; an unexpected finding is a precision failure.

## Verify

Running a doctor program against its fixtures and diffing the findings.
The trust gate: a doctor program is not considered working until verify
passes.

## Runner

The process boundary that loads a doctor program, injects ctx, and
returns framed results. Today a local node child process; the same
contract must hold for any future sandbox.
