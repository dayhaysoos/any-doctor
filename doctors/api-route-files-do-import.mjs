export const meta = {
  id: "api-route-files-do-import",
  description: "API route file does not import auth middleware.",
  severity: "warning",
  blindSpots: [
    "Identifies API route files only by an api path segment, so unconventional route locations are not checked and non-route modules within an api directory can be reported.",
    "Recognizes auth middleware only through static ES module import specifiers containing auth or middleware; aliases, dynamic imports, re-exports, and middleware applied by framework configuration are not recognized.",
    "Cannot determine whether an imported auth or middleware module actually protects the route at runtime.",
  ],
};

const apiDirectory = /(?:^|\/)api(?:\/|$)/;
const authMiddlewareImport = /^\s*import\s*(?:[\s\S]*?\sfrom\s*)?["']([^"']*(?:auth|middleware)[^"']*)["']\s*;?/gim;

export async function doctor(ctx) {
  for (const file of await ctx.files.list()) {
    if (!apiDirectory.test(file)) continue;

    const source = await ctx.files.read(file);
    authMiddlewareImport.lastIndex = 0;

    if (!authMiddlewareImport.test(source)) {
      ctx.report.finding({ file, line: 1 });
    }
  }
}
