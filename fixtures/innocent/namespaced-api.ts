// A same-named method on an unrelated namespace (chromeApi.tabs.query, not
// a Convex function definition).
interface Tab { url: string }

export function activeTab(resolve: (t: Tab | null) => void, chromeApi: { tabs: { query: (q: object, cb: (tabs: Tab[]) => void) => void } }) {
  chromeApi.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    resolve(tabs[0] ?? null);
  });
}
