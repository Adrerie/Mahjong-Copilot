/**
 * 麻将逻辑主入口模块
 * 
 * 这个文件作为所有麻将逻辑的统一入口点，
 * 从各个子模块导入并重新导出所有功能。
 * 
 * 子模块结构：
 * - tileHelpers.ts: 牌的基础工具函数（排序、计数、索引转换等）
 * - shantenCalculator.ts: 向听数计算（标准型、七对、国士）
 * - winningChecker.ts: 和牌判定
 * - discardAnalyzer.ts: 最优弃牌分析
 * - sichuanAnalyzer.ts: 四川麻将分析
 * - mcrPatterns.ts: 国标麻将番种识别
 * - mcrAnalyzer.ts: 国标麻将分析建议
 */

import { GameMode, GameState, Suit, Tile, AnalysisResult, FanSuggestion, Language, Meld } from '../types';
import { createTile, getTileKey, TEXT, MCR_RULES } from '../constants';

// 导入子模块
import { 
  sortTiles, 
  countTiles, 
  countsToArray, 
  tileKeyToIndex, 
  tileToIndex, 
  indexToTile,
  getSuitCount,
  getUniqueTiles
} from './tileHelpers';

import { 
  calculateShanten, 
  calculateWaitingTiles,
  calculateQiDuiShanten,
  calculateKokushiShanten
} from './shantenCalculator';

import { checkWinning } from './winningChecker';

import { calculateBestDiscard } from './discardAnalyzer';

import { analyzeSichuan } from './sichuanAnalyzer';

import { 
  recognizeMCRPatterns, 
  calculateTotalFan, 
  calculateMCRExtras,
  getAllPatterns,
  getPatternById,
  RecognizedPattern
} from './mcrPatterns';

import { analyzeMCR } from './mcrAnalyzer';

// --- MAIN EXPORT ---

export const analyzeGame = (state: GameState, lang: Language = 'en'): AnalysisResult => {
  const { hand, melds, discards, wallCount, mode, voidSuit } = state;
  const warnings: string[] = [];
  const t = TEXT[lang];
  
  // 1. 计算真正的向听数
  const shanten = calculateShanten(hand, melds);
  
  // 2. 判断状态
  const isWinning = shanten === -1; // 已和牌
  const isReady = shanten === 0;    // 听牌
  
  // 统计所有已知牌用于计算剩余数量
  const allUsedTiles = [...hand, ...melds.flatMap(m => m.tiles), ...discards];
  const usedCounts = countTiles(allUsedTiles);
  
  // 3. 计算听牌时可和的牌
  let waitingTiles: { tile: Tile; remaining: number; probability: string }[] = [];
  if (isReady && hand.length === 13) {
    const waits = calculateWaitingTiles(hand, melds);
    waitingTiles = waits.map(tile => {
      const remaining = 4 - (usedCounts.get(getTileKey(tile.suit, tile.value)) || 0);
      const prob = wallCount > 0 ? (remaining / wallCount * 100).toFixed(1) : '0';
      return {
        tile,
        remaining,
        probability: `${prob}%`
      };
    });
  }
  
  // 4. 计算最优弃牌 (只有14张牌时需要)
  let bestDiscard: { tile: Tile, reason: string, ukeire: number, ukeireTiles: number } | undefined;
  
  if (hand.length === 14) {
    if (isWinning) {
      // 已和牌，不需要弃牌
      bestDiscard = undefined;
    } else {
      // 需要打一张牌
      // 四川麻将特殊处理: 优先打定缺花色
      if (mode === GameMode.Sichuan && voidSuit) {
        const voidTile = hand.find(tile => tile.suit === voidSuit);
        if (voidTile) {
          // 计算打出这张牌后的进张
          const newHand = hand.filter((h, idx) => {
            if (h.suit === voidTile.suit && h.value === voidTile.value) {
              const firstIdx = hand.findIndex(hh => hh.suit === voidTile.suit && hh.value === voidTile.value);
              return idx !== firstIdx;
            }
            return true;
          });
          const newShanten = calculateShanten(newHand, melds);
          
          // 统计所有已知牌
          const usedArr: number[] = new Array(34).fill(0);
          for (const tile of allUsedTiles) {
            const idx = tileToIndex(tile);
            if (idx >= 0 && idx < 34) usedArr[idx]++;
          }
          
          let ukeire = 0;
          let ukeireTiles = 0;
          for (let i = 0; i < 34; i++) {
            const used = usedArr[i] - (tileToIndex(voidTile) === i ? 1 : 0);
            const remaining = 4 - used;
            if (remaining <= 0) continue;
            
            const testHand = [...newHand, indexToTile(i)];
            const shantenAfter = calculateShanten(testHand, melds);
            if (shantenAfter < newShanten) {
              ukeireTiles++;
              ukeire += remaining;
            }
          }
          
          // 如果打出后是听牌，计算待牌列表
          let voidWaitingTiles: Tile[] = [];
          if (newShanten === 0) {
            voidWaitingTiles = calculateWaitingTiles(newHand, melds);
            // 更新 waitingTiles 显示打出后的听牌
            waitingTiles = voidWaitingTiles.map(tile => {
              const remaining = 4 - (usedCounts.get(getTileKey(tile.suit, tile.value)) || 0) + (tile.suit === voidTile.suit && tile.value === voidTile.value ? 1 : 0);
              const prob = wallCount > 0 ? (remaining / wallCount * 100).toFixed(1) : '0';
              return {
                tile,
                remaining,
                probability: `${prob}%`
              };
            });
          }
          
          bestDiscard = { tile: voidTile, reason: t.huaZhu, ukeire, ukeireTiles };
        }
      }
      
      if (!bestDiscard) {
        const result = calculateBestDiscard(hand, melds, discards, lang);
        if (result) {
          bestDiscard = {
            tile: result.tile,
            reason: result.reason,
            ukeire: result.ukeire,
            ukeireTiles: result.ukeireTiles
          };
          
          // 如果打出推荐牌后是听牌，显示待牌列表
          if (result.waitingTiles.length > 0) {
            waitingTiles = result.waitingTiles.map(tile => {
              const remaining = 4 - (usedCounts.get(getTileKey(tile.suit, tile.value)) || 0) + (tile.suit === result.tile.suit && tile.value === result.tile.value ? 1 : 0);
              const prob = wallCount > 0 ? (remaining / wallCount * 100).toFixed(1) : '0';
              return {
                tile,
                remaining,
                probability: `${prob}%`
              };
            });
          }
        }
      }
    }
  } else if (hand.length === 13 && !isReady) {
    // 13张牌但不是听牌状态 - 这是正常摸牌前的状态，不需要弃牌建议
    bestDiscard = undefined;
  }

  // 5. 番种分析
  let suggestions: FanSuggestion[] = [];
  if (mode === GameMode.Sichuan) {
    suggestions = analyzeSichuan(hand, melds, voidSuit, lang);
  } else {
    suggestions = analyzeMCR(hand, melds, lang, wallCount);
  }
  
  // 6. 如果已和牌，显示实际番种而非建议
  if (isWinning) {
    const recognized = recognizeMCRPatterns(hand, melds);
    const { totalFan, details } = calculateTotalFan(recognized);
    
    if (recognized.length > 0) {
      suggestions = [{
        name: lang === 'zh' ? '已和牌' : 'Winning Hand',
        baseFan: totalFan,
        fan: totalFan,
        probability: 100,
        missingTiles: [],
        patternDetails: details
      }];
    }
  }
  
  // 7. 修正缺少牌的显示 - 听牌时显示待牌而非缺牌
  if (isReady && waitingTiles.length > 0 && suggestions.length > 0) {
    suggestions[0].missingTiles = waitingTiles.map(w => w.tile);
  }

  // 8. 牌墙警告
  if (wallCount <= 10 && wallCount > 0) {
    warnings.push(lang === 'zh' ? `牌墙仅剩${wallCount}张，注意流局风险` : `Only ${wallCount} tiles left in wall, beware of draw`);
  } else if (wallCount === 0) {
    warnings.push(lang === 'zh' ? '牌墙已空' : 'Wall is empty');
  }

  return {
    isReady: isReady || isWinning,
    shanten: Math.max(-1, shanten),
    waitingTiles,
    bestDiscard,
    suggestions,
    scoreEstimate: suggestions.length > 0 ? suggestions[0].fan : 0,
    warnings: isWinning ? [lang === 'zh' ? '已和牌！' : 'Winning hand!'] : warnings,
  };
};

