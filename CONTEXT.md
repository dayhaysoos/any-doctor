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

## Check

One rule within a doctor program. A finding names its check via `rule`;
the check's meta supplies description, severity, impact, why, and fix;
the doctor's meta supplies the defaults when a finding names no check.
One doctor program, many checks.

## Doctor contract

The interface shared by doctor programs, the runner, the report, the
fixture harness, and the generator prompt. The single place where the
shape of ctx, meta, findings, and the runner protocol is defined.

## DoctorCtx (ctx)

The capability boundary a doctor program is expected to use: read-only,
repo-scoped file access, structural search, and a finding emitter.
Honoring this boundary is a contract expectation enforced by review today;
the runner seam is where a technical sandbox will enforce it.

## Engine

The structural-search backend a DoctorCtx uses to answer ctx.search.
ast-grep is the engine today; oxc is a candidate for TypeScript-heavy
repos. Engine selection is invisible to doctor programs: one doctor
program runs unchanged on any engine.

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

## Registry

The record of installed doctor programs per scope. Each doctor's meta is
its registry entry; a thin index.json cache per scope records creation
metadata (slug, intent, date). The index is a cache — discovery works
from the directory alone if the index is missing.

## Scope

Where a doctor program lives: repo-local (`./doctors/`, committed with
the consuming repo) or user-global (`~/.any-doctor/doctors/`, available
in every repo). Repo-local wins slug collisions. Scanning a target repo
never writes to any scope.

## Skill

The instructions any-doctor provides so an agent can create a doctor that
fits the contract. Planted as `AGENTS.md` in a scope directory and also
served verbatim by `generate`. Any Doctor equips agents with the skill;
it never launches, deploys, or speaks for an agent.
