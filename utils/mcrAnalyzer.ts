/**
 * 国标麻将分析建议模块
 * - 分析当前手牌可能达成的番型
 * - 缺牌按实体牌张数计算；不推断摸牌概率（probability 恒为 0）
 */

import { Tile, Meld, Suit, FanSuggestion, Language } from '../types';
import { createTile, getTileKey, TEXT } from '../constants';
import { countTiles, getSuitCount } from './tileHelpers';
import { calculateShanten } from './shantenCalculator';
import { recognizeMCRPatterns, calculateTotalFan, calculateMCRExtras } from './mcrPatterns';

// ========== 辅助函数 ==========

// 计算组成某顺子的成本（缺少的牌数）
const costToMakeSeq = (hand: Tile[], melds: Meld[], suit: Suit, startVal: number): number => {
  // 碰/杠不可拆成顺子；已明吃的顺子只有完全匹配时才可利用。
  if (melds.some(m => m.type === 'chi' && m.tiles[0]?.suit === suit &&
      Math.min(...m.tiles.map(t => t.value)) === startVal)) return 0;
  if (melds.length >= 4) return Infinity;
  let cost = 0;
  for (let v = startVal; v <= startVal + 2; v++) {
    if (!hand.some(t => t.suit === suit && t.value === v)) cost++;
  }
  return cost;
};

/**
 * 同时组成多副顺子的补牌计划：同一张实体牌只能用一次，不能重复借用。
 * 用于一色三步高、一色四步高、清龙这类共用同一花色牌张的牌型。
 */
const planSequences = (
  hand: Tile[],
  melds: Meld[],
  required: { suit: Suit; startVal: number }[],
): { cost: number; missing: Tile[] } => {
  // 完全匹配的明吃逐一锁定；其他副露占用剩余面子槽，不能拆牌重用。
  const pending = [...required];
  let unrelated = 0;
  for (const meld of melds) {
    const index = meld.type === 'chi'
      ? pending.findIndex(r => r.suit === meld.tiles[0]?.suit &&
          r.startVal === Math.min(...meld.tiles.map(t => t.value)))
      : -1;
    if (index >= 0) pending.splice(index, 1);
    else unrelated++;
  }
  if (unrelated > 4 - required.length) return { cost: Infinity, missing: [] };
  const pool = new Map<string, number>();
  hand.forEach(tile => {
    const key = getTileKey(tile.suit, tile.value);
    pool.set(key, (pool.get(key) ?? 0) + 1);
  });
  const missing: Tile[] = [];
  for (const { suit, startVal } of pending) {
    for (let value = startVal; value <= startVal + 2; value++) {
      const key = getTileKey(suit, value);
      const available = pool.get(key) ?? 0;
      if (available > 0) pool.set(key, available - 1);
      else missing.push(createTile(suit, value));
    }
  }
  return { cost: missing.length, missing };
};

/** 暗手里某张牌的实体张数。 */
const handCopies = (hand: Tile[], suit: Suit, value: number): number =>
  hand.filter(t => t.suit === suit && t.value === value).length;

/** 已锁定为刻子的副露（碰/杠），按同一张牌去重后计数。 */
const meldedPungs = (melds: Meld[], suit: Suit, value: number): number =>
  melds.filter(m => (m.type === 'pong' || m.type === 'gang') &&
    m.tiles[0]?.suit === suit && m.tiles[0]?.value === value).length;

/**
 * 刻子路线的可用张数（最多 3）：暗手实体张数 + 已锁定的碰/杠。
 * 吃牌副露的牌不能改当刻子用，所以不计入。
 */
const pungTiles = (hand: Tile[], melds: Meld[], suit: Suit, value: number): number =>
  Math.min(3, handCopies(hand, suit, value) + meldedPungs(melds, suit, value) * 3);

/**
 * 顺子路线的可用副数：暗手能凑出的同序顺子 + 完全匹配的明吃。
 * 碰/杠是锁定面子，不能拆成顺子；非同一序数的吃牌也不能改当这副顺子。
 */
const chowAvailable = (hand: Tile[], melds: Meld[], suit: Suit, startVal: number): number => {
  const meldedChows = melds.filter(m => m.type === 'chi' && m.tiles[0]?.suit === suit &&
    Math.min(...m.tiles.map(t => t.value)) === startVal).length;
  return Math.min(handCopies(hand, suit, startVal),
    handCopies(hand, suit, startVal + 1), handCopies(hand, suit, startVal + 2)) + meldedChows;
};

/** 补足 need 副同序顺子还缺的牌（每副顺子三张牌各缺一张）。 */
const missingChowTiles = (hand: Tile[], melds: Meld[], suit: Suit, startVal: number, need: number): Tile[] =>
  planSequences(hand, melds, Array.from({ length: need }, () => ({ suit, startVal }))).missing;

/** countTiles 的键（如 "1m"）还原成牌，用于把候选将牌显示给用户。 */
const tileFromKey = (key: string): Tile => {
  const value = parseInt(key[0]);
  const suitChar = key.slice(1);
  const suit = suitChar === 'm' ? Suit.Man : suitChar === 'p' ? Suit.Pin : suitChar === 's' ? Suit.Sou : Suit.Zihai;
  return createTile(suit, value);
};



