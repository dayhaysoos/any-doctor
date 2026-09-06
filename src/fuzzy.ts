export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 1;
  let qi = 0;
  let score = 0;
  let streak = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      streak++;
      const boundary = ti === 0 || /[\W_]/.test(t[ti - 1] ?? "");
      score += 2 + streak + (boundary ? 4 : 0);
      qi++;
    } else {
      streak = 0;
    }
  }
  return qi === q.length ? score : 0;
}

export function fuzzyFilter<T>(items: T[], textOf: (item: T) => string, query: string): T[] {
  if (!query.trim()) return items;
  return items
    .map(item => ({ item, score: fuzzyScore(query.trim(), textOf(item)) }))
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(e => e.item);
}
