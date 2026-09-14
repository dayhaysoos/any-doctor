# Independent retest

Retained artifact:

`/private/tmp/any-doctor-sdk-completion-final2/package/any-doctor-0.1.2.tgz`

Expected SHA-256:

`77e8ceb547eef291be3cdede63ca9874c12dc5aac8009bb74351784e53133982`

From the repository at source commit `01175319105915b93287622173330643165e8870`:

```sh
npm test
node bin/cli.js verify --all
node bin/cli.js verify doctors/async.mjs --format json
node bin/cli.js run doctors/async.mjs /tmp/any-doctor-frozen-sift --format json
```

Use `dev/doctor-sdk/run-checkpoint.mjs` with a fresh output directory to repeat
the unchanged 55-case, two-location, 20-case, unavailable-analysis, frozen-Sift,
pack and clean-consumer gates. Use `dev/doctor-sdk/run-profile-mutations.mjs`
with another fresh output directory for the three mutation proofs.

Repack with:

```sh
npm pack --ignore-scripts --pack-destination /absolute/fresh/output
shasum -a 256 /absolute/fresh/output/any-doctor-0.1.2.tgz
```

The package manifest must contain `docs/doctor-sdk.md` and no path under
`docs/evidence/` or `docs/plans/`.
