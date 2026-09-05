import { chmodSync } from "node:fs";

for (const f of ["bin/cli.js", "bin/doctor-loader.mjs"]) {
  chmodSync(f, 0o755);
}
