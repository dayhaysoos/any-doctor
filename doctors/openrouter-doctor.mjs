export const meta = {
  id: "openrouter-doctor",
  description: "OpenRouter discipline: stream errors surfaced, keep-alives skipped, cancellations that stop billing.",
  severity: "warning",
  category: "openrouter",
  blindSpots: [
    "OpenRouter context is detected by the file mentioning it anywhere (URL, import, baseURL); files that route through an unmarked wrapper are not covered.",
    "Stream-error and keep-alive checks reason per file: an error check that lives in a different file from the consumption loop is not seen, and midstream-error-ignored reports the first consumption loop per file (later loops in the same file are not separately counted).",
    "Abort and retry checks pair the OpenRouter marker with the call on the same line: a multi-line fetch whose URL lands on the following line is not recognized; framework-level interceptors and SDK-managed backoff are not recognized.",
    "Cost/token accounting (usage.cost) is deliberately not checked: file-level absence reasoning false-positives on apps whose wrapper logs usage elsewhere.",
    "Fixture-named files (*.fixtures.mjs) in the target are skipped: they are doctor test data, not target source.",
  ],
  checks: [
    {
      id: "midstream-error-ignored",
      description: "A streamed OpenRouter response is consumed without ever checking for mid-stream errors",
      severity: "warning",
      revision: 1,
      impact: "After headers commit, OpenRouter keeps the status at 200 and delivers failures as SSE events — the docs note the error chunk 'can be the first and only event'. A loop that only reads delta.content records a silent empty reply as success.",
      why: "OpenRouter's stream protocol puts errors inside the 200-OK body: a top-level error field on the chunk, with choices[0].finish_reason === \"error\". Neither the HTTP status nor the types say anything is wrong.",
      fix: "Check each chunk: `if (chunk.error ?? parsed.choices?.[0]?.finish_reason === \"error\") throw new Error(chunk.error?.message)` before reading delta.content.",
      claim: "A file consuming OpenRouter stream deltas with no error-shape check anywhere in the file.",
      lookalikes: ["error handling living in a different file"],
    },
    {
      id: "sse-comment-parse-crash",
      description: "A hand-rolled SSE reader will feed OpenRouter's keep-alive comments to JSON.parse",
      severity: "warning",
      revision: 1,
      impact: "OpenRouter sends `: OPENROUTER PROCESSING` comment lines while routing; the docs warn hand parsers must skip them. A loop that JSON.parses every data-bearing line crashes mid-generation.",
      why: "SSE keep-alive comments start with `:` and are legal on any stream, but OpenRouter sends them as a matter of course during provider routing — a naive `split(\"\\n\")` + JSON.parse loop meets one on the first slow request.",
      fix: "Skip comment lines before parsing: `if (line.startsWith(\":\")) continue;` — or use an SDK stream helper that handles SSE framing.",
      claim: "A hand-rolled SSE loop that does not skip colon-prefixed comment lines.",
      lookalikes: ["SDK stream helpers handling SSE framing"],
    },
    {
      id: "missing-abort-signal",
      description: "An OpenRouter request is sent without an AbortSignal, so cancellation keeps billing",
      severity: "warning",
      revision: 1,
      impact: "For non-streaming requests and several providers (Bedrock, Groq, Google, Mistral, Replicate, …) the docs are explicit: aborting without a signal means 'the model will continue processing and you will be billed for the complete response'.",
      why: "Cancellation stops processing and billing only when the connection is actually aborted. No signal, no abort — the user who navigates away still pays for the full completion.",
      fix: "Thread an AbortController through: `fetch(url, { ..., signal: controller.signal })`, and abort it on cancellation, navigation, or timeout.",
      claim: "An OpenRouter fetch (same-line marker) with no AbortSignal.",
      lookalikes: ["multi-line fetch with the URL on the next line"],
    },
    {
      id: "retry-after-ignored",
      description: "A retry loop around an OpenRouter call never reads the Retry-After header",
      severity: "warning",
      revision: 1,
      impact: "429 and 503 responses carry Retry-After, and raw fetch gets no SDK backoff — immediate retries thundering-herd into the same limit and can exhaust the daily caps on :free variants (20 RPM / 50–1000 RPD).",
      why: "The official SDKs honor Retry-After automatically; hand-rolled catch-and-retry loops don't. The header is the only backoff signal a raw fetch client receives.",
      fix: "Read the header and wait: `const wait = Number(res.headers.get(\"retry-after\") ?? 1); await sleep(wait * 1000);` before retrying.",
      claim: "A retry loop around an OpenRouter call that never reads Retry-After.",
      lookalikes: ["SDK-managed backoff"],
    },
    {
      id: "hardcoded-dated-model-slug",
      description: "A dated model slug is hardcoded where a maintained alias would survive provider removals",
      severity: "info",
      revision: 1,
      impact: "Model availability is separate from API versioning — the docs state models are added and removed by providers independently, and a removed slug starts returning 404s with zero code changes around it.",
      why: "OpenRouter maintains ~family-latest aliases and per-slug routing variants (:nitro, :floor, :free). A versioned slug is sometimes a deliberate reproducibility pin — this is advice to pin consciously, not a defect.",
      fix: "Prefer `~author/family-latest` aliases or read slugs from config; if the pin is deliberate, keep it and note why.",
      claim: "A dated model slug hardcoded \u2014 advice to pin consciously, at info.",
      lookalikes: ["~family-latest aliases", "slugs read from config"],
    },
  ],
};

