# Handoff — unpublished repair after 0.0.7

The working tree repairs the audit of published commit
`62a91b6af2bdb3384235531476c1fcaaf6078233`. The package version remains 0.0.7;
the maintainer will choose the next version and publish.

Read D28 and [doctor reliability](doctor-reliability.md). Shared call facts now
support narrow Convex direct-discard, query clock, transaction duration, and
linked-query checks. Generic subscription and mutation nondeterminism warnings
are removed. Locations carry optional columns through matching and reports.

All Convex checks declare their reporting units. Certification requires explicit
per-check witnesses, replacing the automatic duplicate-source rewrite. Other
bundled doctors remain compatible but undeclared location coverage is visibly
not exercised; do not describe it as certified. The authoring skill now requires
new checks to declare their unit and evidence policy.

Remaining work is deliberate: split-statement query builders, custom handler
wrappers, and interprocedural promise consumption are outside the repaired rules'
claims. Older presence/validator/context checks retain their declared syntactic
limits. Future expansion requires independent positive and negative examples.

The release audit records local tests and packed-artifact Sift results. These are
prepublication evidence, not an npm publication or a claim of universal precision.
