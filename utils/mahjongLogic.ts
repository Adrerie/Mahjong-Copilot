
import { validateGameState, winningTileInHand } from './inputValidation';
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

import { GameMode, GameState, Suit, Tile, AnalysisResult, FanSuggestion, Language, Meld, WinSource, MCRContext } from '../types';
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
  // 14张打牌建议由现有规则效率评分提供；13张不是弃牌回合。
  // 国标若仅结构成牌而8番尚未确认，可另外提供“继续打”的备选参考。
  let discard = !isWinning ? calculateBestDiscard(hand, melds, discards, lang, mode, voidSuit) : undefined;
  if (discard) waitingTiles = describeWaits(discard.waitingTiles);

  const improvingDraws: NonNullable<AnalysisResult['improvingDraws']> = [];
  if (hand.length + melds.length * 3 === 13 && !hasVoid) {
    const baseShanten = shanten;
    for (let i = 0; i < (mode === GameMode.Sichuan ? 27 : 34); i++) {
      const incoming = indexToTile(i);
      if (mode === GameMode.Sichuan && incoming.suit === voidSuit) continue;
      const remaining = Math.max(0, 4 - (used.get(getTileKey(incoming.suit, incoming.value)) ?? 0));
      if (remaining <= 0) continue;
      const handAfterDraw = [...hand, incoming];
      const nextShanten = checkWinning(countsToArray(countTiles(handAfterDraw)), melds.length, mode)
        ? -1 : Math.max(0, calculateShanten(handAfterDraw, melds, mode));
      if (nextShanten < baseShanten) improvingDraws.push({ tile: incoming, remaining, shantenAfter: nextShanten });
    }
    improvingDraws.sort((a, b) => a.shantenAfter - b.shantenAfter || b.remaining - a.remaining);
  }
  let suggestions: FanSuggestion[] = [];
  let contextPending = false;
  const scoreNote = mode === GameMode.Sichuan
    ? (zh
      ? `参考口径：${SICHUAN_RULE.id}（平胡0、对对胡1、清一色2、七对2、带幺九2、金钩钓2含对对胡，每根+1；已记录的杠开/杠炮/抢杠/海底事件各+1；封顶${SICHUAN_RULE.capExponent}指数番=16倍）。自摸/点炮决定付款方向，但不自动加番；杠分、多人付款仍未结算。来源 ${SICHUAN_RULE.source}。`
      : `Reference table: ${SICHUAN_RULE.id} (base exponents, +1/root, +1 for confirmed kong/last-tile win events, capped at ${SICHUAN_RULE.capExponent} = 16x). Ordinary self-draw changes who pays, not the exponent; no kong or multiplayer settlement. Source ${SICHUAN_RULE.source}.`)
    : (zh
      ? '国标按番种列表相加、8 番起和；未覆盖番种与未记录的和牌张/末张/圈门风/杠类型会影响总番，结论按「已达 / 待核 / 不足」标注。'
      : 'MCR adds fan values towards an 8-fan minimum. Uncovered patterns and unrecorded winning tile, last-tile, seat/round wind and kong types still affect the total; the verdict says met / unverified / unmet.');
  if (isWinning && mode === GameMode.Sichuan) {
    const score = recognizeSichuanPatterns(hand, melds, lang, {
      winSource: state.winSource,
      winEvent: state.sichuanWinEvent,
      // 海底事件只看已记录的牌墙张数，牌墙还有牌时不加事件番。
      wallCount,
    });
    suggestions = [{
      name: zh ? `成牌（${score.label}，参考计番）` : `Complete shape (${score.label}, reference score)`,
      baseFan: score.cappedExponent, fan: score.cappedExponent, probability: 0, missingTiles: [],
      patternDetails: score.details, scoreText: score.scoreText,
    }];
  } else if (isWinning) {
    const result = calculateMCRTotalFan(hand, melds, state.winSource, {
      winningTile: state.winningTile,
      seatWind: state.seatWind,
      roundWind: state.roundWind,
      lastTile: state.lastTile,
      afterKong: state.afterKong,
      discards: state.discards,
    });
    const eligibilityText = result.eligibility === 'met'
      ? (zh ? `已达 8 番起和线（可确认 ${result.confirmedFan} 番）` : `Meets the 8-fan minimum (${result.confirmedFan} confirmed)`)
      : result.eligibility === 'unverified'
        ? (zh ? `8 番起和待核（当前可确认 ${result.confirmedFan} 番，仍缺事件上下文）`
          : `8-fan minimum unverified (${result.confirmedFan} currently confirmed; event context is missing)`)
        : (zh ? `不足 8 番起和（可确认 ${result.confirmedFan} 番）`
          : `Below the 8-fan minimum (${result.confirmedFan} confirmed)`);
    const unrecorded = result.missingContext.map(gap => MCR_CONTEXT_LABELS[gap][lang]);
    contextPending = result.missingContext.length > 0;
    if (result.eligibility !== 'met') {
      // “形状已和”不代表国标可起和；不足8番/资料待核时提供继续打的参考。
      discard = calculateBestDiscard(hand, melds, discards, lang, mode, voidSuit);
      if (discard) {
        waitingTiles = describeWaits(discard.waitingTiles);
        warnings.push(zh ? '8番未确认：弃牌建议只作为继续打的备选，请先核对起和条件'
          : '8-fan eligibility unconfirmed: discard is a continuation option; check win eligibility first');
      }
    }
    suggestions = [{ name: zh ? '成牌（参考计番）' : 'Complete shape (reference score)', baseFan: result.confirmedFan,
      fan: result.confirmedFan, probability: 0, missingTiles: [],
      patternDetails: [...result.details, eligibilityText, `${zh ? '未记录' : 'Not recorded'}: ${unrecorded.join(zh ? '、' : ', ')}`] }];
    if (result.missingContext.includes('winSource')) {
      warnings.push(zh ? '和牌来源未知，不求人/门前清未计' : 'Win source unknown; fully-concealed hand fan not counted');
    }
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
    improvingDraws: hand.length + melds.length * 3 === 13 ? improvingDraws.slice(0, 8) : undefined,
    scoreEstimate: isWinning ? suggestions[0]?.fan : undefined, contextPending, warnings };
};

