export interface FuzzyResult<T> {
  item: T;
  score: number;
}

export function fuzzyMatch(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  if (q.length === 0) return 1;
  if (t.includes(q)) return 2 + q.length / t.length;

  let qi = 0;
  let score = 0;
  let lastMatchIndex = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 1;
      if (lastMatchIndex === ti - 1) score += 0.5;
      lastMatchIndex = ti;
      qi++;
    }
  }

  return qi === q.length ? score / t.length : 0;
}

export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
): FuzzyResult<T>[] {
  if (!query.trim()) return items.map((item) => ({ item, score: 1 }));

  return items
    .map((item) => ({ item, score: fuzzyMatch(query, getText(item)) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}
