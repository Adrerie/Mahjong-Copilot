/**
 * 弃牌分析模块
 * - 计算最优弃牌
 * - 进张计算
 */

import { Tile, Meld, Language } from '../types';
import { TEXT } from '../constants';
import { getUniqueTiles, tileToIndex, indexToTile } from './tileHelpers';
import { calculateShanten, calculateWaitingTiles } from './shantenCalculator';

interface DiscardOption {
  tile: Tile;
  shanten: number;
  waitCount: number; // 听牌时的待牌数量
  ukeire: number; // 进张总数 (所有有效牌的剩余张数之和)
  ukeireTiles: number; // 进张种类数
  waitingTiles: Tile[]; // 打出后的听牌列表
}

// 计算最优弃牌
export const calculateBestDiscard = (
  hand: Tile[], 
  melds: Meld[], 
  discards: Tile[], 
  lang: Language
): { tile: Tile, reason: string, ukeire: number, ukeireTiles: number, waitingTiles: Tile[] } | undefined => {
  if (hand.length === 0) return undefined;
  
  const t = TEXT[lang];
  
  // 只有14张牌时才需要计算弃牌
  if (hand.length !== 14) return undefined;
  
  const uniqueTiles = getUniqueTiles(hand);
  
  // 统计所有已知牌（手牌+副露+牌河）中每种牌的数量
  const usedCounts: number[] = new Array(34).fill(0);
  for (const h of hand) {
    const idx = tileToIndex(h);
    if (idx >= 0 && idx < 34) usedCounts[idx]++;
  }
  for (const m of melds) {
    for (const tile of m.tiles) {
      const idx = tileToIndex(tile);
      if (idx >= 0 && idx < 34) usedCounts[idx]++;
    }
  }
  // 牌河中的牌也要计入已用
  for (const d of discards) {
    const idx = tileToIndex(d);
    if (idx >= 0 && idx < 34) usedCounts[idx]++;
  }
  
  const options: DiscardOption[] = [];
  
  for (const tile of uniqueTiles) {
    // 构建打出这张牌后的手牌
    const newHand: Tile[] = [];
    let removed = false;
    for (const h of hand) {
      if (!removed && h.suit === tile.suit && h.value === tile.value) {
        removed = true;
        continue;
      }
      newHand.push(h);
    }
    
    // 计算打出后的向听数
    const newShanten = calculateShanten(newHand, melds);
    
    // 计算进张 (有效牌)
    // 进张是指摸到后能减少向听数的牌
    let ukeire = 0;
    let ukeireTiles = 0;
    
    // 遍历所有34种牌，看哪些能让向听数减少
    for (let i = 0; i < 34; i++) {
      // 这张牌已经被使用的数量（扣除即将打出的那张）
      const used = usedCounts[i] - (tileToIndex(tile) === i ? 1 : 0);
      // 剩余数量 (每种牌最多4张)
      const remaining = 4 - used;
      if (remaining <= 0) continue;
      
      // 模拟摸到这张牌
      const testHand = [...newHand, indexToTile(i)];
      const shantenAfter = calculateShanten(testHand, melds);
      
      // 如果向听数减少了，这是有效牌
      if (shantenAfter < newShanten) {
        ukeireTiles++;
        ukeire += remaining;
      }
    }
    
    // 如果是听牌，计算待牌列表
    let waitCount = 0;
    let waitingTiles: Tile[] = [];
    if (newShanten === 0) {
      waitingTiles = calculateWaitingTiles(newHand, melds);
      waitCount = waitingTiles.length;
    }
    
    options.push({
      tile,
      shanten: newShanten,
      waitCount,
      ukeire,
      ukeireTiles,
      waitingTiles
    });
  }
  
  // 排序: 优先向听数最低，其次进张总数最多，最后待牌数最多
  options.sort((a, b) => {
    if (a.shanten !== b.shanten) return a.shanten - b.shanten;
    if (a.ukeire !== b.ukeire) return b.ukeire - a.ukeire;
    return b.waitCount - a.waitCount;
  });
  
  if (options.length === 0) return undefined;
  
  const best = options[0];
  return { 
    tile: best.tile, 
    reason: t.discardHint,
    ukeire: best.ukeire,
    ukeireTiles: best.ukeireTiles,
    waitingTiles: best.waitingTiles
  };
};
