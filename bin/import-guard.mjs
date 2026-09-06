// The import guard: a doctor is a single self-contained file. Every module
// it tries to reach — node builtins, helper files beside it, npm packages
// in the target's node_modules — routes through this resolve hook and is
// refused. Static, dynamic, and computed imports all land here, because
// this is the mechanism Node itself uses to resolve them.
//
// This file is deliberately hand-maintained in bin/ (the one exception to
// the tsc build): a resolve hook must be standalone — zero imports — or it
// could not load to guard anything. Everything else in the trusted base
// compiles from src/.
//
// The allow rule is role-based, not location-based: only the loader module
// itself may resolve things here (it imports exactly two modules after
// registration — the doctor program and its fixtures), plus the guard's
// own initial load. Everything else — a doctor's imports, anonymous imports
// from Function-constructor scripts — is refused with a contract error the
// author sees at verify time.

const LOADER_URL = new URL("./doctor-loader.mjs", import.meta.url).href;

export function resolve(specifier, context, nextResolve) {
  const message = `any-doctor: a doctor is a single self-contained file — import of "${specifier}" is refused (everything reaches you through ctx)`;
  if (specifier === import.meta.url) return nextResolve(specifier, context);
  if (specifier.startsWith("node:")) {
    throw new Error(message);
  }
  if ((context.parentURL ?? "") === LOADER_URL) {
    return nextResolve(specifier, context);
  }
  throw new Error(message);
}
