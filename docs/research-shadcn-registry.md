# shadcn/ui Registry — Protocol Research

Evaluated as a distribution model for any-doctor "doctors" (single self-contained .mjs programs). All claims cite primary sources: official docs, the published JSON schemas, and the CLI source on GitHub.

## 1. What it is
- "A distribution system for code" — the CLI copies files into your project (no npm package is left installed for the component code itself); docs explicitly say the system "works with any project type and any framework, and is not limited to React." [https://ui.shadcn.com/docs/registry]
- Project config lives in `components.json` (aliases, style, tailwind, and a `registries` map for third-party registries). [https://ui.shadcn.com/docs/registry/namespace]

## 2. The schemas
registry-item.json (one item) — canonical schema at [https://ui.shadcn.com/schema/registry-item.json], field docs at [https://ui.shadcn.com/docs/registry/registry-item-json]:
- `name`, `type` (both required), `title`, `description`, `author` ("username <url>" format).
- `dependencies` / `devDependencies`: npm packages, pin via `name@version` (e.g. `zod@^3.20.0`). There is **no `peerDependencies` field** — absent from the schema and the field docs (verified by grep of the schema JSON).
- `registryDependencies`: array of item *addresses* — bare name (`button`, builtin shadcn), `@namespace/item`, GitHub `owner/repo/item`, full URL, or `./local.json`; refs are not inherited, each dep must pin its own `#tag`/SHA. [https://ui.shadcn.com/docs/registry/registry-item-json]
- `files[]`: each `{ path, content?, type, target? }`. `target` is **required** for `registry:file` and `registry:page` (schema `if/then`). `target` supports `~/` (project root) and alias placeholders `@components/ @ui/ @lib/ @hooks/`. No `files[].url` exists — delivery is inline `content` only (schema + runtime skip `if (!file.content) continue` in [https://raw.githubusercontent.com/shadcn-ui/ui/main/packages/shadcn/src/utils/updaters/update-files.ts]).
- `type` enum (12 public values): `registry:lib`, `registry:block`, `registry:component`, `registry:ui`, `registry:hook`, `registry:theme`, `registry:page`, `registry:file`, `registry:style`, `registry:base`, `registry:font`, `registry:item` (plus internal-only `registry:example`, `registry:internal` in [https://raw.githubusercontent.com/shadcn-ui/ui/main/packages/shadcn/src/registry/schema.ts]). `registry:item` = "universal registry items". [https://ui.shadcn.com/docs/registry/registry-item-json]
- React-ish extras: `tailwind` (deprecated for v4), `cssVars`, `css` (merged into project CSS), `envVars` (merged into `.env`/`.env.local`, never overwrites existing keys, docs warn never to ship secrets), `docs` (string shown at install), `categories`, `meta` (arbitrary k/v), `font` (required for `registry:font`). [https://ui.shadcn.com/docs/registry/registry-item-json]

registry.json (catalog) — schema at [https://ui.shadcn.com/schema/registry.json]:
- `{ name, homepage, items: [registry-item...] }` or `{ name, homepage, include: ["paths/to/registry.json"] }` (schema requires `items` or `include`). `include` chunks may omit name/homepage; paths are relative to the declaring file. [https://ui.shadcn.com/docs/registry/getting-started]
- Optional `pagination` block for registries implementing server-side dynamic search. [https://ui.shadcn.com/schema/registry.json]

## 3. How `shadcn add` resolves an address
Resolution order (from `resolveItemAddress`, [https://raw.githubusercontent.com/shadcn-ui/ui/main/packages/shadcn/src/registry/address.ts]):
1. URL (`http…` or anything ending in `.json`) → fetch that JSON directly, e.g. `npx shadcn add https://example.com/r/editor.json`. [https://ui.shadcn.com/docs/registry/namespace]
2. Local file path → install from disk. `add` accepts "components name, url or local path". [https://ui.shadcn.com/docs/cli]
3. `@namespace/item` → looked up in `components.json` `registries` map, template must contain `{name}` (`{style}` optional); namespace regex `^(@[a-zA-Z0-9](?:[a-zA-Z0-9-_]*[a-zA-Z0-9])?)\/(.+)$`. [https://ui.shadcn.com/docs/registry/namespace]
4. `owner/repo/item[#ref]` (>=3 segments) → GitHub repo-as-registry: reads root `registry.json` (raw anonymous reads for public repos; Contents API + `gh` credentials for private, pinned to commit SHA; tokens only sent to api.github.com). No ref = default branch. [https://ui.shadcn.com/docs/registry/github]
5. Bare name → built-in `@shadcn` registry: `"@shadcn": "${REGISTRY_URL}/styles/{style}/{name}.json"` where `REGISTRY_URL = process.env.REGISTRY_URL ?? "https://ui.shadcn.com/r"` (env override), fallback style `new-york-v4`. [https://raw.githubusercontent.com/shadcn-ui/ui/main/packages/shadcn/src/registry/constants.ts]
- No `--registry` flag on `add`; instead `shadcn registry add @acme=https://…/{name}.json` persists a namespace, or edit `components.json`: `"registries": { "@acme": "https://registry.acme.com/r/{name}.json" }` (object form adds `headers`/`params` with `${ENV_VAR}` expansion for auth). [https://ui.shadcn.com/docs/registry/getting-started, https://ui.shadcn.com/docs/registry/namespace]
- Registry config zod: string template or `{ url, params?, headers? }`, url must include `{name}`, keys must start with `@`. [https://raw.githubusercontent.com/shadcn-ui/ui/main/packages/shadcn/src/registry/schema.ts]
- After fetch: validate against the item schema, then recursively resolve `registryDependencies` — topological order, files deduped by target ("last one wins"), `tailwind/cssVars/css/envVars` deep-merged across items, circular deps detected. [https://ui.shadcn.com/docs/registry/namespace]
- `add` flags: `-y/--yes`, `-o/--overwrite`, `-a/--all`, `-p/--path`, `-s/--silent`, `--dry-run`, `--diff`, `--view`. [https://ui.shadcn.com/docs/cli]
- Unknown `@ns` on add/search triggers auto-registration from the open-source registry index served at https://ui.shadcn.com/r/registries.json. [https://ui.shadcn.com/docs/registry/registry-index]

## 4. File delivery and transforms
- Inline only: served JSON carries file `content` as strings; `shadcn build` generates payload JSON (default output `public/r`, e.g. `public/r/button.json`; `--output` override) with content inlined from source `path`s. Dynamic hosts can skip the build via `loadRegistry()` / `loadRegistryItem(name)` from the `shadcn` npm package, which resolve `include` on the fly. [https://ui.shadcn.com/docs/registry/getting-started]
- Arbitrary types: yes, via `registry:file`/`registry:page` (with explicit `target`) — and the runtime **skips all transforms** for `.env` files and `registry:file`/`registry:item` files, "to preserve their original content as they're meant to be framework-agnostic". Everything else (ui/hook/component/lib/block/theme/style) is run through ts-morph (`ScriptKind.TSX`) with React/Tailwind transformers: `transformImport, transformRsc, transformCssVars, transformTwPrefixes, transformIcons, transformMenu, transformAsChild, transformRtl, transformFont, transformCleanup` — import-alias rewriting (needs tsconfig paths), RSC `"use client"` handling, Tailwind prefix/CSS-var rewriting, icon library swapping. [https://raw.githubusercontent.com/shadcn-ui/ui/main/packages/shadcn/src/utils/updaters/update-files.ts, https://raw.githubusercontent.com/shadcn-ui/ui/main/packages/shadcn/src/utils/transformers/index.ts]
- Default install dirs by file type: `registry:ui`→ui dir, `registry:lib`→lib, `registry:block|component`→components, `registry:hook`→hooks; explicit `target` overrides; `tsx: false` config rewrites `.tsx→.jsx`, `.ts→.js`. [https://raw.githubusercontent.com/shadcn-ui/ui/main/packages/shadcn/src/utils/updaters/update-files.ts]
- GitHub source files capped at 5 MiB; symlinks discouraged. [https://ui.shadcn.com/docs/registry/github]

## 5. Third-party hosting
- Any host serving JSON over HTTP works (Next.js, Vercel, PHP, etc.); conventions: catalog at `/r/registry.json`, items at `/r/{name}.json`. [https://ui.shadcn.com/docs/registry/getting-started]
- Zero-server option: a GitHub repo with root `registry.json`; `shadcn add owner/repo/item` — no static hosting or published JSON needed. [https://ui.shadcn.com/docs/registry/github]
- Real independent registries (from the official index, [https://ui.shadcn.com/r/registries.json]): `@23rd` → `https://23rd.dev/r/{name}.json` ("Opinionated components for shippers"); `@8bitcn` → `https://www.8bitcn.com/r/{name}.json` (retro 8-bit components). Index entries carry a `health` block (uptime, score) monitored by shadcn. [https://ui.shadcn.com/docs/registry/registry-index]
- Submitting to the index = PR adding your namespace to `apps/v4/registry/directory.json` in shadcn-ui/ui; requirements: open source, valid schema, flat registry, and index entries must NOT inline `files[].content`. [https://ui.shadcn.com/docs/registry/registry-index]

## 6. Versioning, caching, updates
- No lockfile, no manifest of installed items, no versions field in the item schema. The only cache is an in-process `Map<url, Promise>` (per CLI run); no disk cache or etag handling. [https://raw.githubusercontent.com/shadcn-ui/ui/main/packages/shadcn/src/registry/fetcher.ts]
- Pinning = ref suffix on GitHub addresses: `acme/ui/button#v1.2.0` or full 40-char SHA (recommended for published install commands); SHAs skip `git ls-remote`. Refs do not propagate to registryDependencies. [https://ui.shadcn.com/docs/registry/github, https://ui.shadcn.com/docs/registry/faq]
- Update = re-run `add`. Identical content → auto-skipped; differing content → interactive overwrite prompt (default No), or force with `--overwrite`/`-y`; non-interactive + no flag → skip. `.env` files are merged (new keys only), never overwritten. [https://raw.githubusercontent.com/shadcn-ui/ui/main/packages/shadcn/src/utils/updaters/update-files.ts]

## 7. What would NOT transfer to plain .mjs doctors
- The transform pipeline (import alias rewrite via tsconfig, RSC, Tailwind prefix/CSS vars, icon swap) assumes TS/TSX React — irrelevant or harmful for .mjs; but the schema already provides the escape hatch we'd use: `registry:file`/`registry:item` + explicit `target` skip all transforms. [https://raw.githubusercontent.com/shadcn-ui/ui/main/packages/shadcn/src/utils/updaters/update-files.ts]
- `components.json` is React/Tailwind-shaped: `style`, `rsc`, `tsx`, `tailwind.*`, `iconLibrary`, `aliases.{components,ui,lib,hooks,utils}` — an any-doctor config would need only a `registries` map plus a doctors install dir. [https://raw.githubusercontent.com/shadcn-ui/ui/main/packages/shadcn/src/registry/schema.ts]
- Type enum, default target dirs, `tsx:false` extension rewriting, and the `tailwind/cssVars/css/font` merge machinery are all component-flavored; the docs' own "universal" story (`registry:item`) is the protocol's framework-agnostic core. [https://ui.shadcn.com/docs/registry/registry-item-json]
- What DOES transfer cleanly: address model (url / @namespace / owner-repo / bare name), `{name}` URL templates, inline-content JSON items, recursive `registryDependencies` with dedupe/merge, GitHub-as-registry with SHA pinning, and the static `/r/{name}.json` + index conventions. [https://ui.shadcn.com/docs/registry/getting-started, https://ui.shadcn.com/docs/registry/github, https://ui.shadcn.com/docs/registry/namespace]

## Sources
- Docs: https://ui.shadcn.com/docs/registry · /docs/cli · /docs/registry/getting-started · /docs/registry/registry-item-json · /docs/registry/registry-json (schema page) · /docs/registry/namespace · /docs/registry/github · /docs/registry/faq · /docs/registry/registry-index
- Schemas: https://ui.shadcn.com/schema/registry-item.json · https://ui.shadcn.com/schema/registry.json · index: https://ui.shadcn.com/r/registries.json
- CLI source (main): packages/shadcn/src/registry/{constants,address,schema,fetcher}.ts · src/utils/updaters/update-files.ts · src/utils/transformers/index.ts under https://github.com/shadcn-ui/ui
