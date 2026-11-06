/** 幅を等分したとき、となり合う位置。同じ枚数の同じ位置は除く。 */
export function adjacentIndexes(prevCount: number, prevIndex: number, nextCount: number): number[] {
  const a0 = prevIndex / prevCount;
  const a1 = (prevIndex + 1) / prevCount;
  const allowed: number[] = [];
  for (let j = 0; j < nextCount; j++) {
    const b0 = j / nextCount;
    const b1 = (j + 1) / nextCount;
    const touches = b0 <= a1 + 1e-9 && b1 >= a0 - 1e-9;
    if (!touches) continue;
    if (prevCount === nextCount && j === prevIndex) continue;
    allowed.push(j);
  }
  return allowed;
}

/** 手前の列から奥へ、緑を1つずつ。次の緑は前の緑のとなりだけ。 */
export function buildPass(counts: number[], rng: () => number): number[] {
  const greens: number[] = [];
  for (let i = 0; i < counts.length; i++) {
    const options =
      i === 0
        ? Array.from({ length: counts[i] }, (_, index) => index)
        : adjacentIndexes(counts[i - 1], greens[i - 1] ?? 0, counts[i]);
    if (options.length === 0) {
      greens.push(0);
      continue;
    }
    const pick = Math.min(options.length - 1, Math.floor(rng() * options.length));
    greens.push(options[Math.max(0, pick)]);
  }
  return greens;
}
