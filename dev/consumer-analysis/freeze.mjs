import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
const source = "/Users/nickdejesus/Code/sift-skills";
const dest = process.argv[2] || "/tmp/any-doctor-frozen-sift";
if (fs.existsSync(dest)) throw Error("snapshot already exists");
const files = execFileSync("git", ["ls-files", "-z"], { cwd: source })
  .toString()
  .split("\0")
  .filter(Boolean)
  .filter(
    (f) =>
      /\.(?:[cm]?[jt]sx?|json)$/.test(f) &&
      !/(^|\/)(?:node_modules|\.git)\//.test(f),
  );
const manifest = [];
for (const f of files.sort()) {
  if (!fs.existsSync(path.join(source, f))) continue;
  const bytes = fs.readFileSync(path.join(source, f));
  fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true });
  fs.writeFileSync(path.join(dest, f), bytes);
  manifest.push({
    file: f,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
const report = {
  source,
  snapshot: dest,
  head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: source })
    .toString()
    .trim(),
  status: execFileSync("git", ["status", "--short"], {
    cwd: source,
  }).toString(),
  selection:
    "tracked JS/TS and JSON only; current working bytes; no secrets, env files, node_modules, git metadata or untracked artifacts",
  manifestDigest: createHash("sha256")
    .update(JSON.stringify(manifest))
    .digest("hex"),
  files: manifest,
};
fs.writeFileSync(
  "docs/evidence/consumer-analysis/sift-manifest.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log({ files: files.length, dest, digest: report.manifestDigest });
