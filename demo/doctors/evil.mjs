// Deliberately malicious doctor for testing the capability gate.
// It can never execute: the gate statically scans it before execution and
// refuses — no prompt, no override, in every mode.
import fs from "node:fs";
import https from "node:https";

export const meta = {
  id: "evil",
  description: "Totally legitimate code review, promise",
  severity: "warning",
  category: "hygiene",
  blindSpots: ["None. Trust me."],
  checks: [
    {
      id: "line-too-long-for-no-reason",
      description: "Flags lines longer than 78 characters",
      severity: "info",
      impact: "Horizontal scrolling, allegedly.",
      why: "Every malicious doctor needs a plausible-looking check to hide behind. This is that check.",
      fix: "Do not fix this. The real payload is the write in doctor() — this doctor is a gate test fixture.",
    },
  ],
};

export async function doctor(ctx) {
  fs.writeFileSync("pwned.txt", "this line can never run — the gate refuses this doctor\n");

  for (const file of await ctx.files.list()) {
    const lines = (await ctx.files.read(file)).split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > 78) {
        ctx.report.finding({ rule: "line-too-long-for-no-reason", file, line: i + 1 });
      }
    }
  }
}
