import { validateGameState } from './inputValidation';
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

import { analyzeSichuan, recognizeSichuanPatterns, SICHUAN_RULE } from './sichuanAnalyzer';

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
  const errors = validateGameState(state, lang);
  if (errors.length || !mode) {
    const effectiveCount = hand.length + melds.length * 3;
    const countOnlyIncomplete = !!mode && effectiveCount < 13 && validateGameState(state, lang, false).length === 0;
    return { status: countOnlyIncomplete ? 'incomplete' : 'invalid', isReady: false, isWinning: false,
      shanten: null, waitingTiles: [], suggestions: [], warnings: errors };
  }
  const zh = lang === 'zh';
  const warnings: string[] = [];
  const all = [...hand, ...melds.flatMap(m => m.tiles)];
  const used = countTiles([...all, ...discards]);
  const hasVoid = mode === GameMode.Sichuan && (all.some(t => t.suit === voidSuit) || new Set(all.map(t => t.suit)).size > 2);
  const structuralWin = checkWinning(countsToArray(countTiles(hand)), melds.length, mode);
  const isWinning = structuralWin && !hasVoid;
  const shanten = isWinning ? -1 : Math.max(0, calculateShanten(hand, melds, mode));
  const describeWaits = (tiles: Tile[]) => tiles.map(tile => ({
    tile, remaining: Math.max(0, 4 - (used.get(getTileKey(tile.suit, tile.value)) ?? 0)),
    probability: zh ? '未见张数，非摸牌概率' : 'Unseen copies, not draw probability',
  }));
  let waitingTiles = !hasVoid && hand.length + melds.length * 3 === 13
    ? describeWaits(calculateWaitingTiles(hand, melds, mode, voidSuit)) : [];
  const isReady = !isWinning && waitingTiles.some(w => w.remaining > 0);
  const discard = !isWinning ? calculateBestDiscard(hand, melds, discards, lang, mode, voidSuit) : undefined;
  if (discard) waitingTiles = describeWaits(discard.waitingTiles);
  let suggestions: FanSuggestion[] = [];
  const scoreNote = mode === GameMode.Sichuan
    ? (zh
      ? `参考口径：${SICHUAN_RULE.id}（平胡0、对对胡1、清一色2、七对2、带幺九2、金钩钓2含对对胡，每根+1，封顶${SICHUAN_RULE.capExponent}指数番=16倍），来源 ${SICHUAN_RULE.source}。未记录自摸/点炮、杠类型、海底等事件，不能作为实际结算依据。`
      : `Reference table: ${SICHUAN_RULE.id} (ping 0, all pungs 1, full flush 2, seven pairs 2, terminals 2, single wait 2 incl. all pungs, +1 per root, capped at ${SICHUAN_RULE.capExponent} exponents = 16x), source ${SICHUAN_RULE.source}. Draw/claim source, kong type and last-tile events are not recorded; do not use as a settlement.`)
    : (zh ? '国标计番尚未覆盖全部81番与拆分规则，以下是部分识别结果，不能据此确认8番起和。' : 'MCR scoring is incomplete; these partial results cannot confirm the 8-fan minimum.');
  if (isWinning && mode === GameMode.Sichuan) {
    const score = recognizeSichuanPatterns(hand, melds, lang);
    suggestions = [{
      name: zh ? `成牌（${score.label}，参考计番）` : `Complete shape (${score.label}, reference score)`,
      baseFan: score.cappedExponent, fan: score.cappedExponent, probability: 0, missingTiles: [],
      patternDetails: score.details, scoreText: score.scoreText,
    }];
  } else if (isWinning) {
    const result = calculateTotalFan(recognizeMCRPatterns(hand, melds));
    suggestions = [{ name: zh ? '成牌（参考计番）' : 'Complete shape (reference score)', baseFan: result.totalFan,
      fan: result.totalFan, probability: 100, missingTiles: [], patternDetails: result.details }];
  } else {
    suggestions = mode === GameMode.Sichuan ? analyzeSichuan(hand, melds, voidSuit, lang) : analyzeMCR(hand, melds, lang, wallCount);
  }
  if (hasVoid) warnings.push(zh ? '尚有定缺牌或三门花色，不能和牌' : 'Void suit remains or all three suits are present; cannot win');
  const deadWait = !isWinning && hand.length + melds.length * 3 === 13 &&
    waitingTiles.length > 0 && waitingTiles.every(w => w.remaining === 0);
  if (deadWait) warnings.push(zh ? '待牌均已见完（死叫）' : 'All waiting tiles are exhausted');
  if (wallCount <= 10) warnings.push(zh ? (wallCount ? '牌墙将尽' : '牌墙已空') : (wallCount ? 'Wall nearly empty' : 'Wall is empty'));
  const status = isWinning ? 'completeShapeScoreUnverified' : deadWait ? 'deadWait' : isReady ? 'ready' : 'notReady';
  return { mode, status, isReady, isWinning, shanten, waitingTiles, suggestions, scoreNote,
    bestDiscard: discard && { tile: discard.tile, reason: hasVoid ? (zh ? '优先打定缺花色' : 'Discard void suit first') : discard.reason,
      ukeire: discard.ukeire, ukeireTiles: discard.ukeireTiles },
    scoreEstimate: isWinning ? suggestions[0]?.fan : undefined, warnings };
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
  const state: GameState = { mode: GameMode.MCR, hand, melds, discards: [], wallCount: 0, voidSuit: null };
  if (validateGameState(state, 'en').length || !checkWinning(countsToArray(countTiles(hand)), melds.length)) {
    return { totalFan: 0, details: [], isValid: false, patterns: [] };
  }
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