// ============================================================
// 公开API：计算国标麻将总番
// 用法示例：
//   const result = calculateMCRTotalFan(hand, melds, state.winSource, {
//     winningTile: state.winningTile, seatWind: state.seatWind, roundWind: state.roundWind,
//     lastTile: state.lastTile, discards: state.discards,
//   });
//   console.log(`可确认番: ${result.confirmedFan}`);
//   console.log(`起和: ${result.eligibility}`);   // met | unmet | unverified
//   console.log(`仍缺上下文: ${result.missingContext.join(', ')}`);
// ============================================================

/** 计番所需、但当前局面可能未记录的事件事实；缺失时不得自动计对应番种。 */
export type MCRContextGap = 'winSource' | 'winningTile' | 'lastTile' | 'afterKong' | 'seatWind' | 'kongType';

const MCR_CONTEXT_LABELS: Record<MCRContextGap, { zh: string; en: string }> = {
  winSource: { zh: '和牌来源（自摸/点和）', en: 'win source (self-draw or claim)' },
  winningTile: { zh: '和牌张（边张/坎张/单钓将、和绝张、九莲宝灯）', en: 'winning tile (wait shape, last tile, nine gates)' },
  lastTile: { zh: '末张（妙手回春/海底捞月）', en: 'last tile of the wall' },
  afterKong: { zh: '杠后和牌（杠上开花/抢杠和）', en: 'replacement-tile or robbing-kong win' },
  seatWind: { zh: '门风/圈风', en: 'seat and round wind' },
  kongType: { zh: '明杠/暗杠/补杠', en: 'kong types' },
};

