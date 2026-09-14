// metrics.anydoctor.dev/count — anonymous run counters for any-doctor.
//
// Accepts one POST per run: { v: "0.1.2", doctors: ["async", ...], custom: 2 }
// Increments per-day, per-key rows in D1. Bundled doctor ids arrive as
// keys; custom (user-authored) doctors arrive only as one aggregate
// count under "_custom" — the CLI never sends their names.
//
// Defense: strict shape checks and id syntax (^[a-z0-9-]{1,40}$), small
// caps on array sizes. Anything else is a 400. GET is a 405 health
// probe's mirror — this endpoint only counts, it never answers with
// data (query D1 directly via the dashboard instead).

const ID_RE = /^[a-z0-9-]{1,40}$/;

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response(null, { status: 405 });
    const url = new URL(request.url);
    if (url.pathname !== "/count") return new Response(null, { status: 404 });

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(null, { status: 400 });
    }

    const rawIds = Array.isArray(body?.doctors) ? body.doctors : [];
    if (rawIds.length > 32) return new Response(null, { status: 400 });
    const ids = rawIds.filter((k) => typeof k === "string" && ID_RE.test(k));
    if (ids.length !== rawIds.length) return new Response(null, { status: 400 });
    const custom = body?.custom;
    if (custom !== undefined && (!Number.isInteger(custom) || custom < 0 || custom > 32)) {
      return new Response(null, { status: 400 });
    }
    if (typeof body?.v !== "string" || body.v.length > 20) {
      return new Response(null, { status: 400 });
    }
    if (ids.length === 0 && !custom) return new Response(null, { status: 204 });

    const day = new Date().toISOString().slice(0, 10);
    const upsert = (key, n) =>
      env.DB.prepare(
        "INSERT INTO counts (day, key, n) VALUES (?, ?, ?) " +
        "ON CONFLICT (day, key) DO UPDATE SET n = n + excluded.n",
      ).bind(day, key, n);

    const statements = ids.map((k) => upsert(k, 1));
    if (custom) statements.push(upsert("_custom", custom));
    await env.DB.batch(statements);
    return new Response(null, { status: 204 });
  },
};
