/**
 * 向听数计算模块
 * - 标准型向听数
 * - 七对向听数
 * - 国士无双向听数
 */

import { Tile, Meld } from '../types';
import { countTiles, countsToArray, indexToTile } from './tileHelpers';
import { checkWinning } from './winningChecker';

// 标准型向听数计算 (递归拆解法)
const calculateStandardShanten = (tiles: number[]): number => {
  let minShanten = 8; // 最大向听数
  
  // 尝试每种可能的雀头
  for (let i = 0; i < 34; i++) {
    if (tiles[i] >= 2) {
      tiles[i] -= 2;
      const shanten = calculateMeldShanten(tiles, 4, 0) - 1; // -1 因为有雀头
      minShanten = Math.min(minShanten, shanten);
      tiles[i] += 2;
    }
  }
  
  // 不要雀头的情况
  const shantenNoHead = calculateMeldShanten(tiles, 4, 0);
  minShanten = Math.min(minShanten, shantenNoHead);
  
  return minShanten;
};

// 计算还需要多少张牌完成 n 个面子
const calculateMeldShanten = (tiles: number[], needMelds: number, currentMelds: number): number => {
  if (needMelds === 0) return 0;
  
  let minShanten = (needMelds - currentMelds) * 2; // 每个面子最多缺2张
  
  // 从第一个有牌的位置开始尝试
  let startIdx = 0;
  for (let i = 0; i < 34; i++) {
    if (tiles[i] > 0) {
      startIdx = i;
      break;
    }
  }
  
  for (let i = startIdx; i < 34; i++) {
    if (tiles[i] === 0) continue;
    
    // 尝试刻子
    if (tiles[i] >= 3) {
      tiles[i] -= 3;
      const shanten = calculateMeldShanten(tiles, needMelds - 1, currentMelds + 1);
      minShanten = Math.min(minShanten, shanten);
      tiles[i] += 3;
    }
    
    // 尝试顺子 (只对数牌有效, 且不能是8,9结尾)
    if (i < 27 && i % 9 <= 6) {
      if (tiles[i] >= 1 && tiles[i + 1] >= 1 && tiles[i + 2] >= 1) {
        tiles[i]--; tiles[i + 1]--; tiles[i + 2]--;
        const shanten = calculateMeldShanten(tiles, needMelds - 1, currentMelds + 1);
        minShanten = Math.min(minShanten, shanten);
        tiles[i]++; tiles[i + 1]++; tiles[i + 2]++;
      }
    }
    
    // 如果这个位置有牌但无法组成面子，计算搭子
    if (tiles[i] >= 2) {
      // 对子搭子 (差1张成刻)
      tiles[i] -= 2;
      const shanten = calculateMeldShanten(tiles, needMelds - 1, currentMelds) + 1;
      minShanten = Math.min(minShanten, shanten);
      tiles[i] += 2;
    }
    
    // 两面/嵌张搭子
    if (i < 27 && i % 9 <= 7) {
      if (tiles[i] >= 1 && tiles[i + 1] >= 1) {
        tiles[i]--; tiles[i + 1]--;
        const shanten = calculateMeldShanten(tiles, needMelds - 1, currentMelds) + 1;
        minShanten = Math.min(minShanten, shanten);
        tiles[i]++; tiles[i + 1]++;
      }
    }
    if (i < 27 && i % 9 <= 6) {
      if (tiles[i] >= 1 && tiles[i + 2] >= 1) {
        tiles[i]--; tiles[i + 2]--;
        const shanten = calculateMeldShanten(tiles, needMelds - 1, currentMelds) + 1;
        minShanten = Math.min(minShanten, shanten);
        tiles[i]++; tiles[i + 2]++;
      }
    }
    
    break; // 只从第一个有牌的位置处理，避免重复
  }
  
  return minShanten;
};

// 七对向听数
export const calculateQiDuiShanten = (tiles: number[]): number => {
  let pairs = 0;
  let singles = 0;
  for (let i = 0; i < 34; i++) {
    pairs += Math.floor(tiles[i] / 2);
    singles += tiles[i] % 2;
  }
  // 七对需要7对，向听数 = 6 - 对子数 + 多余的单张调整
  return 6 - pairs + Math.max(0, singles - (7 - pairs));
};

// 国士无双向听数
export const calculateKokushiShanten = (tiles: number[]): number => {
  // 需要的牌: 1万9万1筒9筒1条9条 + 东南西北中发白 (共13种)
  const kokushiIndices = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  let count = 0;
  let hasPair = false;
  
  for (const idx of kokushiIndices) {
    if (tiles[idx] >= 1) count++;
    if (tiles[idx] >= 2) hasPair = true;
  }
  
  // 向听数 = 13 - 有的种类数 - (有对子 ? 1 : 0)
  return 13 - count - (hasPair ? 1 : 0);
};

// 简化的面子向听数计算 - 使用优化的贪心算法
const calcMinShanten = (tiles: number[], needMelds: number): number => {
  // 尝试多种拆解顺序，取最优
  const results: number[] = [];
  
  // 方法1: 先刻子后顺子
  results.push(calcShantenGreedy([...tiles], needMelds, 'pung_first'));
  
  // 方法2: 先顺子后刻子
  results.push(calcShantenGreedy([...tiles], needMelds, 'chow_first'));
  
  return Math.min(...results);
};