/**
 * 国标总番：只报「当前可确认的番」，并区分三件事——
 * 结构可和（structuralWin）、8 番起和资格（eligibility）、仍缺哪些事件上下文（missingContext）。
 * 来源未知时，不求人/门前清/自摸不计；资格只在「补齐未记录事件后仍不足 8 番」时才敢判 unmet。
 */
export const calculateMCRTotalFan = (
  hand: Tile[],
  melds: Meld[],
  winSource: WinSource = 'unknown',
  ctx: MCRContext = {},
): {
  structuralWin: boolean;   // 结构上是否成牌
  confirmedFan: number;     // 当前可确认的番（不含依赖未记录事件的番）
  maxPossibleFan: number;   // 仅比较自摸/点和的参考番，不是补齐全部事件后的番数上限
  eligibility: 'met' | 'unmet' | 'unverified'; // 8 番起和资格
  totalFan: number;         // = confirmedFan（旧字段名，语义改为「可确认番」）
  details: string[];
  isValid: boolean;         // 保守：仅在可确认番已达 8 番时为 true
  patterns: { id: string; name: string; fan: number; count: number }[];
  missingContext: MCRContextGap[];
} => {
  const state: GameState = { ...ctx, mode: GameMode.MCR, hand, melds, discards: ctx.discards ?? [], wallCount: 0, voidSuit: null };
  ctx = { ...ctx, winningTile: winningTileInHand(state) };
  const gapped: MCRContextGap[] = [];
  if (winSource === 'unknown') gapped.push('winSource');
  if (!ctx.winningTile) gapped.push('winningTile');
  if (ctx.lastTile !== true && ctx.lastTile !== false) gapped.push('lastTile');
  if (ctx.afterKong !== true && ctx.afterKong !== false) gapped.push('afterKong');
  if (!ctx.seatWind || !ctx.roundWind) gapped.push('seatWind');
  if (melds.some(meld => meld.type === 'gang' && !meld.kongKind)) gapped.push('kongType');
  const structuralWin = validateGameState(state, 'en').length === 0 &&
    checkWinning(countsToArray(countTiles(hand)), melds.length, GameMode.MCR);
  if (!structuralWin) {
    return { structuralWin: false, confirmedFan: 0, maxPossibleFan: 0, eligibility: 'unmet',
      totalFan: 0, details: [], isValid: false, patterns: [], missingContext: [] };
  }

  const score = (source: WinSource) => {
    const result = calculateTotalFan(recognizeMCRPatterns(hand, melds, source, ctx));
    // 无番和（8番）：除花牌外确实没有任何其他番种时才计。
    // 和牌来源未记录时可能还有自摸/门前清，此时不能判定「无番」。
    if (source === 'unknown' || gapped.some(gap => gap !== 'winSource') || result.validPatterns.length > 0) return result;
    const pattern = getPatternById('wuFanHu');
    if (!pattern) return result;
    return {
      totalFan: pattern.fan,
      validPatterns: [{ pattern, count: 1 }],
      details: [`${pattern.nameZh} (${pattern.fan}番)`],
    };
  };
  const confirmed = score(winSource);
  const possible = winSource === 'unknown' ? [score('selfDraw'), score('claim')] : [];
  const maxPossibleFan = possible.reduce((best, alt) => Math.max(best, alt.totalFan), confirmed.totalFan);
  const eligibility = confirmed.totalFan >= MCR_RULES.MIN_FAN_TO_WIN ? 'met' as const
    : gapped.length > 0 ? 'unverified' as const : 'unmet' as const;

  return {
    structuralWin: true,
    confirmedFan: confirmed.totalFan,
    maxPossibleFan,
    eligibility,
    totalFan: confirmed.totalFan,
    details: confirmed.details,
    isValid: eligibility === 'met',
    patterns: confirmed.validPatterns.map(p => ({
      id: p.pattern.id,
      name: p.pattern.nameZh,
      fan: p.pattern.fan,
      count: p.count,
    })),
    missingContext: gapped,
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
