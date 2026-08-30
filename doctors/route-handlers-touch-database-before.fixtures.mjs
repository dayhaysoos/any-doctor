export const fixtures = [
  {
    name: "reports a database query before authentication in an exported route handler",
    seed: {
      "src/users/route.ts": `export async function GET(request) {
  const users = await prisma.user.findMany();
  const user = await requireUser(request);
  return Response.json(users);
}`,
    },
    expected: [{ file: "src/users/route.ts", line: 2 }],
  },
  {
    name: "reports only the first database touch before authentication",
    seed: {
      "src/orders/route.ts": `export const POST = async (request) => {
  const order = await db.orders.findFirst();
  await database.audit.insert({ action: 'view' });
  const user = await requireUser(request);
  return Response.json(order);
};`,
    },
    expected: [{ file: "src/orders/route.ts", line: 2 }],
  },
  {
    name: "reports an Express handler with authentication after its query",
    seed: {
      "src/server.ts": `router.get('/accounts', async (request, response) => {
  const accounts = await database.account.findMany();
  const user = await requireUser(request);
  response.json(accounts);
});`,
    },
    expected: [{ file: "src/server.ts", line: 2 }],
  },
  {
    name: "allows a database query after requireUser",
    seed: {
      "src/profile/route.ts": `export async function GET(request) {
  const user = await requireUser(request);
  return Response.json(await prisma.profile.findUnique({ where: { id: user.id } }));
}`,
    },
    expected: [],
  },
  {
    name: "ignores database-looking text in comments and strings",
    seed: {
      "src/health/route.ts": `export async function GET(request) {
  // prisma.user.findMany() must only run after requireUser(request)
  const example = "db.orders.findFirst()";
  const user = await requireUser(request);
  return Response.json({ example, user });
}`,
    },
    expected: [],
  },
];