export async function doctor(ctx) {
  const files = await ctx.files.list([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
  for (const file of files) {
    // Fixture sandboxes are doctor test data, not target source.
    if (/\.fixtures\.mjs$/.test(file)) continue;
    const raw = await ctx.files.read(file);
    if (!/openrouter/i.test(raw)) continue;
    const rawLines = raw.split("\n");
    const masked = ctx.files.readMasked(file);
    const lines = masked.split("\n");

    checkMidstreamErrors(ctx, file, lines);
    checkSseComments(ctx, file, rawLines, lines);
    checkAbortSignal(ctx, file, rawLines, lines);
    checkRetryAfter(ctx, file, rawLines, lines);
    checkDatedSlugs(ctx, file, rawLines);
  }
}

// A 200-OK stream can carry its failure as the first and only event; flag
// delta consumption in a file that never looks for the error shape.
function checkMidstreamErrors(ctx, file, lines) {
  const handlesErrors = /\bfinish_reason\b|\.\s*error\b|chunk\s*\.\s*error|\.error\s*[?){,:;]/.test(lines.join("\n"));
  for (let i = 0; i < lines.length; i++) {
    if (!/(?:delta\s*\.\s*content|choices\s*\[\s*\d+\s*\]\s*\.\s*delta)/.test(lines[i])) continue;
    if (!handlesErrors) {
      ctx.report.finding({ rule: "midstream-error-ignored", file, line: i + 1 });
    }
    return;
  }
}

// Hand-rolled SSE framing: data-line handling plus JSON.parse, but no
// guard for `:` keep-alive comments. Structure is read from the masked
// source; the data/guard signals live inside strings, so those come from
// the raw text.
function checkSseComments(ctx, file, rawLines, lines) {
  const masked = lines.join("\n");
  const raw = rawLines.join("\n");
  const manualSse = /\bgetReader\s*\(/.test(masked) || /split\s*\(\s*["']\\n["']\s*\)/.test(raw);
  if (!manualSse) return;
  if (!/\bdata:\s/.test(raw) && !/startsWith\s*\(\s*["']data:/.test(raw)) return;
  if (/startsWith\s*\(\s*["']:["']/.test(raw)) return;
  for (let i = 0; i < lines.length; i++) {
    if (/\bJSON\s*\.\s*parse\s*\(/.test(lines[i])) {
      ctx.report.finding({ rule: "sse-comment-parse-crash", file, line: i + 1 });
      return;
    }
  }
}

// An openrouter fetch whose own statement passes no signal.
function checkAbortSignal(ctx, file, rawLines, lines) {
  for (let i = 0; i < lines.length; i++) {
    if (!/\bfetch\s*\(/.test(lines[i])) continue;
    if (!/openrouter/i.test(rawLines[i])) continue;
    const chain = statementAt(lines, i);
    if (!/\bsignal\b/.test(chain)) {
      ctx.report.finding({ rule: "missing-abort-signal", file, line: i + 1 });
    }
  }
}

// Retry evidence around an openrouter call, with no Retry-After handling
// anywhere in the file. The call test is masked (code shape) paired with
// the raw line for openrouter context — strings alone must not count.
function checkRetryAfter(ctx, file, rawLines, lines) {
  const raw = rawLines.join("\n");
  const callsOpenRouter = rawLines.some((l, i) => /openrouter/i.test(l) && /\bfetch\s*\(/.test(lines[i]));
  if (!callsOpenRouter) return;
  const retries = /\b(?:retry|retries|attempt|maxAttempts|backoff)\b/i.test(raw);
  if (!retries) return;
  if (/retry-after/i.test(raw)) return;
  for (let i = 0; i < lines.length; i++) {
    if (/\bcatch\b/.test(lines[i])) {
      ctx.report.finding({ rule: "retry-after-ignored", file, line: i + 1 });
      return;
    }
  }
}

// Quoted vendor/model-version slugs; ~aliases and URLs are fine.
function checkDatedSlugs(ctx, file, rawLines) {
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (/openrouter\.ai|api\/v1|https?:|~/.test(line)) continue;
    const m = /["']([a-z0-9][a-z0-9.-]*\/[a-z0-9._-]*\d[a-z0-9._-]*)["']/.exec(line);
    if (m && /[a-z]/.test(m[1].split("/")[0])) {
      ctx.report.finding({ rule: "hardcoded-dated-model-slug", file, line: i + 1 });
    }
  }
}

// Gather the full statement containing line i (chains wrap across lines).
function statementAt(lines, i) {
  let start = i;
  while (start > 0 && !statementEnds(lines[start - 1])) start--;
  let end = i;
  while (end < lines.length - 1 && !statementEnds(lines[end])) end++;
  return lines.slice(start, end + 1).join("\n");
}

function statementEnds(line) {
  const bare = line.trim();
  if (bare.startsWith("//") || bare.startsWith("*") || bare.startsWith("/*")) return true;
  if (/\b(?:return|await|const|let|var|export|throw)\b.*[;)]\s*$/.test(bare) && !/[.(,+]$/.test(bare)) return true;
  return /;\s*(\/\/.*)?$/.test(bare);
}


