/** Compare confirmed tile snapshots without guessing unseen game actions. */
export interface HandDelta {
  added: string[];
  removed: string[];
  kind: 'draw' | 'discard' | 'unchanged' | 'ambiguous';
}

export const compareHandSnapshots = (before: string[], after: string[]): HandDelta => {
  const counts = new Map<string, number>();
  for (const key of before) counts.set(key, (counts.get(key) ?? 0) - 1);
  for (const key of after) counts.set(key, (counts.get(key) ?? 0) + 1);
  const added: string[] = [];
  const removed: string[] = [];
  for (const [key, count] of counts) {
    for (let i = 0; i < Math.abs(count); i++) (count > 0 ? added : removed).push(key);
  }
  const kind: HandDelta['kind'] =
    before.length === 13 && after.length === 14 && added.length === 1 && removed.length === 0 ? 'draw' :
    before.length === 14 && after.length === 13 && removed.length === 1 && added.length === 0 ? 'discard' :
    before.length === after.length && !added.length && !removed.length ? 'unchanged' : 'ambiguous';
  return { added, removed, kind };
};
