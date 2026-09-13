import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";
import { analyzeSyntax, Node } from "./analysis.js";
import { children } from "./function-structure.js";
import {
  inventory,
  readAnalysisConfig,
  matchesPath,
  FileInventory,
  FileRole,
} from "./file-scope.js";

export interface ConsumerEvidence {
  kind:
    | "import"
    | "runtime"
    | "test"
    | "type"
    | "reexport"
    | "public"
    | "uncertain";
  file: string;
  line: number;
  detail: string;
}
export interface ExportConsumers {
  name: string;
  exportedNames: string[];
  line: number;
  column: number;
  evidence: ConsumerEvidence[];
}
export interface ProjectConsumers {
  files: Record<string, ExportConsumers[]>;
  coverage: {
    inventory: FileInventory;
    issues: string[];
    snapshot: string;
    sourceDigests: Record<string, string>;
    durationMs: number;
    sourceBytes: number;
  };
}
interface Link {
  target: string;
  imported: string;
  exported: string;
  typeOnly: boolean;
  line: number;
}
interface Module {
  file: string;
  source: string;
  role: FileRole;
  program: Node;
  scopes: ReturnType<typeof analyzeSyntax>["scopes"];
  exports: Map<string, Set<string>>;
  links: Link[];
}
const codeExtensions = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".cts",
  ".cjs",
];
const nodeName = (n: unknown): string =>
  String((n as Node | undefined)?.name ?? (n as Node | undefined)?.value ?? "");
const literal = (n: unknown): string | undefined =>
  typeof (n as Node | undefined)?.value === "string"
    ? ((n as Node).value as string)
    : undefined;

// These wrappers erase at runtime. Type syntax is never evidence of a loader.
function runtimeExpression(node: Node): Node {
  while (["ParenthesizedExpression", "TSAsExpression", "TSTypeAssertion",
    "TSNonNullExpression", "TSSatisfiesExpression", "TSInstantiationExpression"].includes(node.type))
    node = node.expression as Node;
  return node;
}
function staticProperty(node: Node): string | undefined {
  const property = runtimeExpression(node.property as Node);
  return node.computed ? literal(property) : nodeName(property);
}
type LoaderRole = "factory" | "loader" | "unknown";
type LoaderValue =
  | { kind: "module" | "factory" | "loaded-value" | "non-loader" | "unrelated" }
  | { kind: "loader"; base: "importer" }
  | { kind: "unsupported"; role: LoaderRole; reason: string; base?: "importer" };
const loaderRelated = (value: LoaderValue): boolean =>
  !["loaded-value", "non-loader", "unrelated"].includes(value.kind);

