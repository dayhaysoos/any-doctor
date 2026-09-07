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
    expected: [{ file: "src/user.ts", line: 4 }],
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
    expected: [{ file: "src/frame.ts", line: 3 }],
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
    expected: [{ file: "src/name.ts", line: 3 }],
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
    expected: [{ file: "src/user.ts", line: 3 }],
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
    expected: [{ file: "src/errors.ts", line: 3 }],
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
    expected: [{ file: "src/errors.ts", line: 3 }],
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
    expected: [{ file: "src/user.ts", line: 5 }],
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
    expected: [{ file: "src/config.ts", line: 4 }],
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
    expected: [{ file: "src/user.ts", line: 3 }],
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
    expected: [{ file: "src/user.test.ts", line: 4 }],
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
    expected: [{ file: "src/layers.ts", line: 3 }],
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
];
