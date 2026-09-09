// A throwing QA guard is enforcement, not environment routing.
export function localOnly(siteUrl: string): void {
  if (!siteUrl.startsWith("http://localhost:")) {
    throw new Error("this helper may only run against local deployments");
  }
}
