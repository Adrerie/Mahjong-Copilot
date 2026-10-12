import { GameMode, Tile, Meld, Suit } from '../types';
import { countTiles, countsToArray, indexToTile } from './tileHelpers';
import { checkWinning, KNITTED_GROUPS, KNITTED_PERMUTATIONS } from './winningChecker';

// Enumerate melds, incomplete groups, the pair, and unused tiles.
const standardShanten = (input: number[], existing: number): number => {
  const tiles = [...input];
  const limit = 4 - existing;
  const memo = new Map<string, number>();
  const search = (melds: number, groups: number, pair: number): number => {
    const key = `${tiles.join(',')}|${melds}|${groups}|${pair}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const first = tiles.findIndex(c => c > 0);
    let best = 8 - 2 * (existing + melds) - Math.min(groups, limit - melds) - pair;
    if (first < 0) return best;
    const take = (indices: number[], m: number, g: number, p: number) => {
      for (const i of indices) tiles[i]--;
      best = Math.min(best, search(m, g, p));
      for (const i of indices) tiles[i]++;
    };
    if (melds < limit) {
      if (tiles[first] >= 3) take([first, first, first], melds + 1, groups, pair);
      if (first < 27 && first % 9 <= 6 && tiles[first + 1] && tiles[first + 2]) take([first, first + 1, first + 2], melds + 1, groups, pair);
    }
    if (tiles[first] >= 2) {
      if (!pair) take([first, first], melds, groups, 1);
      if (groups < limit) take([first, first], melds, groups + 1, pair);
    }
    if (groups < limit && first < 27) {
      if (first % 9 <= 7 && tiles[first + 1]) take([first, first + 1], melds, groups + 1, pair);
      if (first % 9 <= 6 && tiles[first + 2]) take([first, first + 2], melds, groups + 1, pair);
    }
    take([first], melds, groups, pair);
    memo.set(key, best);
    return best;
  };
  return Math.max(0, search(0, 0, 0));
};

export const calculateQiDuiShanten = (tiles: number[]): number =>
  6 - tiles.reduce((pairs, count) => pairs + Math.floor(count / 2), 0);

export const calculateKokushiShanten = (tiles: number[]): number => {
  const indices = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  return 13 - indices.filter(i => tiles[i] > 0).length - Number(indices.some(i => tiles[i] >= 2));
};

/**
 * 不靠（全不靠/七星不靠）与组合龙的向听。
 * 向听 = 最终暗手张数 − 能固定进最终牌型的牌张数 − 1。
 * 13张与待弃牌的14张使用同一基准，不把多出的待弃牌误算成一次摸牌。
 * 吃碰杠是锁定面子：不靠不允许副露，组合龙最多一副副露（顶掉那副顺子/刻子）。
 */
const knittedSpecialShanten = (tiles: number[], melds: Meld[]): number | null => {
  const locked = countsToArray(countTiles(melds.flatMap(meld => meld.tiles)));
  const distance = (matched: number) => 13 - melds.length * 3 - matched;
  let best: number | null = null;
  const keep = (value: number) => { best = best === null ? value : Math.min(best, value); };

  // 不靠：三色各取 147/258/369 中的一组，张张不同，加七种字牌（不允许副露）。
  if (melds.length === 0) {
    const honors = tiles.slice(27).filter(count => count > 0).length;
    const numbers = KNITTED_PERMUTATIONS.reduce((bestNumbers, permutation) => Math.max(bestNumbers,
      [0, 1, 2].reduce((matched, suit) => matched +
        KNITTED_GROUPS[permutation[suit]].filter(offset => tiles[suit * 9 + offset] > 0).length, 0)), 0);
    keep(distance(numbers + honors));
  }

  // 组合龙：三色分别凑齐 147/258/369 共 9 张，其余是一副面子加一对将（最多一副副露）。
  if (melds.length <= 1) {
    const needSet = melds.length === 0;
    for (const permutation of KNITTED_PERMUTATIONS) {
      const rest = [...tiles];
      const required = new Array<number>(34).fill(0);
      let matched = 0;
      permutation.forEach((group, suit) =>
        KNITTED_GROUPS[group].forEach(offset => {
          required[suit * 9 + offset] = 1;
          if (rest[suit * 9 + offset] > 0) { rest[suit * 9 + offset] -= 1; matched += 1; }
        }));
      for (let pair = 0; pair < 34; pair++) {
        if (locked[pair] + required[pair] + 2 > 4) continue;
        const afterPair = [...rest];
        const pairMatched = Math.min(2, afterPair[pair]);
        afterPair[pair] -= pairMatched;
        let setMatched = 0;
        if (needSet) {
          for (let index = 0; index < 34; index++) {
            if (index !== pair && locked[index] + required[index] + 3 <= 4) {
              setMatched = Math.max(setMatched, Math.min(3, afterPair[index]));
            }
          }
          for (let suit = 0; suit < 3; suit++) {
            for (let offset = 0; offset <= 6; offset++) {
              const run = [suit * 9 + offset, suit * 9 + offset + 1, suit * 9 + offset + 2];
              if (run.some(index => locked[index] + required[index] + (index === pair ? 2 : 0) + 1 > 4)) continue;
              setMatched = Math.max(setMatched, run.filter(index => afterPair[index] > 0).length);
            }
          }
        }
        keep(distance(matched + pairMatched + setMatched));
      }
    }
  }
  return best === null ? null : Math.max(0, best);
};

export const calculateShanten = (hand: Tile[], melds: Meld[], mode: GameMode = GameMode.MCR): number => {
  if (melds.length > 4) return 8;
  const tiles = countsToArray(countTiles(hand));
  if (checkWinning(tiles, melds.length, mode)) return -1;
  // 国标不靠与组合龙已支持和牌，但不在标准/七对/十三幺向听公式里。
  // 对完整的13张等效牌做一次实际补张判和，避免「已听牌却显示6向听」。
  if (mode === GameMode.MCR && hand.length + melds.length * 3 === 13) {
    const used = countsToArray(countTiles([...hand, ...melds.flatMap(meld => meld.tiles)]));
    for (let i = 0; i < 34; i++) {
      if (used[i] >= 4) continue;
      tiles[i]++;
      const completes = checkWinning(tiles, melds.length, mode);
      tiles[i]--;
      if (completes) return 0;
    }
  }
  let result = standardShanten(tiles, melds.length);
  if (melds.length === 0) {
    result = Math.min(result, Math.max(0, calculateQiDuiShanten(tiles)));
    if (mode === GameMode.MCR) result = Math.min(result, Math.max(0, calculateKokushiShanten(tiles)));
  }
  // 13 张以外的特殊型距离：不靠与组合龙按固定牌张数算，不再退回常规向听近似。
  if (mode === GameMode.MCR) {
    const knitted = knittedSpecialShanten(tiles, melds);
    if (knitted !== null) result = Math.min(result, knitted);
  }
  return result;
};

export const calculateWaitingTiles = (hand: Tile[], melds: Meld[], mode: GameMode = GameMode.MCR, voidSuit: Suit | null = null): Tile[] => {
  const waiting: Tile[] = [];
  const tiles = countsToArray(countTiles(hand));
  const used = countsToArray(countTiles([...hand, ...melds.flatMap(m => m.tiles)]));
  for (let i = 0; i < (mode === GameMode.Sichuan ? 27 : 34); i++) {
    if (used[i] >= 4) continue;
    const tile = indexToTile(i);
    if (mode === GameMode.Sichuan && (tile.suit === voidSuit || hand.some(t => t.suit === voidSuit))) continue;
    tiles[i]++;
    if (checkWinning(tiles, melds.length, mode)) waiting.push(tile);
    tiles[i]--;
  }
  return waiting;
};
