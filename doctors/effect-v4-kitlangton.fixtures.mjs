export const fixtures = [
  // --- type-silencing-cast ---
  {
    name: "type-silencing-cast: flags `as any` in an effect file",
    seed: {
      "src/user.ts": [
        'import { Effect } from "effect";',
        "",
        "export const load = Effect.gen(function* () {",
        "  const user = (yield* findUser(1)) as any;",
        "  return user.name;",
        "});",
      ].join("\n"),
    },
    expected: [{ rule: "type-silencing-cast", file: "src/user.ts", line: 4 }],
  },
  {
    name: "type-silencing-cast: flags a double cast in an effect file",
    seed: {
      "src/frame.ts": [
        'import { Effect } from "effect";',
        "",
        "export const frame = parseResult(raw) as unknown as RunResult;",
      ].join("\n"),
    },
    expected: [{ rule: "type-silencing-cast", file: "src/frame.ts", line: 3 }],
  },
  {
    name: "type-silencing-cast: flags a non-null assertion in an effect file",
    seed: {
      "src/name.ts": [
        'import { Effect } from "effect";',
        "",
        "export const userName = user!.name;",
      ].join("\n"),
    },
    expected: [{ rule: "type-silencing-cast", file: "src/name.ts", line: 3 }],
  },
  {
    name: "type-silencing-cast: accepts `as any` in a file that is not Effect code (scope gate)",
    seed: {
      "src/hooks.ts": [
        'import { useEffect } from "react";',
        "",
        "export function useUser(user: { name: string } | null) {",
        "  useEffect(() => {",
        "    const name = (user as any)?.name;",
        "    return name;",
        "  }, [user]);",
        "}",
      ].join("\n"),
    },
    expected: [],
  },

  // --- schema-class-as-default ---
  {
    name: "schema-class-as-default: flags Schema.Class for app data modeling",
    seed: {
      "src/user.ts": [
        'import { Schema } from "effect";',
        "",
        'export class User extends Schema.Class<User>("User")({',
        "  id: Schema.String,",
        "}) {}",
      ].join("\n"),
    },
    expected: [{ rule: "schema-class-as-default", file: "src/user.ts", line: 3 }],
  },
  {
    name: "schema-class-as-default: accepts Schema.Struct as the record model",
    seed: {
      "src/user.ts": [
        'import { Schema } from "effect";',
        "",
        "export const User = Schema.Struct({",
        "  id: Schema.String,",
        "});",
      ].join("\n"),
    },
    expected: [],
  },

  // --- handrolled-tagged-error ---
  {
    name: "handrolled-tagged-error: flags a class extending Error with its own _tag",
    seed: {
      "src/errors.ts": [
        'import { Effect } from "effect";',
        "",
        "export class UserNotFound extends Error {",
        '  readonly _tag = "UserNotFound";',
        "}",
      ].join("\n"),
    },
    expected: [{ rule: "handrolled-tagged-error", file: "src/errors.ts", line: 3 }],
  },
  {
    name: "handrolled-tagged-error: flags the Data.TaggedError class builder",
    seed: {
      "src/errors.ts": [
        'import { Data } from "effect";',
        "",
        'export class UserNotFound extends Data.TaggedError("UserNotFound")<{',
        "  userId: string;",
        "}> {}",
      ].join("\n"),
    },
    expected: [{ rule: "handrolled-tagged-error", file: "src/errors.ts", line: 3 }],
  },
  {
    name: "handrolled-tagged-error: accepts Schema.TaggedErrorClass",
    seed: {
      "src/errors.ts": [
        'import { Schema } from "effect";',
        "",
        "export class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()(",
        '  "UserNotFound",',
        "  { userId: Schema.String },",
        ") {}",
      ].join("\n"),
    },
    expected: [],
  },

  // --- cause-level-recovery ---
  {
    name: "cause-level-recovery: flags catchAllCause where typed recovery is the default",
    seed: {
      "src/user.ts": [
        'import { Effect } from "effect";',
        "",
        "export const load = Effect.gen(function* () {",
        "  return yield* findUser(1).pipe(",
        "    Effect.catchAllCause((cause) => Effect.succeed(null)),",
        "  );",
        "});",
      ].join("\n"),
    },
    expected: [{ rule: "cause-level-recovery", file: "src/user.ts", line: 5 }],
  },
  {
    name: "cause-level-recovery: accepts typed-error recovery",
    seed: {
      "src/user.ts": [
        'import { Effect } from "effect";',
        "",
        "export const load = Effect.gen(function* () {",
        "  return yield* findUser(1).pipe(",
        "    Effect.catchAll((error) => Effect.succeed(null)),",
        "  );",
        "});",
      ].join("\n"),
    },
    expected: [],
  },

  // --- direct-process-env-read ---
  {
    name: "direct-process-env-read: flags process.env inside application logic",
    seed: {
      "src/config.ts": [
        'import { Effect } from "effect";',
        "",
        "export const layer = Effect.gen(function* () {",
        "  const apiKey = process.env.API_KEY;",
        "  return { apiKey };",
        "});",
      ].join("\n"),
    },
    expected: [{ rule: "direct-process-env-read", file: "src/config.ts", line: 4 }],
  },
  {
    name: "direct-process-env-read: accepts Config as the read path",
    seed: {
      "src/config.ts": [
        'import { Config, Effect } from "effect";',
        "",
        "export const layer = Effect.gen(function* () {",
        '  const apiKey = yield* Config.redacted("API_KEY");',
        "  return { apiKey };",
        "});",
      ].join("\n"),
    },
    expected: [],
  },

  // --- unnamed-effect-fn ---
  {
    name: "unnamed-effect-fn: flags Effect.fn without a tracing name",
    seed: {
      "src/user.ts": [
        'import { Effect } from "effect";',
        "",
        "export const load = Effect.fn(function* (userId: string) {",
        "  return yield* findUser(userId);",
        "});",
      ].join("\n"),
    },
    expected: [{ rule: "unnamed-effect-fn", file: "src/user.ts", line: 3 }],
  },
  {
    name: "unnamed-effect-fn: accepts the named form",
    seed: {
      "src/user.ts": [
        'import { Effect } from "effect";',
        "",
        'export const load = Effect.fn("User.load")(function* (userId: string) {',
        "  return yield* findUser(userId);",
        "});",
      ].join("\n"),
    },
    expected: [],
  },

  // --- sleep-in-test ---
  {
    name: "sleep-in-test: flags Effect.sleep inside a test file",
    seed: {
      "src/user.test.ts": [
        'import { Effect } from "effect";',
        "",
        "export const waitForIdle = async () => {",
        "  await Effect.runPromise(Effect.sleep(1000));",
        "};",
      ].join("\n"),
    },
    expected: [{ rule: "sleep-in-test", file: "src/user.test.ts", line: 4 }],
  },
  {
    name: "sleep-in-test: flags case-variant test file names (Spec.Test.ts)",
    seed: {
      "src/Spec.Test.ts": [
        'import { Effect } from "effect";',
        "",
        "export const waitForIdle = async () => {",
        "  await Effect.runPromise(Effect.sleep(1000));",
        "};",
      ].join("\n"),
    },
    expected: [{ rule: "sleep-in-test", file: "src/Spec.Test.ts", line: 4 }],
  },
  {
    name: "sleep-in-test: exact-case-only directory (src/Test/) is not a test file",
    seed: {
      "src/Test/harness.ts": [
        'import { Effect } from "effect";',
        "",
        "export const waitForIdle = async () => {",
        "  await Effect.runPromise(Effect.sleep(1000));",
        "};",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "sleep-in-test: accepts deterministic synchronization",
    seed: {
      "src/wait.test.ts": [
        'import { Deferred, Effect } from "effect";',
        "",
        "export const waitForReady = Effect.gen(function* () {",
        "  const ready = yield* Deferred.make<void>();",
        "  return yield* Deferred.await(ready);",
        "});",
      ].join("\n"),
    },
    expected: [],
  },

  // --- blind-layer-merge ---
  {
    name: "blind-layer-merge: flags Layer.mergeAll as the composition tool",
    seed: {
      "src/layers.ts": [
        'import { Layer } from "effect";',
        "",
        "export const App = Layer.mergeAll(",
        "  ConfigLayer,",
        "  UserLayer,",
        "  StorageLayer,",
        ");",
      ].join("\n"),
    },
    expected: [{ rule: "blind-layer-merge", file: "src/layers.ts", line: 3 }],
  },
  {
    name: "blind-layer-merge: accepts a layer built from its dependencies",
    seed: {
      "src/layers.ts": [
        'import { Effect, Layer } from "effect";',
        "",
        "export const UserLayer = Layer.effect(",
        "  UserService,",
        "  Effect.gen(function* () {",
        "    return UserService.of({ load: () => Effect.succeed(null) });",
        "  }),",
        ");",
      ].join("\n"),
    },
    expected: [],
  },

  // --- date-now-in-gen ---
  {
    name: "date-now-in-gen: Date.now directly in an Effect.gen body is flagged",
    seed: {
      "src/direct.ts": [
        'import { Effect } from "effect";',
        "export const work = Effect.gen(function* () {",
        "  return Date.now();",
        "});",
      ].join("\n"),
    },
    expected: [{ rule: "date-now-in-gen", file: "src/direct.ts", line: 3 }],
  },
  {
    name: "date-now-in-gen: containment in a nested callback does not imply execution",
    seed: {
      "src/nested.ts": [
        'import { Effect } from "effect";',
        "export const work = Effect.gen(function* () {",
        "  return items.map(() => Date.now());",
        "});",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "date-now-in-gen: a string lookalike and bare Date.now outside generators stay silent",
    seed: {
      "src/outside.ts": [
        'import { Effect } from "effect";',
        "const label = \"Effect.gen(function* () { Date.now() })\";",
        "export const timestamp = Date.now();",
      ].join("\n"),
    },
    expected: [],
  },
  {
    name: "date-now-in-gen: a non-generator Effect.gen callback is not a span",
    seed: {
      "src/callback.ts": [
        'import { Effect } from "effect";',
        "export const work = Effect.gen(() => Date.now());",
      ].join("\n"),
    },
    expected: [],
  },

  // --- zod-single-record ---
  {
    name: "zod-single-record: a single value schema is flagged",
    seed: {
      "src/schema.ts": 'import { z } from "zod";\nconst labels = z.record(z.string());\n',
    },
    expected: [{ rule: "zod-single-record", file: "src/schema.ts", line: 2 }],
  },
  {
    name: "zod-single-record: a generic record with a multiline single argument is flagged",
    seed: {
      "src/schema.ts": 'import { z } from "zod";\nconst labels = z.record<string>(\n  z.number(),\n);\n',
    },
    expected: [{ rule: "zod-single-record", file: "src/schema.ts", line: 2 }],
  },
  {
    name: "zod-single-record: explicit key and value schemas are accepted",
    seed: {
      "src/schema.ts": 'import { z } from "zod";\nconst labels = z.record(z.string(), z.number());\n',
    },
    expected: [],
  },
  {
    name: "zod-single-record: static bracket access resolves to the same zod API",
    seed: {
      "src/schema.ts": 'import { z } from "zod";\nconst text = z.string();\nconst labels = z["record"](z.string());\n',
    },
    expected: [{ rule: "zod-single-record", file: "src/schema.ts", line: 3 }],
  },
];

fixtures.push(
  {
    name: "locations: two type-silencing casts in one Effect file",
    seed: { "src/casts.ts": 'import { Effect } from "effect";\nconst first = value as any;\nconst second = other!.name;\n' },
    expected: [2, 3].map((line) => ({ rule: "type-silencing-cast", file: "src/casts.ts", line })),
  },
  {
    name: "locations: two Schema class builders",
    seed: { "src/models.ts": 'import { Schema } from "effect";\nexport class A extends Schema.Class<A>("A")({}) {}\nexport class B extends Schema.TaggedClass<B>()("B", {}) {}\n' },
    expected: [2, 3].map((line) => ({ rule: "schema-class-as-default", file: "src/models.ts", line })),
  },
  {
    name: "locations: exact class spans preserve two hand-rolled tags",
    seed: { "src/errors.ts": 'import { Effect } from "effect";\nexport class A extends Error { readonly _tag = "A"; method() { return /[{}]/; } }\nexport class B extends Error { method() { return `{}`; } readonly _tag = "B"; }\n' },
    expected: [2, 3].map((line) => ({ rule: "handrolled-tagged-error", file: "src/errors.ts", line })),
  },
  {
    name: "locations: two cause-level recovery calls",
    seed: { "src/recovery.ts": 'import { Effect } from "effect";\nexport const a = Effect.catchCause(onCause);\nexport const b = Effect.sandbox(program);\n' },
    expected: [2, 3].map((line) => ({ rule: "cause-level-recovery", file: "src/recovery.ts", line })),
  },
  {
    name: "locations: two direct process environment reads",
    seed: { "src/config.ts": 'import { Effect } from "effect";\nexport const a = process.env.A;\nexport const b = process.env["B"];\n' },
    expected: [2, 3].map((line) => ({ rule: "direct-process-env-read", file: "src/config.ts", line })),
  },
  {
    name: "locations: two unnamed Effect functions",
    seed: { "src/functions.ts": 'import { Effect } from "effect";\nexport const a = Effect.fn(function* () {});\nexport const b = Effect.fn(() => Effect.void);\n' },
    expected: [2, 3].map((line) => ({ rule: "unnamed-effect-fn", file: "src/functions.ts", line })),
  },
  {
    name: "locations: two global clocks in one resolved generator",
    seed: { "src/clock.ts": 'import { Effect } from "effect";\nexport const work = Effect.gen(function* () {\n  const a = Date.now();\n  return Date.now() - a;\n});\n' },
    expected: [3, 4].map((line) => ({ rule: "date-now-in-gen", file: "src/clock.ts", line })),
  },
  {
    name: "locations: two single-argument zod records",
    seed: { "src/schema.ts": 'import { z } from "zod";\nexport const a = z.record(z.string());\nexport const b = z["record"](z.number());\n' },
    expected: [2, 3].map((line) => ({ rule: "zod-single-record", file: "src/schema.ts", line })),
  },
  {
    name: "locations: two sleeps in a test",
    seed: { "src/timing.test.ts": 'import { Effect } from "effect";\nexport const a = Effect.sleep(1);\nexport const b = Effect.sleep(2);\n' },
    expected: [2, 3].map((line) => ({ rule: "sleep-in-test", file: "src/timing.test.ts", line })),
  },
  {
    name: "locations: two blind layer merges",
    seed: { "src/layers.ts": 'import { Effect, Layer } from "effect";\nexport const a = Layer.mergeAll(A, B);\nexport const b = Effect.provideMerge(C);\n' },
    expected: [2, 3].map((line) => ({ rule: "blind-layer-merge", file: "src/layers.ts", line })),
  },
  {
    name: "shared identity follows Effect API aliases and multiline names",
    seed: { "src/aliases.ts": 'import { Effect as E, Schema as S } from "effect";\nconst recover = E.catchAllCause;\nexport const a = recover(onCause);\nexport class Model extends S.Class<Model>("Model")({}) {}\nexport const named = E.fn(\n  "Alias.named",\n)(function* () {});\n' },
    expected: [
      { rule: "cause-level-recovery", file: "src/aliases.ts", line: 3 },
      { rule: "schema-class-as-default", file: "src/aliases.ts", line: 4 },
    ],
  },
  {
    name: "shadowed API lookalikes stay silent",
    seed: { "src/lookalikes.ts": 'import { Effect as RealEffect } from "effect";\nexport function example(Effect, Schema, Data, Layer, Date, process) {\n  Effect.fn(work); Schema.Class("X"); Data.TaggedError("X"); Layer.mergeAll(a, b);\n  process.env.KEY;\n  return RealEffect.gen(function* () { return Date.now(); });\n}\n' },
    expected: [],
  },
  {
    name: "dynamic Effect names and generator factories narrow instead of becoming definite findings",
    seed: { "src/dynamic.ts": 'import { Effect } from "effect";\ndeclare const dynamicName: unknown;\nexport const named = Effect.fn(dynamicName)(function* () {});\nexport const generated = Effect.gen(makeGenerator());\n' },
    expected: [],
  },
  {
    name: "Data.TaggedError usage outside a class remains visible",
    seed: { "src/error-builder.ts": 'import { Data } from "effect";\nexport const makeError = Data.TaggedError("Failure");\n' },
    expected: [{ rule: "handrolled-tagged-error", file: "src/error-builder.ts", line: 2 }],
  },
  {
    name: "a nested class tag is not attributed to its outer Error class",
    seed: { "src/nested-error.ts": 'import { Effect } from "effect";\nclass Outer extends Error {\n  method() { return class Inner { readonly _tag = "Inner" } }\n}\nexport const use = Effect.succeed(Outer);\n' },
    expected: [],
  },
  {
    name: "analysis-off narrows every semantic Effect check to silence",
    analysis: "off",
    seed: { "src/degraded.ts": 'import { Effect } from "effect";\nexport const work = Effect.fn(function* () { return Date.now(); });\n' },
    expected: [],
  },
);
