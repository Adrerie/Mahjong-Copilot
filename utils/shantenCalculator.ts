import { GameMode, Tile, Meld, Suit } from '../types';
import { countTiles, countsToArray, indexToTile } from './tileHelpers';
import { checkWinning } from './winningChecker';

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

export const calculateShanten = (hand: Tile[], melds: Meld[], mode: GameMode = GameMode.MCR): number => {
  if (melds.length > 4) return 8;
  const tiles = countsToArray(countTiles(hand));
  if (checkWinning(tiles, melds.length, mode)) return -1;
  let result = standardShanten(tiles, melds.length);
  if (melds.length === 0) {
    result = Math.min(result, Math.max(0, calculateQiDuiShanten(tiles)));
    if (mode === GameMode.MCR) result = Math.min(result, Math.max(0, calculateKokushiShanten(tiles)));
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
