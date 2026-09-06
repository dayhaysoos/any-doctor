export const fixtures = [
  {
    name: "reports an app API route without an auth middleware import",
    seed: {
      "src/app/api/users/route.ts": `export async function GET() {
  return Response.json([]);
}`,
    },
    expected: [{ file: "src/app/api/users/route.ts", line: 1 }],
  },
  {
    name: "reports a pages API route without an auth middleware import",
    seed: {
      "src/pages/api/account.js": `export default function handler(request, response) {
  response.status(200).json({ ok: true });
}`,
    },
    expected: [{ file: "src/pages/api/account.js", line: 1 }],
  },
  {
    name: "allows a route with a named auth middleware import",
    seed: {
      "src/app/api/private/route.ts": `import { requireUser } from "@/middleware/auth";

export async function GET(request) {
  return Response.json({ user: await requireUser(request) });
}`,
    },
    expected: [],
  },
  {
    name: "allows a side-effect auth import with single quotes",
    seed: {
      "src/pages/api/session.ts": `import '../auth';

export default function handler(request, response) {
  response.status(204).end();
}`,
    },
    expected: [],
  },
  {
    name: "does not treat an auth-looking comment as an import",
    seed: {
      "src/app/api/status/route.ts": `// import { requireUser } from '@/middleware/auth';
export async function GET() {
  return Response.json({ status: "ok" });
}`,
    },
    expected: [{ file: "src/app/api/status/route.ts", line: 1 }],
  },
  {
    name: "does not inspect non-API modules with auth-looking code",
    seed: {
      "src/components/auth-card.tsx": `export function AuthCard() {
  return <div>API route</div>;
}`,
    },
    expected: [],
  },
];
