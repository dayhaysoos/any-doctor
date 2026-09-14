# any-doctor metrics

Anonymous run counters. The CLI sends one POST per run:

```json
{ "v": "0.1.2", "doctors": ["async", "convex"], "custom": 1 }
```

That is the entire payload — bundled doctor ids (public, they ship in
the package) plus a count of custom doctors. No code, no file paths, no
findings, no reasons, no identifiers. Users disable it with
`ANY_DOCTOR_NO_TELEMETRY=1`; the payload contract is published in the
docs.

## Deploy

1. `npm i -g wrangler` (if needed), then `wrangler login`
2. `wrangler d1 create any-doctor-metrics` — paste the `database_id`
   into `wrangler.jsonc`
3. `wrangler d1 execute any-doctor-metrics --file schema.sql --remote`
4. `wrangler deploy`
5. Point `metrics.anydoctor.dev` at the worker (Cloudflare dashboard →
   Workers Routes, or add a custom domain on the worker), matching the
   CLI's endpoint in `src/telemetry.ts`.

## Reading the counts

```bash
wrangler d1 execute any-doctor-metrics --remote \
  --command "SELECT day, key, SUM(n) FROM counts GROUP BY day, key ORDER BY day DESC"
```