// ============================================================
// 公开API：计算国标麻将总番
// 用法示例：
//   const result = calculateMCRTotalFan(hand, melds);
//   console.log(`总番: ${result.totalFan}`);
//   console.log(`番种明细: ${result.details.join(', ')}`);
//   console.log(`是否满足8番起和: ${result.isValid}`);
// ============================================================
export const calculateMCRTotalFan = (hand: Tile[], melds: Meld[]): {
  totalFan: number;
  details: string[];
  isValid: boolean; // 是否满足8番起和
  patterns: { id: string; name: string; fan: number; count: number }[];
} => {
  const recognized = recognizeMCRPatterns(hand, melds);
  const { totalFan, validPatterns, details } = calculateTotalFan(recognized);
  
  return {
    totalFan,
    details,
    isValid: totalFan >= MCR_RULES.MIN_FAN_TO_WIN,
    patterns: validPatterns.map(p => ({
      id: p.pattern.id,
      name: p.pattern.nameZh,
      fan: p.pattern.fan,
      count: p.count,
    })),
  };
};

// 重新导出所有子模块的公开API
export { 
  // 基础工具
  sortTiles, 
  countTiles, 
  countsToArray,
  tileKeyToIndex,
  tileToIndex,
  indexToTile,
  getSuitCount,
  getUniqueTiles,
  
  // 向听数计算
  calculateShanten, 
  calculateWaitingTiles,
  calculateQiDuiShanten,
  calculateKokushiShanten,
  
  // 和牌判定
  checkWinning,
  
  // 弃牌分析
  calculateBestDiscard,
  
  // MCR番种识别
  recognizeMCRPatterns, 
  calculateTotalFan,
  calculateMCRExtras,
  getAllPatterns,
  getPatternById,
  
  // 分析器
  analyzeMCR,
  analyzeSichuan,
};

// 导出类型
export type { RecognizedPattern };
