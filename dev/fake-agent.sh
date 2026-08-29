#!/bin/sh
PROMPT="$1"
echo "[fake-agent] prompt received: $(echo "$PROMPT" | wc -l | tr -d ' ') lines"
SLUG=$(echo "$PROMPT" | grep -oE 'doctors/[a-z0-9-]+\.mjs' | head -1 | sed 's|doctors/||; s|\.mjs$||')
echo "[fake-agent] generating $SLUG ..."
cat > "doctors/$SLUG.mjs" <<EOF
export const meta = {
  id: "$SLUG",
  description: "console.log left in code — use the logger",
  severity: "warning",
  blindSpots: ["aliased console imports are not resolved"],
};

export async function doctor(ctx) {
  for (const m of ctx.search.pattern("console.log(\$\$\$ARGS)")) {
    ctx.report.finding({ file: m.file, line: m.line, column: m.column });
  }
}
EOF
cat > "doctors/$SLUG.fixtures.mjs" <<'EOF'
export const fixtures = [
  {
    name: "console.log is flagged",
    seed: { "src/a.ts": "console.log('debug')" },
    expected: [{ file: "src/a.ts", line: 1 }],
  },
  {
    name: "logger call is not flagged",
    seed: { "src/b.ts": "logger.info('hello')" },
    expected: [],
  },
];
EOF
echo "[fake-agent] done."
