/**
 * 牌的基础工具函数
 * - 排序、计数、索引转换等
 */

import { Suit, Tile } from '../types';
import { createTile, getTileKey } from '../constants';

// 牌排序
export const sortTiles = (tiles: Tile[]): Tile[] => {
  const suitOrder = { [Suit.Man]: 1, [Suit.Pin]: 2, [Suit.Sou]: 3, [Suit.Zihai]: 4 };
  return [...tiles].sort((a, b) => {
    if (a.suit !== b.suit) return suitOrder[a.suit] - suitOrder[b.suit];
    return a.value - b.value;
  });
};

// 统计牌数量
export const countTiles = (tiles: Tile[]): Map<string, number> => {
  const counts = new Map<string, number>();
  tiles.forEach(t => {
    const key = getTileKey(t.suit, t.value);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
};

// 将 Map<string, number> 转为 34 长度数组 (用于向听数计算)
export const countsToArray = (counts: Map<string, number>): number[] => {
  const arr = new Array(34).fill(0);
  counts.forEach((count, key) => {
    const idx = tileKeyToIndex(key);
    if (idx >= 0 && idx < 34) arr[idx] = count;
  });
  return arr;
};

// 牌的 key 转为 0-33 的索引
export const tileKeyToIndex = (key: string): number => {
  const value = parseInt(key[0]);
  const suit = key.slice(1);
  if (suit === 'm') return value - 1;        // 0-8: 1-9万
  if (suit === 'p') return 9 + value - 1;    // 9-17: 1-9筒
  if (suit === 's') return 18 + value - 1;   // 18-26: 1-9条
  if (suit === 'z') return 27 + value - 1;   // 27-33: 字牌
  return -1;
};

// Tile 对象转为 0-33 的索引
export const tileToIndex = (tile: Tile): number => {
  if (tile.suit === Suit.Man) return tile.value - 1;        // 0-8: 1-9万
  if (tile.suit === Suit.Pin) return 9 + tile.value - 1;    // 9-17: 1-9筒
  if (tile.suit === Suit.Sou) return 18 + tile.value - 1;   // 18-26: 1-9条
  if (tile.suit === Suit.Zihai) return 27 + tile.value - 1; // 27-33: 字牌
  return -1;
};

// 索引转为牌
export const indexToTile = (idx: number): Tile => {
  if (idx < 9) return createTile(Suit.Man, idx + 1);
  if (idx < 18) return createTile(Suit.Pin, idx - 9 + 1);
  if (idx < 27) return createTile(Suit.Sou, idx - 18 + 1);
  return createTile(Suit.Zihai, idx - 27 + 1);
};

// 获取某花色的牌数
export const getSuitCount = (tiles: Tile[], suit: Suit) => tiles.filter(t => t.suit === suit).length;

// 获取去重后的牌
export const getUniqueTiles = (tiles: Tile[]) => {
  const seen = new Set<string>();
  const unique: Tile[] = [];
  tiles.forEach(t => {
    const k = getTileKey(t.suit, t.value);
    if (!seen.has(k)) { seen.add(k); unique.push(t); }
  });
  return unique;
};

// 辅助判断函数
export const isHonors = (tile: Tile) => tile.suit === Suit.Zihai;
export const isTerminal = (tile: Tile) => tile.value === 1 || tile.value === 9;
export const isTerminalOrHonor = (tile: Tile) => isHonors(tile) || isTerminal(tile);
export const isSimple = (tile: Tile) => !isHonors(tile) && !isTerminal(tile);
export const isDragon = (tile: Tile) => tile.suit === Suit.Zihai && tile.value >= 5; // 白发中: 5,6,7
export const isWind = (tile: Tile) => tile.suit === Suit.Zihai && tile.value <= 4; // 东南西北: 1,2,3,4

export const isGreen = (tile: Tile) => {
  // 绿一色：23468条 + 发财
  if (tile.suit === Suit.Sou && [2, 3, 4, 6, 8].includes(tile.value)) return true;
  if (tile.suit === Suit.Zihai && tile.value === 6) return true; // 发
  return false;
};

export const isReversible = (tile: Tile) => {
  // 推不倒：1234589筒、245689条、白板
  if (tile.suit === Suit.Pin && [1, 2, 3, 4, 5, 8, 9].includes(tile.value)) return true;
  if (tile.suit === Suit.Sou && [2, 4, 5, 6, 8, 9].includes(tile.value)) return true;
  if (tile.suit === Suit.Zihai && tile.value === 5) return true; // 白
  return false;
};