/**
 * MCR 分析主函数 - 分析当前手牌可能达成的番型
 * @param hand 手牌
 * @param melds 副露
 * @param lang 语言
 * @param wallCount 牌墙剩余数量（可选，用于计算妙手回春/海底捞月）
 */
export const analyzeMCR = (hand: Tile[], melds: Meld[], lang: Language, wallCount?: number): FanSuggestion[] => {
  const t = TEXT[lang];
  const suggestions: FanSuggestion[] = [];
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
  const counts = countTiles(allTiles);
  const handCounts = countTiles(hand);
  
  // --- 48番 番种检测 ---

  // 0a. Quadruple Chow (Yi Se Si Tong Shun) - 48 Fan
  // 一色四同顺：一种花色4组相同序数的顺子（碰杠不能改当顺子）
  [Suit.Man, Suit.Pin, Suit.Sou].forEach(s => {
    for (let i = 1; i <= 7; i++) {
      // 一色四同顺要占满四副面子：只有完全匹配的明吃能算其中一副。
      const matchingChows = melds.filter(m => m.type === 'chi' && m.tiles[0]?.suit === s &&
        Math.min(...m.tiles.map(tile => tile.value)) === i).length;
      if (melds.length > matchingChows) continue;
      const availableChows = chowAvailable(hand, melds, s, i);

      if (availableChows >= 4) {
        const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, ['yiSeSiTongShun', 'yiSeSanTongShun', 'yiBanGao', 'siGuiYi']);
        suggestions.push({
          name: t.quadrupleChow || '一色四同顺',
          baseFan: 48,
          fan: 48 + extraScore,
          probability: 0,
          missingTiles: [],
          patternDetails: [`${t.quadrupleChow || '一色四同顺'} (48)`, ...extraDetails]
        });
      } else if (availableChows >= 3) {
        // 已有3组，缺1组
        const missing = missingChowTiles(hand, melds, s, i, 4);

        const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, ['yiSeSiTongShun', 'yiSeSanTongShun', 'yiBanGao', 'siGuiYi']);
        suggestions.push({
          name: t.quadrupleChow || '一色四同顺',
          baseFan: 48,
          fan: 48 + extraScore,
          probability: 0,
          missingTiles: missing.slice(0, 3),
          patternDetails: [`${t.quadrupleChow || '一色四同顺'} (48)`, ...extraDetails]
        });
      }
    }
  });

  // 0b. Four Pure Shifted Pungs (Yi Se Si Jie Gao) - 48 Fan
  // 一色四节高：一种花色4个依次递增1的刻子 (如1111 2222 3333 4444)
  [Suit.Man, Suit.Pin, Suit.Sou].forEach(s => {
    for (let i = 1; i <= 6; i++) {
      // 一色四节高同样要占满四副刻子：只有这张牌的碰/杠能算其中一副。
      const matchingPungs = [i, i + 1, i + 2, i + 3]
        .reduce((total, value) => total + meldedPungs(melds, s, value), 0);
      if (melds.length > matchingPungs) continue;
      const has1 = pungTiles(hand, melds, s, i);
      const has2 = pungTiles(hand, melds, s, i + 1);
      const has3 = pungTiles(hand, melds, s, i + 2);
      const has4 = pungTiles(hand, melds, s, i + 3);
      
      if (has1 >= 3 && has2 >= 3 && has3 >= 3 && has4 >= 3) {
        const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, ['yiSeSiJieGao', 'yiSeSanJieGao', 'pengPengHu']);
        suggestions.push({
          name: t.fourPureShiftedPungs || '一色四节高',
          baseFan: 48,
          fan: 48 + extraScore,
          probability: 0,
          missingTiles: [],
          patternDetails: [`${t.fourPureShiftedPungs || '一色四节高'} (48)`, ...extraDetails]
        });
      } else if (has1 >= 2 && has2 >= 2 && has3 >= 2 && has4 >= 2) {
        const missing: Tile[] = [];
        if (has1 < 3) missing.push(createTile(s, i));
        if (has2 < 3) missing.push(createTile(s, i + 1));
        if (has3 < 3) missing.push(createTile(s, i + 2));
        if (has4 < 3) missing.push(createTile(s, i + 3));
        
        if (missing.length <= 4) {
          const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, ['yiSeSiJieGao', 'yiSeSanJieGao', 'pengPengHu']);
          suggestions.push({
            name: t.fourPureShiftedPungs || '一色四节高',
            baseFan: 48,
            fan: 48 + extraScore,
            probability: 0,
            missingTiles: missing,
            patternDetails: [`${t.fourPureShiftedPungs || '一色四节高'} (48)`, ...extraDetails]
          });
        }
      }
    }
  });

  // --- 24番 番种检测 ---

  // 1a. Pure Triple Chow (Yi Se San Tong Shun) - 24 Fan
  // 一色三同顺：同一花色3组相同序数的顺子
  [Suit.Man, Suit.Pin, Suit.Sou].forEach(s => {
    for (let i = 1; i <= 7; i++) {
      // 检查该花色是否有3组相同顺子的潜力
      const seqCost = costToMakeSeq(hand, melds, s, i);

      // 这个序数的顺子能凑几组：暗手实体张数 + 完全匹配的明吃，碰杠不算
      const availableChows = chowAvailable(hand, melds, s, i);

      if (availableChows >= 3) {
        const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, ['yiSeSanTongShun']);
        suggestions.push({
          name: t.pureTripleChow || '一色三同顺',
          baseFan: 24,
          fan: 24 + extraScore,
          probability: 0,
          missingTiles: [],
          patternDetails: [`${t.pureTripleChow || '一色三同顺'} (24)`, ...extraDetails]
        });
      } else if (availableChows >= 2 && seqCost === 0) {
        // 已有2组，缺1组
        const missing = missingChowTiles(hand, melds, s, i, 3);

        const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, ['yiSeSanTongShun']);
        suggestions.push({
          name: t.pureTripleChow || '一色三同顺',
          baseFan: 24,
          fan: 24 + extraScore,
          probability: 0,
          missingTiles: missing.slice(0, 3),
          patternDetails: [`${t.pureTripleChow || '一色三同顺'} (24)`, ...extraDetails]
        });
      }
    }
  });

  // 1c. Pure Shifted Pungs (Yi Se San Jie Gao) - 24 Fan
  // 一色三节高：同一花色3个依次递增1的刻子 (如111万222万333万)
  [Suit.Man, Suit.Pin, Suit.Sou].forEach(s => {
    for (let i = 1; i <= 7; i++) {
      // 检查连续3个值的刻子（暗手张数 + 已锁定的碰杠；吃牌不能改当刻子）
      const has1 = pungTiles(hand, melds, s, i);
      const has2 = pungTiles(hand, melds, s, i + 1);
      const has3 = pungTiles(hand, melds, s, i + 2);
      
      // 每个都需要至少3张才能成刻子
      if (has1 >= 3 && has2 >= 3 && has3 >= 3) {
        const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, ['yiSeSanJieGao']);
        suggestions.push({
          name: t.pureShiftedPungs || '一色三节高',
          baseFan: 24,
          fan: 24 + extraScore,
          probability: 0,
          missingTiles: [],
          patternDetails: [`${t.pureShiftedPungs || '一色三节高'} (24)`, ...extraDetails]
        });
      } else if (has1 >= 2 && has2 >= 2 && has3 >= 2) {
        // 至少各有2张，可以凑成
        const missing: Tile[] = [];
        if (has1 < 3) missing.push(createTile(s, i));
        if (has2 < 3) missing.push(createTile(s, i + 1));
        if (has3 < 3) missing.push(createTile(s, i + 2));
        
        if (missing.length <= 3) {
          const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, ['yiSeSanJieGao']);
          suggestions.push({
            name: t.pureShiftedPungs || '一色三节高',
            baseFan: 24,
            fan: 24 + extraScore,
            probability: 0,
            missingTiles: missing,
            patternDetails: [`${t.pureShiftedPungs || '一色三节高'} (24)`, ...extraDetails]
          });
        }
      }
    }
  });

  // 1d. Pure Shifted Chows (Yi Se San Bu Gao) - 16 Fan
  // 一色三步高：同一花色3组依次递增1或2的顺子
  [Suit.Man, Suit.Pin, Suit.Sou].forEach(s => {
    // 递增1: 如123 234 345
    for (let i = 1; i <= 5; i++) {
      const { cost: total, missing } = planSequences(hand, melds, [
        { suit: s, startVal: i }, { suit: s, startVal: i + 1 }, { suit: s, startVal: i + 2 },
      ]);

      if (total <= 4) {
        const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, ['yiSeSanBuGao']);
        suggestions.push({
          name: t.pureShiftedChows || '一色三步高',
          baseFan: 16,
          fan: 16 + extraScore,
          probability: 0,
          missingTiles: missing.slice(0, 4),
          patternDetails: [`${t.pureShiftedChows || '一色三步高'} (16)`, ...extraDetails]
        });
      }
    }
    // 递增2: 如123 345 567
    for (let i = 1; i <= 3; i++) {
      const { cost: total, missing } = planSequences(hand, melds, [
        { suit: s, startVal: i }, { suit: s, startVal: i + 2 }, { suit: s, startVal: i + 4 },
      ]);

      if (total <= 4) {
        const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, ['yiSeSanBuGao']);
        suggestions.push({
          name: t.pureShiftedChows || '一色三步高',
          baseFan: 16,
          fan: 16 + extraScore,
          probability: 0,
          missingTiles: missing.slice(0, 4),
          patternDetails: [`${t.pureShiftedChows || '一色三步高'} (16)`, ...extraDetails]
        });
      }
    }
  });

  // 1e. Triple Pung (San Tong Ke) - 16 Fan  
  // 三同刻：3种花色相同序数的刻子
  for (let v = 1; v <= 9; v++) {
    const hasMan = pungTiles(hand, melds, Suit.Man, v);
    const hasPin = pungTiles(hand, melds, Suit.Pin, v);
    const hasSou = pungTiles(hand, melds, Suit.Sou, v);
    
    if (hasMan >= 3 && hasPin >= 3 && hasSou >= 3) {
      const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, ['sanTongKe']);
      suggestions.push({
        name: t.triplePung || '三同刻',
        baseFan: 16,
        fan: 16 + extraScore,
        probability: 0,
        missingTiles: [],
        patternDetails: [`${t.triplePung || '三同刻'} (16)`, ...extraDetails]
      });
    } else if (hasMan >= 2 && hasPin >= 2 && hasSou >= 2) {
      const missing: Tile[] = [];
      if (hasMan < 3) missing.push(createTile(Suit.Man, v));
      if (hasPin < 3) missing.push(createTile(Suit.Pin, v));
      if (hasSou < 3) missing.push(createTile(Suit.Sou, v));
      
      if (missing.length <= 3) {
        const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, ['sanTongKe']);
        suggestions.push({
          name: t.triplePung || '三同刻',
          baseFan: 16,
          fan: 16 + extraScore,
          probability: 0,
          missingTiles: missing,
          patternDetails: [`${t.triplePung || '三同刻'} (16)`, ...extraDetails]
        });
      }
    }
  }

  // 1f. Mixed Straight (Hua Long) - 8 Fan
  // 花龙：3种花色的3组顺子连成1到9
  const huaLongPerms = [
    [[Suit.Man, 1], [Suit.Pin, 4], [Suit.Sou, 7]],
    [[Suit.Man, 1], [Suit.Sou, 4], [Suit.Pin, 7]],
    [[Suit.Pin, 1], [Suit.Man, 4], [Suit.Sou, 7]],
    [[Suit.Pin, 1], [Suit.Sou, 4], [Suit.Man, 7]],
    [[Suit.Sou, 1], [Suit.Man, 4], [Suit.Pin, 7]],
    [[Suit.Sou, 1], [Suit.Pin, 4], [Suit.Man, 7]],
  ];
  
  for (const perm of huaLongPerms) {
    const { cost: total, missing } = planSequences(hand, melds,
      perm.map(([suit, startVal]) => ({ suit: suit as Suit, startVal: startVal as number })));

    if (total <= 5) {
      const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, ['huaLong']);
      suggestions.push({
        name: t.mixedStraight || '花龙',
        baseFan: 8,
        fan: 8 + extraScore,
        probability: 0,
        missingTiles: missing.slice(0, 4),
        patternDetails: [`${t.mixedStraight || '花龙'} (8)`, ...extraDetails]
      });
    }
  }

  // 1g. Mixed Triple Chow (San Se San Tong Shun) - 8 Fan
  // 三色三同顺：3种花色相同序数的顺子
  for (let i = 1; i <= 7; i++) { // Can be 123 to 789
    const { cost: totalMissing, missing: missingTiles } = planSequences(hand, melds, [
      { suit: Suit.Man, startVal: i }, { suit: Suit.Pin, startVal: i }, { suit: Suit.Sou, startVal: i },
    ]);
    if (totalMissing <= 5) {
      
      // Calculate extras (排除主番种避免重复显示)
      const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, ['sanSeSanTongShun']);
      
      suggestions.push({
        name: t.mixedTripleChow,
        baseFan: 8,
        fan: 8 + extraScore,
        probability: 0,
        missingTiles: missingTiles.slice(0, 4), // Limit UI clutter
        patternDetails: [`${t.mixedTripleChow} (8)`, ...extraDetails]
      });
    }
  }
  
  // 1h. Mixed Shifted Pungs (San Se San Jie Gao) - 8 Fan
  // 三色三节高：3种花色依次递增1的刻子
  const pungPerms = [
    [Suit.Man, Suit.Pin, Suit.Sou],
    [Suit.Man, Suit.Sou, Suit.Pin],
    [Suit.Pin, Suit.Man, Suit.Sou],
    [Suit.Pin, Suit.Sou, Suit.Man],
    [Suit.Sou, Suit.Man, Suit.Pin],
    [Suit.Sou, Suit.Pin, Suit.Man],
  ];
  
  for (let i = 1; i <= 7; i++) {
    for (const [s1, s2, s3] of pungPerms) {
      const has1 = pungTiles(hand, melds, s1, i);
      const has2 = pungTiles(hand, melds, s2, i + 1);
      const has3 = pungTiles(hand, melds, s3, i + 2);
      
      if (has1 >= 3 && has2 >= 3 && has3 >= 3) {
        const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, ['sanSeSanJieGao']);
        suggestions.push({
          name: t.mixedShiftedPungs || '三色三节高',
          baseFan: 8,
          fan: 8 + extraScore,
          probability: 0,
          missingTiles: [],
          patternDetails: [`${t.mixedShiftedPungs || '三色三节高'} (8)`, ...extraDetails]
        });
        break;
      } else if (has1 >= 2 && has2 >= 2 && has3 >= 2) {
        const missing: Tile[] = [];
        if (has1 < 3) missing.push(createTile(s1, i));
        if (has2 < 3) missing.push(createTile(s2, i + 1));
        if (has3 < 3) missing.push(createTile(s3, i + 2));
        
        if (missing.length <= 3) {
          const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, ['sanSeSanJieGao']);
          suggestions.push({
            name: t.mixedShiftedPungs || '三色三节高',
            baseFan: 8,
            fan: 8 + extraScore,
            probability: 0,
            missingTiles: missing,
            patternDetails: [`${t.mixedShiftedPungs || '三色三节高'} (8)`, ...extraDetails]
          });
        }
      }
    }
  }

  // 2. Mixed Shifted Chows (San Se San Bu Gao) - 6 Fan
  // Strategy: S1(n), S2(n+1), S3(n+2) in any suit permutation
  const perms = [
    [Suit.Man, Suit.Pin, Suit.Sou],
    [Suit.Man, Suit.Sou, Suit.Pin],
    [Suit.Pin, Suit.Man, Suit.Sou],
    [Suit.Pin, Suit.Sou, Suit.Man],
    [Suit.Sou, Suit.Man, Suit.Pin],
    [Suit.Sou, Suit.Pin, Suit.Man],
  ];
  
  for (let i = 1; i <= 5; i++) {
    for (const [s1, s2, s3] of perms) {
      const { cost: totalMissing, missing: missingTiles } = planSequences(hand, melds, [
        { suit: s1, startVal: i }, { suit: s2, startVal: i + 1 }, { suit: s3, startVal: i + 2 },
      ]);
      if (totalMissing <= 4) {
        const { score: exScore, details: exDetails } = calculateMCRExtras(allTiles, melds, ['sanSeSanBuGao']);
        
        suggestions.push({
          name: t.mixedShiftedChows,
          baseFan: 6,
          fan: 6 + exScore,
          probability: 0,
          missingTiles: missingTiles.slice(0, 4),
          patternDetails: [`${t.mixedShiftedChows} (6)`, ...exDetails]
        });
      }
    }
  }

  // 3. Five Gates (Wu Men Qi) - 6 Fan
  // 五门齐：和牌时万、筒、条、风、箭全有
  const hasManMCR = getSuitCount(allTiles, Suit.Man) > 0;
  const hasPinMCR = getSuitCount(allTiles, Suit.Pin) > 0;
  const hasSouMCR = getSuitCount(allTiles, Suit.Sou) > 0;
  const hasWindMCR = allTiles.some(x => x.suit === Suit.Zihai && x.value <= 4);
  const hasDragonMCR = allTiles.some(x => x.suit === Suit.Zihai && x.value >= 5);
  
  let gates = 0;
  if(hasManMCR) gates++; if(hasPinMCR) gates++; if(hasSouMCR) gates++; if(hasWindMCR) gates++; if(hasDragonMCR) gates++;
  
  // 向听数用与主分析同一套算法，避免「同一批牌被多副面子重复计入」的乐观估算
  const shantenEstimate = Math.max(0, calculateShanten(hand, melds));
  
  if (gates === 5 && shantenEstimate <= 2) {
    const { score: exScore, details: exDetails } = calculateMCRExtras(allTiles, melds, ['wuMenQi']);
    suggestions.push({
      name: t.fiveGates,
      baseFan: 6,
      fan: 6 + exScore,
      probability: 0,
      missingTiles: [],
      patternDetails: [`${t.fiveGates} (6)`, `向听${shantenEstimate}`, ...exDetails]
    });
  } else if (gates === 4 && shantenEstimate <= 1) {
    const missing: Tile[] = [];
    if(!hasManMCR) missing.push(createTile(Suit.Man, 5));
    if(!hasPinMCR) missing.push(createTile(Suit.Pin, 5));
    if(!hasSouMCR) missing.push(createTile(Suit.Sou, 5));
    if(!hasWindMCR) missing.push(createTile(Suit.Zihai, 1));
    if(!hasDragonMCR) missing.push(createTile(Suit.Zihai, 5));
    
    const { score: exScore, details: exDetails } = calculateMCRExtras(allTiles, melds, ['wuMenQi']);
    suggestions.push({
      name: t.fiveGates,
      baseFan: 6,
      fan: 6 + exScore,
      probability: 0,
      missingTiles: missing,
      patternDetails: [`${t.fiveGates} (6)`, `缺${missing.length}门，向听${shantenEstimate}`, ...exDetails]
    });
  }
  
  // 4. Pure Straight (Qing Long) - 16 Fan
  [Suit.Man, Suit.Pin, Suit.Sou].forEach(s => {
    const { cost: total, missing } = planSequences(hand, melds, [
      { suit: s, startVal: 1 }, { suit: s, startVal: 4 }, { suit: s, startVal: 7 },
    ]);

    if (total <= 5) {
      suggestions.push({
        name: t.pureStraight,
        baseFan: 16,
        fan: 16,
        probability: 0,
        missingTiles: missing.slice(0, 4),
        patternDetails: [`${t.pureStraight} (16)`]
      });
    }
  });

  // 5. Full Flush (清一色 24番) / Half Flush (混一色 6番)
  let maxSuitMCR = Suit.Man;
  let maxSuitCountMCR = 0;
  [Suit.Man, Suit.Pin, Suit.Sou].forEach(s => {
    const c = getSuitCount(allTiles, s);
    if (c > maxSuitCountMCR) { maxSuitCountMCR = c; maxSuitMCR = s; }
  });
  
  const honorCount = allTiles.filter(t => t.suit === Suit.Zihai).length;
  const otherSuitCountMCR = allTiles.length - maxSuitCountMCR - honorCount;
  
  // 清一色
  if (maxSuitCountMCR >= 8 && otherSuitCountMCR + honorCount <= 4) {
    const needToDiscard = otherSuitCountMCR + honorCount;
    const probQYS = Math.min(90, maxSuitCountMCR * 7 - needToDiscard * 10);
    
    if (needToDiscard === 0) {
      suggestions.push({
        name: t.fullFlush,
        baseFan: 24,
        fan: 24,
        probability: 0,
        missingTiles: [],
        patternDetails: [`${t.fullFlush} (24)`, `已达成`]
      });
    } else {
      suggestions.push({
        name: t.fullFlush,
        baseFan: 24,
        fan: 24,
        probability: 0,
        missingTiles: [],
        patternDetails: [`${t.fullFlush} (24)`, `需打掉${needToDiscard}张其他花色`]
      });
    }
  }
  
  // 混一色
  if (maxSuitCountMCR >= 7 && honorCount >= 1 && otherSuitCountMCR <= 4) {
    const needToDiscard = otherSuitCountMCR;
    const probHYS = Math.min(85, (maxSuitCountMCR + honorCount) * 5);
    
    if (needToDiscard === 0) {
      const { score: exScoreHYS, details: exDetailsHYS } = calculateMCRExtras(allTiles, melds, ['hunYiSe']);
      suggestions.push({
        name: t.mixedOneSuit,
        baseFan: 6,
        fan: 6 + exScoreHYS,
        probability: 0,
        missingTiles: [],
        patternDetails: [`${t.mixedOneSuit} (6)`, `已达成`, ...exDetailsHYS]
      });
    } else {
      const { score: exScoreHYS, details: exDetailsHYS } = calculateMCRExtras(allTiles, melds, ['hunYiSe']);
      suggestions.push({
        name: t.mixedOneSuit,
        baseFan: 6,
        fan: 6 + exScoreHYS,
        probability: 0,
        missingTiles: [],
        patternDetails: [`${t.mixedOneSuit} (6)`, `需打掉${needToDiscard}张其他花色`, ...exDetailsHYS]
      });
    }
  }
  
  // ========== 小番种检测 (用于计算附加分) ==========
  
  // 5a. 一般高 (Yi Ban Gao) - 1 Fan
  // 同一花色2组相同序数的顺子
  [Suit.Man, Suit.Pin, Suit.Sou].forEach(s => {
    for (let i = 1; i <= 7; i++) {
      if (chowAvailable(hand, melds, s, i) >= 2) {
        suggestions.push({
          name: t.pureDoubleChow || '一般高',
          baseFan: 1,
          fan: 1,
          probability: 0,
          missingTiles: [],
          patternDetails: [`${t.pureDoubleChow || '一般高'} (1)`]
        });
      }
    }
  });
  
  // 5b. 连六 (Lian Liu) - 1 Fan
  // 同一花色两组相连的顺子（如123+456）；碰杠不能拆成顺子
  [Suit.Man, Suit.Pin, Suit.Sou].forEach(s => {
    for (let i = 1; i <= 4; i++) {
      if (chowAvailable(hand, melds, s, i) >= 1 && chowAvailable(hand, melds, s, i + 3) >= 1) {
        suggestions.push({
          name: t.shortStraight || '连六',
          baseFan: 1,
          fan: 1,
          probability: 0,
          missingTiles: [],
          patternDetails: [`${t.shortStraight || '连六'} (1)`]
        });
      }
    }
  });
  
  // 5c. 老少副 (Lao Shao Fu) - 1 Fan
  // 同一花色123和789两组顺子
  [Suit.Man, Suit.Pin, Suit.Sou].forEach(s => {
    const has123 = costToMakeSeq(hand, melds, s, 1) === 0;
    const has789 = costToMakeSeq(hand, melds, s, 7) === 0;
    
    if (has123 && has789) {
      suggestions.push({
        name: t.twoTerminalChows || '老少副',
        baseFan: 1,
        fan: 1,
        probability: 0,
        missingTiles: [],
        patternDetails: [`${t.twoTerminalChows || '老少副'} (1)`]
      });
    }
  });
  
  // 5d. 断幺 (Duan Yao) - 2 Fan
  // 和牌时无幺九牌及字牌
  const hasTerminalOrHonor = allTiles.some(tile => 
    tile.suit === Suit.Zihai || tile.value === 1 || tile.value === 9
  );
  
  if (!hasTerminalOrHonor && allTiles.length >= 10) {
    suggestions.push({
      name: t.allSimples || '断幺',
      baseFan: 2,
      fan: 2,
      probability: 0,
      missingTiles: [],
      patternDetails: [`${t.allSimples || '断幺'} (2)`, '已达成']
    });
  } else if (allTiles.length >= 10) {
    const terminalCount = allTiles.filter(tile => 
      tile.suit === Suit.Zihai || tile.value === 1 || tile.value === 9
    ).length;
    
    if (terminalCount <= 3) {
      suggestions.push({
        name: t.allSimples || '断幺',
        baseFan: 2,
        fan: 2,
        probability: 0,
        missingTiles: [],
        patternDetails: [`${t.allSimples || '断幺'} (2)`, `需打掉${terminalCount}张幺九字牌`]
      });
    }
  }
  
  // 5e. 无字 (Wu Zi) - 1 Fan
  // 和牌时没有字牌
  const hasHonors = allTiles.some(tile => tile.suit === Suit.Zihai);
  
  if (!hasHonors && allTiles.length >= 10) {
    suggestions.push({
      name: t.noHonors || '无字',
      baseFan: 1,
      fan: 1,
      probability: 0,
      missingTiles: [],
      patternDetails: [`${t.noHonors || '无字'} (1)`, '已达成']
    });
  }
  
  // 5f. 缺一门 (Que Yi Men) - 1 Fan
  // 和牌时缺少一种花色序数牌
  const suitPresent = [hasManMCR, hasPinMCR, hasSouMCR].filter(Boolean).length;
  
  if (suitPresent === 2 && allTiles.length >= 10) {
    suggestions.push({
      name: lang === 'zh' ? '缺一门' : 'One Voided Suit',
      baseFan: 1,
      fan: 1,
      probability: 0,
      missingTiles: [],
      patternDetails: [`${lang === 'zh' ? '缺一门' : 'One Voided Suit'} (1)`, '已达成']
    });
  }

  // 6. Seven Pairs (七对) - 24 Fan
  let pairs = 0;
  const singleTiles: Tile[] = [];
  counts.forEach((count, key) => {
    if (count >= 2) pairs++;
    if (count === 1) singleTiles.push(tileFromKey(key));
  });
  
  const pairsNeeded = 7 - pairs;
  const tilesNeededForQiDui = pairsNeeded;
  
  if (pairs >= 3 && melds.length === 0 && singleTiles.length >= pairsNeeded) {
    const missingForQiDui = singleTiles.slice(0, Math.min(pairsNeeded, 4));
    const baseProb = pairs >= 6 ? 90 : pairs >= 5 ? 75 : pairs >= 4 ? 55 : 35;
    const adjustedProb = Math.max(10, baseProb - tilesNeededForQiDui * 8);
    
    suggestions.push({
      name: t.sevenPairs,
      baseFan: 24,
      fan: 24,
      probability: 0,
      missingTiles: missingForQiDui,
      patternDetails: [`${t.sevenPairs} (24)`, `已有${pairs}对，缺${pairsNeeded}张`]
    });
  }
  
  // 7. Four Concealed Pungs (四暗刻) - 64 Fan
  {
    // 暗刻只能来自暗手或暗杠；明吃/明碰/明杠/补杠都不是暗刻。
    const concealedKongs = melds.filter(m => m.type === 'gang' && m.kongKind === 'concealed').length;
    let anKeCountForSuggestion = concealedKongs;
    handCounts.forEach(count => { if (count >= 3) anKeCountForSuggestion++; });

    const hasExposedMeld = melds.some(m =>
      m.type === 'chi' || m.type === 'pong' || (m.type === 'gang' && m.kongKind !== 'concealed'));

    if (anKeCountForSuggestion >= 4 && !hasExposedMeld) {
      const { score: exScoreSiAnKe, details: exDetailsSiAnKe } = calculateMCRExtras(allTiles, melds, ['siAnKe', 'pengPengHu', 'menQianQing', 'buQiuRen', 'sanAnKe', 'shuangAnKe']);
      
      suggestions.push({
        name: t.fourConcealedPungs || '四暗刻',
        baseFan: 64,
        fan: 64 + exScoreSiAnKe,
        probability: 0,
        missingTiles: [],
        patternDetails: [`${t.fourConcealedPungs || '四暗刻'} (64)`, `已有${anKeCountForSuggestion}个暗刻`, ...exDetailsSiAnKe]
      });
    } else if (anKeCountForSuggestion >= 3 && !hasExposedMeld) {
      const pairTilesForSiAnKe: Tile[] = [];
      handCounts.forEach((count, key) => { if (count === 2) pairTilesForSiAnKe.push(tileFromKey(key)); });
      
      if (pairTilesForSiAnKe.length > 0) {
        const { score: exScoreSiAnKe, details: exDetailsSiAnKe } = calculateMCRExtras(allTiles, melds, ['siAnKe', 'pengPengHu', 'menQianQing', 'buQiuRen', 'sanAnKe', 'shuangAnKe']);
        
        suggestions.push({
          name: t.fourConcealedPungs || '四暗刻',
          baseFan: 64,
          fan: 64 + exScoreSiAnKe,
          probability: 0,
          missingTiles: pairTilesForSiAnKe.slice(0, 1),
          patternDetails: [`${t.fourConcealedPungs || '四暗刻'} (64)`, `已有${anKeCountForSuggestion}个暗刻，缺1张`, ...exDetailsSiAnKe]
        });
      }
    }
  }
  
  // 8. All Pungs (碰碰和) - 6 Fan
  // 刻子只数暗手里的三张；碰/杠副露单独按副计数，避免同一副被重复计入。
  let trips = 0;
  const pongMeldsCount = melds.filter(m => m.type === 'pong' || m.type === 'gang').length;
  handCounts.forEach(count => { if (count >= 3) trips++; });
  
  const totalTrips = trips + pongMeldsCount;
  
  const pairTilesForPeng: Tile[] = [];
  handCounts.forEach((count, key) => { if (count === 2) pairTilesForPeng.push(tileFromKey(key)); });
  
  // 检查是否有更高番型（如四暗刻）排除了碰碰和
  const anKeForPeng = trips;
  const hasSiAnKe = anKeForPeng >= 4 && melds.every(m =>
    m.type !== 'chi' && m.type !== 'pong' && (m.type !== 'gang' || m.kongKind === 'concealed'));
  
  if ((totalTrips >= 2 || pairTilesForPeng.length >= 4) && !hasSiAnKe) {
    const tripsNeededForPeng = Math.max(0, 4 - totalTrips);
    const missingForPeng = pairTilesForPeng.slice(0, Math.min(tripsNeededForPeng, 4));
    
    const baseProbPeng = totalTrips >= 3 ? 80 : totalTrips >= 2 ? 55 : 35;
    const { score: exScorePeng, details: exDetailsPeng } = calculateMCRExtras(allTiles, melds, ['pengPengHu']);
    
    suggestions.push({
      name: t.allPungs,
      baseFan: 6,
      fan: 6 + exScorePeng,
      probability: 0,
      missingTiles: missingForPeng,
      patternDetails: [`${t.allPungs} (6)`, `已有${totalTrips}刻，缺${tripsNeededForPeng}张`, ...exDetailsPeng]
    });
  }

  // 9. 妙手回春/海底捞月：只有「牌墙仅剩 1 张」这一已记录事实 + 13 张等效听牌形态才提示。
  //    其余牌墙张数不能确定末张，也不推断胜率（概率固定 0）。
  const effectiveTiles = hand.length + melds.length * 3;
  if (wallCount === 1 && effectiveTiles === 13) {
    suggestions.push({
      name: lang === 'zh' ? '妙手回春/海底捞月' : 'Last Tile Draw/Claim',
      baseFan: 8,
      fan: 8,
      probability: 0,
      missingTiles: [],
      patternDetails: [
        `${t.lastTileDraw || '妙手回春'} / ${t.lastTileClaim || '海底捞月'} (8)`,
        lang === 'zh' ? '牌墙仅剩 1 张' : 'Only one tile left in the wall',
        lang === 'zh' ? '自摸/点和来源未知，需按实际和牌方式确认' : 'Win source unknown; confirm the actual last-tile event'
      ]
    });
  }

  // 互斥番种组 - 同组内只保留番数最高的
  // 高番种会排除低番种（不计规则）
  const exclusiveGroups = [
    // 48番 vs 24番 - 四同顺/四节高 排除 三同顺/三节高
    [
      t.quadrupleChow || '一色四同顺',
      t.pureTripleChow || '一色三同顺'
    ],
    [
      t.fourPureShiftedPungs || '一色四节高',
      t.pureShiftedPungs || '一色三节高'
    ],
    // 24番互斥 - 同样的牌可以解释为不同番种
    [t.pureTripleChow || '一色三同顺', t.pureShiftedPungs || '一色三节高'],
    // 48番互斥 - 同样的牌可以解释为不同番种
    [
      t.quadrupleChow || '一色四同顺',
      t.fourPureShiftedPungs || '一色四节高'
    ],
    // 8番互斥
    [t.mixedTripleChow, t.mixedShiftedPungs || '三色三节高'],
  ];

  // 去重：同一番种只保留最高概率的
  const uniqueSuggestions = new Map<string, FanSuggestion>();
  suggestions.forEach(s => {
    const existing = uniqueSuggestions.get(s.name);
    if (!existing || s.fan > existing.fan || (s.fan === existing.fan && s.probability > existing.probability)) {
      uniqueSuggestions.set(s.name, s);
    }
  });
  
  // 处理互斥番种组：同组内只保留番数最高（或概率最高）的
  for (const group of exclusiveGroups) {
    const groupSuggestions = group
      .map(name => uniqueSuggestions.get(name))
      .filter((s): s is FanSuggestion => s !== undefined);
    
    if (groupSuggestions.length > 1) {
      // 按番数降序，相同番数按概率降序排序
      groupSuggestions.sort((a, b) => {
        if (b.fan !== a.fan) return b.fan - a.fan;
        return b.probability - a.probability;
      });
      
      // 只保留第一个（最高的），删除其他
      for (let i = 1; i < groupSuggestions.length; i++) {
        uniqueSuggestions.delete(groupSuggestions[i].name);
      }
    }
  }
  
  // 排序：严格按总番数降序，相同番数按概率降序
  return Array.from(uniqueSuggestions.values())
    .sort((a, b) => {
      if (b.fan !== a.fan) return b.fan - a.fan;
      return b.probability - a.probability;
    });
};