// 贪心计算向听数
const calcShantenGreedy = (tiles: number[], needMelds: number, order: 'pung_first' | 'chow_first'): number => {
  let melds = 0;
  let taatsu = 0;
  
  if (order === 'pung_first') {
    // 先取刻子
    for (let i = 0; i < 34; i++) {
      while (tiles[i] >= 3 && melds < needMelds) {
        tiles[i] -= 3;
        melds++;
      }
    }
    // 再取顺子
    for (let i = 0; i < 27; i++) {
      if (i % 9 > 6) continue;
      while (tiles[i] >= 1 && tiles[i + 1] >= 1 && tiles[i + 2] >= 1 && melds < needMelds) {
        tiles[i]--; tiles[i + 1]--; tiles[i + 2]--;
        melds++;
      }
    }
  } else {
    // 先取顺子
    for (let i = 0; i < 27; i++) {
      if (i % 9 > 6) continue;
      while (tiles[i] >= 1 && tiles[i + 1] >= 1 && tiles[i + 2] >= 1 && melds < needMelds) {
        tiles[i]--; tiles[i + 1]--; tiles[i + 2]--;
        melds++;
      }
    }
    // 再取刻子
    for (let i = 0; i < 34; i++) {
      while (tiles[i] >= 3 && melds < needMelds) {
        tiles[i] -= 3;
        melds++;
      }
    }
  }
  
  // 计算搭子
  const maxTaatsu = needMelds - melds;
  
  // 对子搭子
  for (let i = 0; i < 34 && taatsu < maxTaatsu; i++) {
    while (tiles[i] >= 2 && taatsu < maxTaatsu) {
      tiles[i] -= 2;
      taatsu++;
    }
  }
  
  // 两面搭子 (优先于嵌张)
  for (let i = 0; i < 27 && taatsu < maxTaatsu; i++) {
    if (i % 9 > 7) continue;
    while (tiles[i] >= 1 && tiles[i + 1] >= 1 && taatsu < maxTaatsu) {
      tiles[i]--; tiles[i + 1]--;
      taatsu++;
    }
  }
  
  // 嵌张搭子
  for (let i = 0; i < 27 && taatsu < maxTaatsu; i++) {
    if (i % 9 > 6) continue;
    while (tiles[i] >= 1 && tiles[i + 2] >= 1 && taatsu < maxTaatsu) {
      tiles[i]--; tiles[i + 2]--;
      taatsu++;
    }
  }
  
  // 向听数公式: (需要的面子 - 已有面子) * 2 - 搭子数 - 1
  const remaining = needMelds - melds;
  return Math.max(-1, remaining * 2 - taatsu - 1);
};

// 综合向听数计算
export const calculateShanten = (hand: Tile[], melds: Meld[]): number => {
  if (hand.length === 0 && melds.length === 0) return 8;
  
  const handCounts = countTiles(hand);
  const tiles = countsToArray(handCounts);
  
  // 已有的面子数
  const existingMelds = melds.length;
  
  // 手牌总数
  const handTotal = tiles.reduce((a, b) => a + b, 0);
  
  // 计算手牌需要形成的面子数
  const needMelds = 4 - existingMelds;
  
  // 首先检查是否已经和牌 (14张牌时)
  if (handTotal === needMelds * 3 + 2) {
    if (checkWinning(tiles, existingMelds)) {
      return -1; // 已和牌
    }
  }
  
  // 标准型向听数
  let standardShanten = 8;
  
  // 方法1: 以某张牌为雀头，计算剩余牌的面子向听数
  for (let head = 0; head < 34; head++) {
    if (tiles[head] >= 2) {
      const tempTiles = [...tiles];
      tempTiles[head] -= 2;
      const shanten = calcMinShanten(tempTiles, needMelds);
      standardShanten = Math.min(standardShanten, shanten);
    }
  }
  
  // 方法2: 还没有雀头，需要+1向听
  const shantenNoHead = calcMinShanten([...tiles], needMelds);
  if (shantenNoHead >= 0) {
    standardShanten = Math.min(standardShanten, shantenNoHead + 1);
  }
  
  // 七对向听数 (只有无副露时才考虑)
  let qiduiShanten = 99;
  if (melds.length === 0 && handTotal >= 13) {
    qiduiShanten = calculateQiDuiShanten(tiles);
  }
  
  // 国士向听数 (只有无副露时才考虑)
  let kokushiShanten = 99;
  if (melds.length === 0 && handTotal >= 13) {
    kokushiShanten = calculateKokushiShanten(tiles);
  }
  
  return Math.min(standardShanten, qiduiShanten, kokushiShanten);
};

// 计算听牌时可以和的牌
export const calculateWaitingTiles = (hand: Tile[], melds: Meld[]): Tile[] => {
  const waiting: Tile[] = [];
  const handCounts = countTiles(hand);
  
  // 尝试每种牌
  for (let i = 0; i < 34; i++) {
    const tiles = countsToArray(handCounts);
    if (tiles[i] >= 4) continue; // 已经4张了
    
    tiles[i]++;
    // 检查加入这张牌后是否和牌
    if (checkWinning(tiles, melds.length)) {
      waiting.push(indexToTile(i));
    }
  }
  
  return waiting;
};