/** One graph per SDK scan. All reads are captured before graph construction. */
export function projectConsumers(root: string): ProjectConsumers {
  const started = performance.now();
  const config = readAnalysisConfig(root);
  const inv = inventory(root, [...codeExtensions, ".json"], config);
  const sources = new Map<string, string>();
  for (const { file } of inv.files)
    sources.set(
      path.resolve(root, file),
      fs.readFileSync(path.resolve(root, file), "utf8"),
    );
  const issues = new Set<string>();
  const fileSet = new Set(sources.keys());
  const directories = new Set<string>([root]);
  for (const file of fileSet) {
    let dir = path.dirname(file);
    while (dir.startsWith(root)) {
      directories.add(dir);
      if (dir === root) break;
      dir = path.dirname(dir);
    }
  }
  const read = (file: string) => sources.get(path.resolve(file));
  const host: ts.ModuleResolutionHost = {
    fileExists: (f) => fileSet.has(path.resolve(f)),
    readFile: read,
    directoryExists: (d) => directories.has(path.resolve(d)),
    getCurrentDirectory: () => root,
    realpath: (f) => f,
  };
  const optionsCache = new Map<string, ts.CompilerOptions>();
  const configIssues = new Map<string, string[]>();
  const unboundedConfigTargets = new Map<string, { from: string; detail: string }>();
  function options(file: string): ts.CompilerOptions {
    let dir = path.dirname(path.resolve(root, file));
    while (dir !== root && !sources.has(path.join(dir, "tsconfig.json")))
      dir = path.dirname(dir);
    if (optionsCache.has(dir)) return optionsCache.get(dir)!;
    const raw = sources.get(path.join(dir, "tsconfig.json"));
    let opts: ts.CompilerOptions = {
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      allowJs: true,
    };
    if (raw !== undefined) {
      const parsed = ts.parseConfigFileTextToJson(
        path.join(dir, "tsconfig.json"),
        raw,
      );
      const result = ts.parseJsonConfigFileContent(
        parsed.config ?? {},
        {
          useCaseSensitiveFileNames: true,
          fileExists: host.fileExists,
          readFile: read,
          readDirectory: () => [],
        },
        dir,
        undefined,
        path.join(dir, "tsconfig.json"),
      );
      const errors = [
        ...(parsed.error ? [parsed.error] : []),
        ...result.errors.filter((e) => e.code !== 18003),
      ];
      if (parsed.config?.references?.length)
        errors.push({
          category: ts.DiagnosticCategory.Error,
          code: 0,
          file: undefined,
          start: undefined,
          length: undefined,
          messageText:
            "project references are not followed; nearest tsconfig.json only",
        });
      if (errors.length)
        configIssues.set(
          dir,
          errors.map((e) =>
            ts.flattenDiagnosticMessageText(e.messageText, " "),
          ),
        );
      opts = { ...opts, ...result.options };
      if (
        ![
          ts.ModuleResolutionKind.Bundler,
          ts.ModuleResolutionKind.Node10,
          ts.ModuleResolutionKind.Node16,
          ts.ModuleResolutionKind.NodeNext,
        ].includes(opts.moduleResolution!)
      ) {
        configIssues.set(dir, [
          "unsupported moduleResolution; supported: node10, node16, nodenext, bundler",
        ]);
      }
    }
    optionsCache.set(dir, opts);
    return opts;
  }
  const modules = new Map<string, Module>();
  const origins = new Map<string, ExportConsumers>();
  const originFile = new Map<string, string>();
  const originDeclaration = new Map<string, number>();
  const localOrigin = new Map<string, Map<string, string>>();
  const packages = new Map<
    string,
    { dir: string; data: Record<string, unknown> }
  >();
  for (const [abs, source] of sources) {
    if (path.basename(abs) !== "package.json") continue;
    try {
      const data = JSON.parse(source);
      if (typeof data.name === "string")
        packages.set(data.name, { dir: path.dirname(abs), data });
    } catch {
      throw new Error(`invalid package.json: ${path.relative(root, abs)}`);
    }
  }
  function resolve(
    specifier: string,
    from: string,
    typeOnly = false,
  ): string | undefined {
    const opts = options(from);
    let resolutionMode = ts.ModuleKind.ESNext;
    if (
      opts.moduleResolution === ts.ModuleResolutionKind.Node16 ||
      opts.moduleResolution === ts.ModuleResolutionKind.NodeNext
    ) {
      if (/\.[cm][jt]s$/.test(from))
        resolutionMode = /\.c[jt]s$/.test(from)
          ? ts.ModuleKind.CommonJS
          : ts.ModuleKind.ESNext;
      else {
        let dir = path.dirname(path.resolve(root, from));
        while (dir !== root && !sources.has(path.join(dir, "package.json")))
          dir = path.dirname(dir);
        const raw = sources.get(path.join(dir, "package.json"));
        resolutionMode =
          raw && JSON.parse(raw).type === "module"
            ? ts.ModuleKind.ESNext
            : ts.ModuleKind.CommonJS;
      }
    }
    // An unavailable inherited config can redirect bare specifiers anywhere in
    // the capture. The importing config's directory is not a target boundary.
    const configDir = [...optionsCache].find(([, value]) => value === opts)?.[0];
    if (
      configDir && configIssues.has(configDir) &&
      !specifier.startsWith(".") && !specifier.startsWith("/") &&
      !specifier.startsWith("node:")
    ) {
      const detail = `unsupported config leaves target scope of ${specifier} unbounded`;
      issues.add(`${from}: ${detail}`);
      unboundedConfigTargets.set(from + "\0" + specifier, { from, detail });
    }
    const result = ts.resolveModuleName(
      specifier,
      path.resolve(root, from),
      opts,
      host,
      undefined,
      undefined,
      resolutionMode,
    ).resolvedModule;
    if (result && modules.has(path.relative(root, result.resolvedFileName)))
      return path.relative(root, result.resolvedFileName);
    const packageName = specifier.startsWith("@")
      ? specifier.split("/").slice(0, 2).join("/")
      : specifier.split("/")[0];
    const pkg = packages.get(packageName);
    if (pkg) {
      const sub = specifier.slice(packageName.length),
        exports = pkg.data.exports;
      let entry: unknown = exports;
      if (
        exports &&
        typeof exports === "object" &&
        !Array.isArray(exports) &&
        Object.keys(exports).some((k) => k.startsWith("."))
      )
        entry = (exports as Record<string, unknown>)[sub ? "." + sub : "."];
      if (entry === undefined && exports === undefined)
        entry = sub
          ? "." + sub
          : (pkg.data.module ?? pkg.data.main ?? "./index");
      while (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const map = entry as Record<string, unknown>;
        entry =
          (typeOnly
            ? map.types
            : resolutionMode === ts.ModuleKind.CommonJS
              ? map.require
              : map.import) ?? map.default;
      }
      if (typeof entry === "string" && entry.startsWith(".")) {
        const rel =
          "./" +
          path.relative(
            path.dirname(path.resolve(root, from)),
            path.resolve(pkg.dir, entry),
          );
        const resolved = ts.resolveModuleName(
          rel,
          path.resolve(root, from),
          opts,
          host,
        ).resolvedModule;
        if (
          resolved &&
          modules.has(path.relative(root, resolved.resolvedFileName))
        )
          return path.relative(root, resolved.resolvedFileName);
      }
      issues.add(
        `${from}: unsupported or unavailable workspace entry ${specifier}`,
      );
      uncertainScope(
        path.relative(root, pkg.dir),
        from,
        1,
        `unresolved workspace entry ${specifier}`,
      );
    }
    if (
      specifier.startsWith(".") ||
      specifier.startsWith("/") ||
      (opts.paths &&
        Object.keys(opts.paths).some((p) => matchesPath(specifier, p)))
    ) {
      issues.add(`${from}: unresolved internal module ${specifier}`);
    }
    return undefined;
  }
  function add(id: string, ev: ConsumerEvidence): void {
    const list = origins.get(id)?.evidence;
    if (list && !list.some((e) => JSON.stringify(e) === JSON.stringify(ev)))
      list.push(ev);
  }
  function targetEvidence(
    target: string,
    name: string,
    ev: ConsumerEvidence,
  ): void {
    const m = modules.get(target);
    if (!m) return;
    const ids =
      name === "*"
        ? [...m.exports.values()].flatMap((s) => [...s])
        : [...(m.exports.get(name) ?? [])];
    const uncertainRoute = (
      module: Module,
      exported: string,
      seen = new Set<string>(),
    ): boolean => {
      const key = module.file + ":" + exported;
      if (seen.has(key)) return false;
      seen.add(key);
      if ((module.exports.get(exported)?.size ?? 0) > 1) return true;
      return module.links
        .filter(
          (link) =>
            link.exported === exported ||
            (link.exported === "*" &&
              !explicitExports.get(module.file)!.has(exported) &&
              modules.get(link.target)!.exports.has(exported)),
        )
        .some(
          (link) =>
            link.typeOnly ||
            (link.exported !== "*" && link.imported === "*") ||
            uncertainRoute(
              modules.get(link.target)!,
              link.exported === "*" ? exported : link.imported,
              seen,
            ),
        );
    };
    const bounded =
      (ev.kind === "runtime" || ev.kind === "test") &&
      name !== "*" &&
      uncertainRoute(m, name)
        ? {
            ...ev,
            kind: "uncertain" as const,
            detail:
              "reference crosses an ambiguous, namespace, or type-only re-export; precise member flow is unsupported",
          }
        : ev;
    for (const id of ids) add(id, bounded);
  }
  function uncertainScope(
    prefix: string,
    from: string,
    line: number,
    detail: string,
  ): void {
    for (const [id, file] of originFile)
      if (!prefix || file === prefix || file.startsWith(prefix + "/"))
        add(id, { kind: "uncertain", file: from, line, detail });
  }
  const lineOf = (m: Module, n: Node) =>
    m.source.slice(0, n.start as number).split("\n").length;
  // Parse once and retain scope identities for the graph construction lifetime.
  for (const { file, role } of inv.files) {
    if (!codeExtensions.includes(path.extname(file))) continue;
    const source = sources.get(path.resolve(root, file))!;
    const { program, scopes } = analyzeSyntax(file, source);
    modules.set(file, {
      file,
      source,
      role,
      program,
      scopes,
      exports: new Map(),
      links: [],
    });
  }
  function origin(m: Module, name: string, exported: string, n: Node): void {
    let locals = localOrigin.get(m.file);
    if (!locals) localOrigin.set(m.file, (locals = new Map()));
    let id = locals.get(name);
    if (!id) {
      id = m.file + ":" + String(n.start) + ":" + name;
      locals.set(name, id);
      const start = n.start as number;
      const lines = m.source.slice(0, start).split("\n");
      origins.set(id, {
        name,
        exportedNames: [],
        line: lines.length,
        column: lines.at(-1)!.length,
        evidence: [],
      });
      originFile.set(id, m.file);
      const declaration = declarationsAt(m.program, name);
      if (declaration !== undefined) originDeclaration.set(id, declaration);
    }
    origins.get(id)!.exportedNames.push(exported);
    m.exports.set(exported, new Set([id]));
  }
  for (const m of modules.values()) {
    const top = children(m.program);
    const declarations = new Map<string, Node>();
    const imports = new Map<
      string,
      { specifier: string; name: string; typeOnly: boolean }
    >();
    const gather = (n: Node) => {
      if (n.type === "Identifier") declarations.set(String(n.name), n);
      else if (
        n.type === "ObjectPattern" ||
        n.type === "ArrayPattern" ||
        n.type === "Property" ||
        n.type === "RestElement" ||
        n.type === "AssignmentPattern"
      ) {
        if (n.type === "Property") gather(n.value as Node);
        else if (n.type === "AssignmentPattern") gather(n.left as Node);
        else children(n).forEach(gather);
      }
    };
    for (const stmt of top) {
      const d = (stmt.declaration as Node | undefined) ?? stmt;
      if (d.id) gather(d.id as Node);
      if (d.type === "VariableDeclaration")
        for (const decl of d.declarations as Node[]) gather(decl.id as Node);
      if (stmt.type === "ImportDeclaration")
        for (const s of stmt.specifiers as Node[])
          imports.set(nodeName(s.local), {
            specifier: literal(stmt.source)!,
            name:
              s.type === "ImportDefaultSpecifier"
                ? "default"
                : s.type === "ImportNamespaceSpecifier"
                  ? "*"
                  : nodeName(s.imported),
            typeOnly: stmt.importKind === "type" || s.importKind === "type",
          });
    }
    for (const stmt of top) {
      if (stmt.type === "ExportNamedDeclaration") {
        const d = stmt.declaration as Node | undefined;
        if (d) {
          if (d.id) origin(m, nodeName(d.id), nodeName(d.id), d);
          if (d.type === "VariableDeclaration") {
            const names = new Set<string>();
            const collect = (n: Node): void => {
              if (n.type === "Identifier") names.add(String(n.name));
              else if (n.type === "Property") collect(n.value as Node);
              else if (n.type === "AssignmentPattern") collect(n.left as Node);
              else children(n).forEach(collect);
            };
            for (const decl of d.declarations as Node[]) {
              names.clear();
              collect(decl.id as Node);
              for (const name of names) origin(m, name, name, decl);
            }
          }
        }
        for (const s of (stmt.specifiers ?? []) as Node[]) {
          const local = nodeName(s.local),
            exported = nodeName(s.exported),
            imp = imports.get(local);
          const spec = literal(stmt.source) ?? imp?.specifier;
          if (spec) {
            const target = resolve(
              spec,
              m.file,
              stmt.exportKind === "type" || s.exportKind === "type",
            );
            if (target)
              m.links.push({
                target,
                imported: literal(stmt.source) ? local : imp!.name,
                exported,
                typeOnly:
                  stmt.exportKind === "type" ||
                  s.exportKind === "type" ||
                  imp?.typeOnly === true,
                line: lineOf(m, stmt),
              });
          } else {
            const decl = declarations.get(local);
            if (decl) origin(m, local, exported, decl);
          }
        }
      } else if (stmt.type === "ExportDefaultDeclaration") {
        const d = stmt.declaration as Node;
        const name = d.type === "Identifier" ? nodeName(d) : nodeName(d.id);
        const imp = imports.get(name);
        if (d.type === "Identifier" && imp) {
          const target = resolve(imp.specifier, m.file, imp.typeOnly);
          if (target)
            m.links.push({
              target,
              imported: imp.name,
              exported: "default",
              typeOnly: imp.typeOnly,
              line: lineOf(m, stmt),
            });
        } else
          origin(m, name || "default", "default", declarations.get(name) ?? d);
      } else if (stmt.type === "ExportAllDeclaration") {
        const target = resolve(
          literal(stmt.source)!,
          m.file,
          stmt.exportKind === "type",
        );
        if (target)
          m.links.push({
            target,
            imported: "*",
            exported: stmt.exported ? nodeName(stmt.exported) : "*",
            typeOnly: stmt.exportKind === "type",
            line: lineOf(m, stmt),
          });
      }
    }
  }
  const explicitExports = new Map(
    [...modules].map(([file, m]) => [
      file,
      new Set([
        ...m.exports.keys(),
        ...m.links.filter((l) => l.exported !== "*").map((l) => l.exported),
      ]),
    ]),
  );
  // Monotone finite sets terminate barrel cycles, including star chains.
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of modules.values())
      for (const link of m.links) {
        const target = modules.get(link.target)!;
        const entries =
          link.imported === "*"
            ? [...target.exports].filter(([name]) => name !== "default")
            : [
                [
                  link.imported,
                  target.exports.get(link.imported) ?? new Set<string>(),
                ] as const,
              ];
        for (const [name, ids] of entries) {
          if (link.exported === "*" && explicitExports.get(m.file)!.has(name))
            continue;
          const exported = link.exported === "*" ? name : link.exported;
          const set = m.exports.get(exported) ?? new Set<string>();
          for (const id of ids)
            if (!set.has(id)) {
              set.add(id);
              changed = true;
            }
          m.exports.set(exported, set);
        }
      }
  }
  for (const m of modules.values())
    for (const link of m.links)
      targetEvidence(link.target, link.imported, {
        kind: "reexport",
        file: m.file,
        line: link.line,
        detail: `${link.typeOnly ? "type " : ""}re-export as ${link.exported}; dependency even without a final caller`,
      });
  for (const m of modules.values()) {
    options(m.file);
    const parent = new Map<Node, Node>();
    const visit = (n: Node): void => {
      for (const child of children(n)) {
        parent.set(child, n);
        visit(child);
      }
    };
    visit(m.program);
    // Scope-manager references bind these AST identifiers to their declarations.
    const references = new Map(
      m.scopes.scopes.flatMap((scope) => scope.references).map((ref) =>
        [ref.identifier as unknown as Node, ref] as const),
    );
    const variableOf = (n: Node) => references.get(n)?.resolved;
    const fixedSegment = (n: Node): boolean => {
      let value = literal(n);
      if (n.type === "Identifier") {
        const variable = variableOf(n), def = variable?.defs[0];
        const declaration = def?.node as unknown as Node | undefined;
        if (
          def?.type !== "Variable" ||
          (def.parent as unknown as Node)?.kind !== "const" ||
          declaration?.id !== def.name ||
          variable?.references.some((ref) => ref.isWrite() && !ref.init)
        ) return false;
        value = literal(declaration.init);
      }
      // Conservative segment alphabet: no separators, dot segments, percent
      // encodings, URL delimiters, or coercions that might change containment.
      return value !== undefined && /^[A-Za-z0-9_-]+$/.test(value);
    };
    // Unknown calls without loader provenance are unrelated, not proven ordinary
    // functions and not incomplete loader analyses. Only related values abstain.
    const unsupported = (reason: string, role: LoaderRole = "unknown", base?: "importer"): LoaderValue =>
      ({ kind: "unsupported", role, reason, base });
    const runtimeParent = (node: Node): Node | undefined => {
      let p = parent.get(node);
      while (p && runtimeExpression(p) === runtimeExpression(node)) {
        node = p;
        p = parent.get(node);
      }
      return p;
    };
    const modifiedObject = (variable: NonNullable<ReturnType<typeof variableOf>>, objectOnly: boolean): boolean =>
      variable.references.some((ref) => {
        const n = ref.identifier as unknown as Node;
        const p = runtimeParent(n);
        if (p?.type === "MemberExpression") {
          const outer = runtimeParent(p);
          return (outer?.type === "AssignmentExpression" && runtimeExpression(outer.left as Node) === p) ||
            outer?.type === "UpdateExpression" ||
            (outer?.type === "UnaryExpression" && outer.operator === "delete");
        }
        // Passing the object to unknown code can mutate its factory property.
        // Alias initialization is also an escape: aliases may mutate the object.
        return (p?.type === "CallExpression" && runtimeExpression(p.callee as Node) !== n) ||
          (objectOnly && p?.type === "VariableDeclarator" && p.init !== undefined && runtimeExpression(p.init as Node) === n);
      });
    const isImporterBase = (node: Node): boolean => {
      const base = runtimeExpression(node);
      if (base.type !== "MemberExpression" || staticProperty(base) !== "url") return false;
      const meta = runtimeExpression(base.object as Node);
      return meta.type === "MetaProperty" && nodeName(meta.meta) === "import" &&
        nodeName(meta.property) === "meta";
    };
    const loaderValueCache = new Map<Node, LoaderValue>();
    let cycleCount = 0;
    const classifyLoaderValue = (expression: Node, seen = new Set<Node>()): LoaderValue => {
      const n = runtimeExpression(expression);
      if (seen.has(n)) { cycleCount++; return { kind: "unrelated" }; }
      const cached = loaderValueCache.get(n);
      if (cached) return cached;
      const before = cycleCount;
      const value = classifyUncached(n, seen);
      // A recursive fallback is contextual; never cache it as proof of absence.
      if (cycleCount === before) loaderValueCache.set(n, value);
      return value;
    };
    const classifyUncached = (n: Node, seen: Set<Node>): LoaderValue => {
      const next = new Set(seen).add(n);
      if (n.type === "Identifier") {
        const variable = variableOf(n);
        if (!variable)
          return references.has(n) && nodeName(n) === "require"
            ? { kind: "loader", base: "importer" } : { kind: "unrelated" };
        const def = variable.defs[0], declaration = def?.node as unknown as Node | undefined;
        let value: LoaderValue = { kind: "unrelated" };
        if (def?.type === "ImportBinding" && declaration) {
          const source = literal(parent.get(declaration)?.source);
          if (source === "node:module" || source === "module") {
            if (declaration.type === "ImportSpecifier" && nodeName(declaration.imported) === "createRequire")
              value = { kind: "factory" };
            else if (["ImportNamespaceSpecifier", "ImportDefaultSpecifier"].includes(declaration.type))
              value = { kind: "module" };
          }
        } else if (def?.type === "FunctionName") value = { kind: "non-loader" };
        else if (def?.type === "Variable" && declaration?.init) {
          if (next.has(declaration)) { cycleCount++; return { kind: "unrelated" }; }
          next.add(declaration);
          value = classifyLoaderValue(declaration.init as Node, next);
          if (declaration.id !== def.name && loaderRelated(value))
            value = unsupported("loader-related destructuring is unsupported");
        }
        const writes = variable.references.filter((ref) => ref.isWrite() && !ref.init);
        if (writes.length && (loaderRelated(value) || writes.some((ref) =>
          ref.writeExpr && loaderRelated(classifyLoaderValue(ref.writeExpr as unknown as Node, next)))))
          return unsupported("loader-related binding is reassigned; base and value flow are uncertain");
        if (["module", "factory", "loader"].includes(value.kind) && modifiedObject(variable, value.kind === "module"))
          return unsupported("loader-related object or function is mutated or escapes; factory/base identity is uncertain");
        return value;
      }
      if (["FunctionExpression", "ArrowFunctionExpression", "Literal", "ObjectExpression", "ArrayExpression"].includes(n.type)) {
        if (["FunctionExpression", "ArrowFunctionExpression", "Literal"].includes(n.type))
          return { kind: "non-loader" };
      }
      if (n.type === "MemberExpression") {
        const object = classifyLoaderValue(n.object as Node, next);
        if (object.kind === "module") {
          const property = staticProperty(n);
          if (property === "createRequire") return { kind: "factory" };
          if (property === undefined) return unsupported("computed builtin-module property may select createRequire");
          return { kind: "unrelated" };
        }
        // An arbitrary member need not have the same callable role as its object.
        if (object.kind === "unsupported") return unsupported(object.reason);
        // require.resolve computes a filename; it does not load module exports.
        // Keep this separate from invoking require, including through aliases.
        if (object.kind === "loader" && staticProperty(n) === "resolve")
          return { kind: "non-loader" };
        if (loaderRelated(object)) return unsupported("unsupported member access on a loader-related value");
        return { kind: "unrelated" };
      }
      if (n.type === "ConditionalExpression" || n.type === "LogicalExpression") {
        const alternatives = (n.type === "ConditionalExpression"
          ? [n.consequent, n.alternate] : [n.left, n.right]) as Node[];
        const values = alternatives.map((value) => classifyLoaderValue(value, next));
        if (values.some(loaderRelated)) {
          const role: LoaderRole = values.every((value) => value.kind === "factory" ||
            (value.kind === "unsupported" && value.role === "factory")) ? "factory" :
            values.every((value) => value.kind === "loader" || value.kind === "non-loader" ||
              (value.kind === "unsupported" && value.role === "loader")) ? "loader" : "unknown";
          const base = role === "loader" && values.every((value) => value.kind === "loader" ||
            value.kind === "non-loader" || (value.kind === "unsupported" && value.base === "importer"))
            ? "importer" : undefined;
          return unsupported("loader selection is conditional; value flow is unsupported", role, base);
        }
        return { kind: "unrelated" };
      }
      if (n.type === "CallExpression") {
        const callee = classifyLoaderValue(n.callee as Node, next);
        if (callee.kind === "factory" || (callee.kind === "unsupported" && callee.role === "factory")) {
          const base = (n.arguments as Node[])[0];
          if (!base || !isImporterBase(base))
            return unsupported("createRequire base is unsupported; possible target scope is unbounded", "loader");
          if (callee.kind === "unsupported") return unsupported(callee.reason, "loader", "importer");
          return { kind: "loader", base: "importer" };
        }
        // Call-result semantics depend on role, not on recognition certainty.
        // The original load records its own target uncertainty in the AST walk;
        // its returned value and arbitrary methods do not inherit loader identity.
        if (callee.kind === "loader" || (callee.kind === "unsupported" && callee.role === "loader"))
          return { kind: "loaded-value" };
        if (callee.kind === "unsupported") return callee;
      }
      // Known loader provenance inside an unmodeled expression must survive.
      // Do not infer that an arbitrary wrapper returns its loader argument.
      if (children(n).filter((child) => !child.type.startsWith("TS") || runtimeExpression(child) !== child)
        .some((child) => loaderRelated(classifyLoaderValue(child, next))))
        return unsupported(`unsupported ${n.type} contains a loader-related value`);
      return { kind: "unrelated" };
    };
    const evidence = (
      n: Node,
      typeOnly: boolean,
      detail: string,
    ): ConsumerEvidence => ({
      kind: typeOnly ? "type" : m.role === "test" ? "test" : "runtime",
      file: m.file,
      line: lineOf(m, n),
      detail,
    });
    const namespace = (target: string, n: Node, typeOnly: boolean): void => {
      if (typeOnly) {
        targetEvidence(
          target,
          "*",
          evidence(n, true, "namespace referenced in a type position"),
        );
        return;
      }
      const p = parent.get(n);
      const member =
        p?.type === "MemberExpression" ||
        p?.type === "OptionalMemberExpression" ||
        p?.type === "JSXMemberExpression";
      if (
        member &&
        p.object === n &&
        (!p.computed || literal(p.property) !== undefined)
      )
        targetEvidence(
          target,
          nodeName(p.property),
          evidence(n, typeOnly, "resolved namespace member"),
        );
      else
        targetEvidence(target, "*", {
          kind: "uncertain",
          file: m.file,
          line: lineOf(m, n),
          detail: "namespace escapes or has computed member access",
        });
    };
    for (const scope of m.scopes.scopes)
      for (const variable of scope.variables) {
        const def = variable.defs[0];
        if (!def) continue;
        if (def.type === "ImportBinding") {
          const spec = def.node as unknown as Node;
          const decl = parent.get(spec);
          if (decl?.type !== "ImportDeclaration") continue;
          const typeOnly =
            decl.importKind === "type" || spec.importKind === "type";
          const target = resolve(literal(decl.source)!, m.file, typeOnly);
          if (!target) continue;
          if (spec.type !== "ImportNamespaceSpecifier")
            targetEvidence(
              target,
              spec.type === "ImportDefaultSpecifier"
                ? "default"
                : nodeName(spec.imported),
              {
                kind: typeOnly ? "type" : "import",
                file: m.file,
                line: lineOf(m, spec),
                detail:
                  "static named/default import dependency; not proof of runtime use",
              },
            );
          for (const ref of variable.references) {
            const n = ref.identifier as unknown as Node;
            const isType = typeOnly || !ref.isValueReference;
            if (spec.type === "ImportNamespaceSpecifier")
              namespace(target, n, isType);
            else
              targetEvidence(
                target,
                spec.type === "ImportDefaultSpecifier"
                  ? "default"
                  : nodeName(spec.imported),
                evidence(n, isType, "resolved imported binding reference"),
              );
          }
        } else {
          // Identity-bound local reads, never same-spelled shadowed references.
          const id = localOrigin.get(m.file)?.get(variable.name);
          if (!id) continue;
          const declaration = def.name.range?.[0];
          const original = originDeclaration.get(id);
          if (original === undefined || declaration !== original) continue;
          for (const ref of variable.references)
            if (ref.isRead()) {
              const p = parent.get(ref.identifier as unknown as Node);
              if (
                p?.type !== "ExportSpecifier" &&
                p?.type !== "ExportDefaultDeclaration"
              )
                add(
                  id,
                  evidence(
                    ref.identifier as unknown as Node,
                    !ref.isValueReference,
                    "resolved in-file reference",
                  ),
                );
            }
        }
      }
    const walk = (n: Node): void => {
      if (n.type === "ImportExpression") {
        const importSource = n.source as Node;
        const spec =
          literal(importSource) ??
          (importSource.type === "TemplateLiteral" &&
          (importSource.expressions as Node[]).length === 0
            ? ((importSource.quasis as Node[])[0].value as { cooked?: string })
                .cooked
            : undefined);
        if (spec !== undefined) {
          const target = resolve(spec, m.file);
          if (target) {
            let outer = n;
            while (
              parent.get(outer)?.type === "AwaitExpression" ||
              parent.get(outer)?.type === "ParenthesizedExpression"
            )
              outer = parent.get(outer)!;
            const p = parent.get(outer);
            if (
              outer === n &&
              p?.type === "MemberExpression" &&
              nodeName(p.property) === "then"
            ) {
              const call = parent.get(p),
                callback = (call?.arguments as Node[] | undefined)?.[0],
                param = (callback?.params as Node[] | undefined)?.[0];
              const variable =
                param?.type === "Identifier"
                  ? m.scopes.scopes
                      .flatMap((scope) => scope.variables)
                      .find((v) =>
                        v.defs.some(
                          (def) => (def.name as unknown as Node) === param,
                        ),
                      )
                  : undefined;
              if (call?.type === "CallExpression" && variable) {
                for (const ref of variable.references)
                  namespace(
                    target,
                    ref.identifier as unknown as Node,
                    !ref.isValueReference,
                  );
              } else
                targetEvidence(target, "*", {
                  kind: "uncertain",
                  file: m.file,
                  line: lineOf(m, n),
                  detail:
                    "dynamic import then-callback namespace is unsupported",
                });
            } else if (
              outer !== n &&
              p?.type === "MemberExpression" &&
              p.object === outer
            )
              namespace(target, outer, false);
            else if (
              outer !== n &&
              p?.type === "VariableDeclarator" &&
              p.init === outer
            ) {
              const id = p.id as Node;
              if (id.type === "ObjectPattern") {
                for (const property of id.properties as Node[]) {
                  if (
                    property.type === "Property" &&
                    (!property.computed || literal(property.key) !== undefined)
                  )
                    targetEvidence(
                      target,
                      nodeName(property.key),
                      evidence(
                        property,
                        false,
                        "destructured dynamic import member",
                      ),
                    );
                  else
                    targetEvidence(target, "*", {
                      kind: "uncertain",
                      file: m.file,
                      line: lineOf(m, n),
                      detail:
                        "dynamic import destructuring rest/computed access",
                    });
                }
              } else if (id.type === "Identifier") {
                const variable = m.scopes.scopes
                  .flatMap((scope) => scope.variables)
                  .find((v) =>
                    v.defs.some((def) => (def.name as unknown as Node) === id),
                  );
                if (variable)
                  for (const ref of variable.references) {
                    if ((ref.identifier as unknown as Node) === id) continue;
                    if (ref.isWrite())
                      targetEvidence(target, "*", {
                        kind: "uncertain",
                        file: m.file,
                        line: lineOf(m, n),
                        detail: "dynamic namespace binding reassigned",
                      });
                    else
                      namespace(
                        target,
                        ref.identifier as unknown as Node,
                        !ref.isValueReference,
                      );
                  }
              } else
                targetEvidence(target, "*", {
                  kind: "uncertain",
                  file: m.file,
                  line: lineOf(m, n),
                  detail: "unsupported dynamic import binding",
                });
            } else
              targetEvidence(target, "*", {
                kind: "uncertain",
                file: m.file,
                line: lineOf(m, n),
                detail:
                  "dynamic module namespace requires downstream value flow",
              });
          }
        } else {
          const detail =
            "nonliteral dynamic import: possible consumers are unresolved";
          issues.add(`${m.file}:${lineOf(m, n)} ${detail}`);
          const src = n.source as Node;
          const quasi = (src.quasis as Node[] | undefined)?.[0];
          const prefix =
            src.type === "TemplateLiteral"
              ? (quasi?.value as { cooked?: string })?.cooked
              : undefined;
          const contained = src.type === "TemplateLiteral" &&
            !/[%\\?#]/.test(prefix ?? "") &&
            (src.expressions as Node[]).every(fixedSegment) &&
            (src.quasis as Node[]).slice(1).every((quasi) =>
              /^[A-Za-z0-9_.-]*$/.test(
                (quasi.value as { cooked?: string }).cooked ?? "!",
              ));
          const scope = contained && prefix?.startsWith(".")
            ? path.relative(
                root,
                path.resolve(
                  root,
                  path.dirname(m.file),
                  prefix.slice(0, prefix.lastIndexOf("/") + 1),
                ),
              )
            : "";
          uncertainScope(scope, m.file, lineOf(m, n), detail);
        }
      } else if (n.type === "TSImportEqualsDeclaration") {
        const spec = literal(
          (n.moduleReference as Node | undefined)?.expression,
        );
        const target = spec ? resolve(spec, m.file) : undefined;
        if (target)
          targetEvidence(target, "*", {
            kind: "uncertain",
            file: m.file,
            line: lineOf(m, n),
            detail: "TypeScript import-equals value flow unsupported",
          });
      } else if (n.type === "TSImportType") {
        const spec =
          literal(n.source) ??
          literal(n.argument) ??
          literal((n.argument as Node | undefined)?.literal);
        if (spec) {
          const target = resolve(spec, m.file, true);
          if (target)
            targetEvidence(
              target,
              n.qualifier ? qualifierRoot(n.qualifier as Node) : "*",
              evidence(n, true, "TypeScript import-type expression"),
            );
        }
      } else if (n.type === "CallExpression") {
        const loader = classifyLoaderValue(n.callee as Node);
        if (loader.kind === "loader" || (loader.kind === "unsupported" && loader.role !== "factory")) {
          const argument = (n.arguments as Node[])[0];
          const spec = loader.base === "importer" && argument
            ? literal(runtimeExpression(argument)) : undefined;
          const target = spec !== undefined ? resolve(spec, m.file) : undefined;
          const detail = loader.kind === "unsupported" ? loader.reason :
            spec === undefined ? "nonliteral CommonJS require target is unbounded" :
              "CommonJS require value flow unsupported";
          if (target)
            targetEvidence(target, "*", {
              kind: "uncertain", file: m.file, line: lineOf(m, n), detail,
            });
          else if (spec === undefined) {
            issues.add(`${m.file}:${lineOf(m, n)} ${detail}`);
            uncertainScope("", m.file, lineOf(m, n), detail);
          }
        }
      }
      children(n).forEach(walk);
    };
    walk(m.program);
  }
  // Loader-owned defaults are exposure, never guesses about arbitrary directory helpers.
  for (const m of modules.values()) {
    if (/(^|\/)(?:vite|vitest)\.config\.[cm]?[jt]s$/.test(m.file))
      targetEvidence(m.file, "default", {
        kind: "public",
        file: m.file,
        line: 1,
        detail: "Vite/Vitest configuration default export convention",
      });
    const exported = children(m.program).find(
      (n) => n.type === "ExportDefaultDeclaration",
    );
    const call = exported?.declaration as Node | undefined;
    if (call?.type === "CallExpression") {
      const ref = m.scopes.scopes
        .flatMap((scope) => scope.references)
        .find((ref) => (ref.identifier as unknown as Node) === call.callee);
      const def = ref?.resolved?.defs[0];
      const spec = def?.node as unknown as Node | undefined;
      const declaration = children(m.program).find(
        (n) =>
          n.type === "ImportDeclaration" &&
          (n.specifiers as Node[]).includes(spec!),
      );
      if (
        spec &&
        ["definePlugin", "defineNitroPlugin"].includes(
          nodeName(spec.imported),
        ) &&
        ["nitro", "nitropack/runtime"].includes(
          literal(declaration?.source) ?? "",
        )
      )
        targetEvidence(m.file, "default", {
          kind: "public",
          file: m.file,
          line: lineOf(m, exported!),
          detail:
            "Nitro runtime plugin wrapper: loader entry candidate, explicit loading remains project configuration",
        });
    }
  }
  // Explicitly supported loader conventions, additional entries are declarative.
  for (const m of modules.values())
    if (
      /^(?:src\/)?(?:index|main|cli|server|app|mod)\.[cm]?[jt]sx?$|^doctors\/.*\.mjs$/.test(
        m.file,
      )
    )
      targetEvidence(m.file, "*", {
        kind: "public",
        file: m.file,
        line: 1,
        detail: "supported root entry or doctor-loader convention",
      });
  // Configured framework/public entries and package entry declarations are exposure.
  for (const m of modules.values())
    if (config.entryPoints.some((p) => matchesPath(m.file, p)))
      targetEvidence(m.file, "*", {
        kind: "public",
        file: "any-doctor.analysis.json",
        line: 1,
        detail: "declared public/framework entry point",
      });
  for (const [abs, source] of sources)
    if (path.basename(abs) === "package.json") {
      const pkg = JSON.parse(source),
        dir = path.dirname(abs);
      const targets: string[] = [];
      const leaves = (v: unknown): void => {
        if (typeof v === "string") targets.push(v);
        else if (v && typeof v === "object") Object.values(v).forEach(leaves);
      };
      for (const field of [
        pkg.exports,
        pkg.main,
        pkg.module,
        pkg.types,
        pkg.bin,
      ])
        leaves(field);
      for (const entry of targets) {
        const rel = path.relative(root, path.resolve(dir, entry));
        const selected = [...modules.keys()].filter((f) => matchesPath(f, rel));
        if (selected.length)
          for (const file of selected)
            targetEvidence(file, "*", {
              kind: "public",
              file: path.relative(root, abs),
              line: 1,
              detail: `package entry ${entry}`,
            });
        else {
          issues.add(
            `${path.relative(root, abs)}: entry ${entry} has no captured source mapping`,
          );
          uncertainScope(
            path.relative(root, dir),
            path.relative(root, abs),
            1,
            `public entry ${entry} lacks source mapping`,
          );
        }
      }
    }
  // Some resolutions happen before all export origins are collected.
  for (const { from, detail } of unboundedConfigTargets.values())
    uncertainScope("", from, 1, detail);
  for (const [dir, reasons] of configIssues)
    for (const reason of reasons) {
      issues.add(`${path.relative(root, dir) || "."}: ${reason}`);
      uncertainScope(
        path.relative(root, dir),
        path.relative(root, dir),
        1,
        reason,
      );
    }
  for (const origin of origins.values())
    for (const ev of origin.evidence)
      if (ev.kind === "uncertain")
        issues.add(`${ev.file}:${ev.line} ${ev.detail}`);
  const files: ProjectConsumers["files"] = {};
  for (const file of modules.keys()) files[file] = [];
  for (const [id, value] of origins) files[originFile.get(id)!].push(value);
  const digest = createHash("sha256");
  const sourceDigests: Record<string, string> = {};
  let sourceBytes = 0;
  for (const [file, source] of sources) {
    digest
      .update(path.relative(root, file))
      .update("\0")
      .update(source)
      .update("\0");
    sourceBytes += Buffer.byteLength(source);
    sourceDigests[path.relative(root, file)] = createHash("sha256")
      .update(source)
      .digest("hex");
  }
  return {
    files,
    coverage: {
      inventory: inv,
      issues: [...issues].sort(),
      snapshot: digest.digest("hex"),
      sourceDigests,
      durationMs: performance.now() - started,
      sourceBytes,
    },
  };
}
function declarationsAt(program: Node, name: string): number | undefined {
  const identifier = (n: Node): number | undefined => {
    if (n.type === "Identifier")
      return n.name === name ? (n.start as number) : undefined;
    if (n.type === "Property") return identifier(n.value as Node);
    if (n.type === "AssignmentPattern") return identifier(n.left as Node);
    if (["ObjectPattern", "ArrayPattern", "RestElement"].includes(n.type)) {
      for (const child of children(n)) {
        const match = identifier(child);
        if (match !== undefined) return match;
      }
    }
    return undefined;
  };
  for (const stmt of children(program)) {
    const n = (stmt.declaration as Node | undefined) ?? stmt;
    if (n.id) {
      const found = identifier(n.id as Node);
      if (found !== undefined) return found;
    }
    if (n.type === "VariableDeclaration")
      for (const decl of n.declarations as Node[]) {
        const found = identifier(decl.id as Node);
        if (found !== undefined) return found;
      }
  }
  return undefined;
}
function qualifierRoot(n: Node): string {
  return n.type === "TSQualifiedName"
    ? qualifierRoot(n.left as Node)
    : nodeName(n);
}
