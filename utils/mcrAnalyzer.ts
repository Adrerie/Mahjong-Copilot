/**
 * 国标麻将分析建议模块
 * - 分析当前手牌可能达成的番型
 * - 计算各番型的概率和缺牌
 */

import { Tile, Meld, Suit, FanSuggestion, Language } from '../types';
import { createTile, getTileKey, TEXT } from '../constants';
import { countTiles, getSuitCount } from './tileHelpers';
import { recognizeMCRPatterns, calculateTotalFan, calculateMCRExtras } from './mcrPatterns';

// ========== 辅助函数 ==========

// 判断是否已有某顺子或其中一张牌
const hasTileOrSeq = (hand: Tile[], melds: Meld[], suit: Suit, value: number): boolean => {
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
  return allTiles.some(t => t.suit === suit && t.value === value);
};

// 计算组成某顺子的成本（缺少的牌数）
const costToMakeSeq = (hand: Tile[], melds: Meld[], suit: Suit, startVal: number): number => {
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
  let cost = 0;
  for (let v = startVal; v <= startVal + 2; v++) {
    if (!allTiles.some(t => t.suit === suit && t.value === v)) {
      cost++;
    }
  }
  return cost;
};

// 获取组成某顺子缺少的牌
const getMissingForSeq = (hand: Tile[], suit: Suit, startVal: number): Tile[] => {
  const missing: Tile[] = [];
  for (let v = startVal; v <= startVal + 2; v++) {
    if (!hand.some(t => t.suit === suit && t.value === v)) {
      missing.push(createTile(suit, v));
    }
  }
  return missing;
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
  
  // --- 48番 番种检测 ---

  // 0a. Quadruple Chow (Yi Se Si Tong Shun) - 48 Fan
  // 一色四同顺：一种花色4组相同序数的顺子
  [Suit.Man, Suit.Pin, Suit.Sou].forEach(s => {
    for (let i = 1; i <= 7; i++) {
      const has1 = allTiles.filter(tile => tile.suit === s && tile.value === i).length;
      const has2 = allTiles.filter(tile => tile.suit === s && tile.value === i + 1).length;
      const has3 = allTiles.filter(tile => tile.suit === s && tile.value === i + 2).length;
      const minCount = Math.min(has1, has2, has3);
      
      if (minCount >= 4) {
        const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, null, t, ['yiSeSiTongShun', 'yiSeSanTongShun', 'yiBanGao', 'siGuiYi']);
        suggestions.push({
          name: t.quadrupleChow || '一色四同顺',
          baseFan: 48,
          fan: 48 + extraScore,
          probability: 95,
          missingTiles: [],
          patternDetails: [`${t.quadrupleChow || '一色四同顺'} (48)`, ...extraDetails]
        });
      } else if (minCount >= 3) {
        // 已有3组，缺1组
        const missing: Tile[] = [];
        if (has1 < 4) missing.push(createTile(s, i));
        if (has2 < 4) missing.push(createTile(s, i + 1));
        if (has3 < 4) missing.push(createTile(s, i + 2));
        
        const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, null, t, ['yiSeSiTongShun', 'yiSeSanTongShun', 'yiBanGao', 'siGuiYi']);
        suggestions.push({
          name: t.quadrupleChow || '一色四同顺',
          baseFan: 48,
          fan: 48 + extraScore,
          probability: 70,
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
      const has1 = allTiles.filter(tile => tile.suit === s && tile.value === i).length;
      const has2 = allTiles.filter(tile => tile.suit === s && tile.value === i + 1).length;
      const has3 = allTiles.filter(tile => tile.suit === s && tile.value === i + 2).length;
      const has4 = allTiles.filter(tile => tile.suit === s && tile.value === i + 3).length;
      
      if (has1 >= 3 && has2 >= 3 && has3 >= 3 && has4 >= 3) {
        const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, null, t, ['yiSeSiJieGao', 'yiSeSanJieGao', 'pengPengHu']);
        suggestions.push({
          name: t.fourPureShiftedPungs || '一色四节高',
          baseFan: 48,
          fan: 48 + extraScore,
          probability: 95,
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
          const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, null, t, ['yiSeSiJieGao', 'yiSeSanJieGao', 'pengPengHu']);
          suggestions.push({
            name: t.fourPureShiftedPungs || '一色四节高',
            baseFan: 48,
            fan: 48 + extraScore,
            probability: Math.max(40, 80 - missing.length * 10),
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
      
      // 检查这个花色的该顺子可以组成几组（统计牌数）
      const has1 = allTiles.filter(tile => tile.suit === s && tile.value === i).length;
      const has2 = allTiles.filter(tile => tile.suit === s && tile.value === i + 1).length;
      const has3 = allTiles.filter(tile => tile.suit === s && tile.value === i + 2).length;
      const minCount = Math.min(has1, has2, has3);
      
      // 如果已经有足够的牌组成3组相同顺子
      if (minCount >= 3) {
        const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, null, t, ['yiSeSanTongShun']);
        suggestions.push({
          name: t.pureTripleChow || '一色三同顺',
          baseFan: 24,
          fan: 24 + extraScore,
          probability: 90,
          missingTiles: [],
          patternDetails: [`${t.pureTripleChow || '一色三同顺'} (24)`, ...extraDetails]
        });
      } else if (minCount >= 2 && seqCost === 0) {
        // 已有2组，缺1组
        const missing: Tile[] = [];
        if (has1 < 3) missing.push(createTile(s, i));
        if (has2 < 3) missing.push(createTile(s, i + 1));
        if (has3 < 3) missing.push(createTile(s, i + 2));
        
        const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, null, t, ['yiSeSanTongShun']);
        suggestions.push({
          name: t.pureTripleChow || '一色三同顺',
          baseFan: 24,
          fan: 24 + extraScore,
          probability: 70,
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
      // 检查连续3个值的刻子
      const has1 = allTiles.filter(tile => tile.suit === s && tile.value === i).length;
      const has2 = allTiles.filter(tile => tile.suit === s && tile.value === i + 1).length;
      const has3 = allTiles.filter(tile => tile.suit === s && tile.value === i + 2).length;
      
      // 每个都需要至少3张才能成刻子
      if (has1 >= 3 && has2 >= 3 && has3 >= 3) {
        const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, null, t, ['yiSeSanJieGao']);
        suggestions.push({
          name: t.pureShiftedPungs || '一色三节高',
          baseFan: 24,
          fan: 24 + extraScore,
          probability: 90,
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
          const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, null, t, ['yiSeSanJieGao']);
          suggestions.push({
            name: t.pureShiftedPungs || '一色三节高',
            baseFan: 24,
            fan: 24 + extraScore,
            probability: Math.max(40, 80 - missing.length * 15),
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
      const c1 = costToMakeSeq(hand, melds, s, i);
      const c2 = costToMakeSeq(hand, melds, s, i + 1);
      const c3 = costToMakeSeq(hand, melds, s, i + 2);
      const total = c1 + c2 + c3;
      
      if (total <= 4) {
        const missing = [
          ...getMissingForSeq(hand, s, i),
          ...getMissingForSeq(hand, s, i + 1),
          ...getMissingForSeq(hand, s, i + 2)
        ];
        const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, null, t, ['yiSeSanBuGao']);
        suggestions.push({
          name: t.pureShiftedChows || '一色三步高',
          baseFan: 16,
          fan: 16 + extraScore,
          probability: Math.max(20, 80 - total * 15),
          missingTiles: missing.slice(0, 4),
          patternDetails: [`${t.pureShiftedChows || '一色三步高'} (16)`, ...extraDetails]
        });
      }
    }
    // 递增2: 如123 345 567
    for (let i = 1; i <= 3; i++) {
      const c1 = costToMakeSeq(hand, melds, s, i);
      const c2 = costToMakeSeq(hand, melds, s, i + 2);
      const c3 = costToMakeSeq(hand, melds, s, i + 4);
      const total = c1 + c2 + c3;
      
      if (total <= 4) {
        const missing = [
          ...getMissingForSeq(hand, s, i),
          ...getMissingForSeq(hand, s, i + 2),
          ...getMissingForSeq(hand, s, i + 4)
        ];
        const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, null, t, ['yiSeSanBuGao']);
        suggestions.push({
          name: t.pureShiftedChows || '一色三步高',
          baseFan: 16,
          fan: 16 + extraScore,
          probability: Math.max(20, 80 - total * 15),
          missingTiles: missing.slice(0, 4),
          patternDetails: [`${t.pureShiftedChows || '一色三步高'} (16)`, ...extraDetails]
        });
      }
    }
  });

  // 1e. Triple Pung (San Tong Ke) - 16 Fan  
  // 三同刻：3种花色相同序数的刻子
  for (let v = 1; v <= 9; v++) {
    const hasMan = allTiles.filter(tile => tile.suit === Suit.Man && tile.value === v).length;
    const hasPin = allTiles.filter(tile => tile.suit === Suit.Pin && tile.value === v).length;
    const hasSou = allTiles.filter(tile => tile.suit === Suit.Sou && tile.value === v).length;
    
    if (hasMan >= 3 && hasPin >= 3 && hasSou >= 3) {
      const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, null, t, ['sanTongKe']);
      suggestions.push({
        name: t.triplePung || '三同刻',
        baseFan: 16,
        fan: 16 + extraScore,
        probability: 90,
        missingTiles: [],
        patternDetails: [`${t.triplePung || '三同刻'} (16)`, ...extraDetails]
      });
    } else if (hasMan >= 2 && hasPin >= 2 && hasSou >= 2) {
      const missing: Tile[] = [];
      if (hasMan < 3) missing.push(createTile(Suit.Man, v));
      if (hasPin < 3) missing.push(createTile(Suit.Pin, v));
      if (hasSou < 3) missing.push(createTile(Suit.Sou, v));
      
      if (missing.length <= 3) {
        const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, null, t, ['sanTongKe']);
        suggestions.push({
          name: t.triplePung || '三同刻',
          baseFan: 16,
          fan: 16 + extraScore,
          probability: Math.max(30, 75 - missing.length * 15),
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
    const c1 = costToMakeSeq(hand, melds, perm[0][0] as Suit, perm[0][1] as number);
    const c2 = costToMakeSeq(hand, melds, perm[1][0] as Suit, perm[1][1] as number);
    const c3 = costToMakeSeq(hand, melds, perm[2][0] as Suit, perm[2][1] as number);
    const total = c1 + c2 + c3;
    
    if (total <= 5) {
      const missing = [
        ...getMissingForSeq(hand, perm[0][0] as Suit, perm[0][1] as number),
        ...getMissingForSeq(hand, perm[1][0] as Suit, perm[1][1] as number),
        ...getMissingForSeq(hand, perm[2][0] as Suit, perm[2][1] as number)
      ];
      const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, null, t, ['huaLong']);
      suggestions.push({
        name: t.mixedStraight || '花龙',
        baseFan: 8,
        fan: 8 + extraScore,
        probability: Math.max(15, 75 - total * 12),
        missingTiles: missing.slice(0, 4),
        patternDetails: [`${t.mixedStraight || '花龙'} (8)`, ...extraDetails]
      });
    }
  }

  // 1g. Mixed Triple Chow (San Se San Tong Shun) - 8 Fan
  // 三色三同顺：3种花色相同序数的顺子
  for (let i = 1; i <= 7; i++) { // Can be 123 to 789
    const m1 = costToMakeSeq(hand, melds, Suit.Man, i);
    const m2 = costToMakeSeq(hand, melds, Suit.Pin, i);
    const m3 = costToMakeSeq(hand, melds, Suit.Sou, i);
    const totalMissing = m1 + m2 + m3;
    
    // 必须是三种不同花色各一组
    if (totalMissing <= 5) {
      const missingTiles = [
        ...getMissingForSeq(hand, Suit.Man, i),
        ...getMissingForSeq(hand, Suit.Pin, i),
        ...getMissingForSeq(hand, Suit.Sou, i)
      ];
      
      // Calculate extras (排除主番种避免重复显示)
      const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, null, t, ['sanSeSanTongShun']);
      
      suggestions.push({
        name: t.mixedTripleChow,
        baseFan: 8,
        fan: 8 + extraScore,
        probability: Math.max(10, 80 - totalMissing * 15),
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
      const has1 = allTiles.filter(tile => tile.suit === s1 && tile.value === i).length;
      const has2 = allTiles.filter(tile => tile.suit === s2 && tile.value === i + 1).length;
      const has3 = allTiles.filter(tile => tile.suit === s3 && tile.value === i + 2).length;
      
      if (has1 >= 3 && has2 >= 3 && has3 >= 3) {
        const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, null, t, ['sanSeSanJieGao']);
        suggestions.push({
          name: t.mixedShiftedPungs || '三色三节高',
          baseFan: 8,
          fan: 8 + extraScore,
          probability: 90,
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
          const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, null, t, ['sanSeSanJieGao']);
          suggestions.push({
            name: t.mixedShiftedPungs || '三色三节高',
            baseFan: 8,
            fan: 8 + extraScore,
            probability: Math.max(30, 70 - missing.length * 15),
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
      const c1 = costToMakeSeq(hand, melds, s1, i);
      const c2 = costToMakeSeq(hand, melds, s2, i+1);
      const c3 = costToMakeSeq(hand, melds, s3, i+2);
      const totalMissing = c1 + c2 + c3;
      
      if (totalMissing <= 4) {
        const missingTiles = [
          ...getMissingForSeq(hand, s1, i),
          ...getMissingForSeq(hand, s2, i+1),
          ...getMissingForSeq(hand, s3, i+2)
        ];
        const { score: exScore, details: exDetails } = calculateMCRExtras(allTiles, melds, null, t, ['sanSeSanBuGao']);
        
        suggestions.push({
          name: t.mixedShiftedChows,
          baseFan: 6,
          fan: 6 + exScore,
          probability: Math.max(10, 75 - totalMissing * 15),
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
  
  // 计算基本和牌型的向听数（简化估算）
  const existingMelds = melds.length;
  
  // 估算手牌中的面子和搭子
  let estimatedMelds = existingMelds;
  let estimatedPairs = 0;
  const handCounts = countTiles(hand);
  handCounts.forEach((c) => {
    if (c >= 3) estimatedMelds++;
    if (c >= 2) estimatedPairs++;
  });
  
  // 检查顺子搭子（简化）
  [Suit.Man, Suit.Pin, Suit.Sou].forEach(s => {
    for (let v = 1; v <= 7; v++) {
      const has1 = hand.some(t => t.suit === s && t.value === v);
      const has2 = hand.some(t => t.suit === s && t.value === v + 1);
      const has3 = hand.some(t => t.suit === s && t.value === v + 2);
      if (has1 && has2 && has3) estimatedMelds++;
    }
  });
  
  const shantenEstimate = Math.max(0, 4 - Math.min(4, estimatedMelds));
  
  if (gates === 5 && shantenEstimate <= 2) {
    const { score: exScore, details: exDetails } = calculateMCRExtras(allTiles, melds, null, t, ['wuMenQi']);
    suggestions.push({
      name: t.fiveGates,
      baseFan: 6,
      fan: 6 + exScore,
      probability: Math.max(20, 70 - shantenEstimate * 20),
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
    
    const { score: exScore, details: exDetails } = calculateMCRExtras(allTiles, melds, null, t, ['wuMenQi']);
    suggestions.push({
      name: t.fiveGates,
      baseFan: 6,
      fan: 6 + exScore,
      probability: Math.max(15, 50 - shantenEstimate * 15),
      missingTiles: missing,
      patternDetails: [`${t.fiveGates} (6)`, `缺${missing.length}门，向听${shantenEstimate}`, ...exDetails]
    });
  }
  
  // 4. Pure Straight (Qing Long) - 16 Fan
  [Suit.Man, Suit.Pin, Suit.Sou].forEach(s => {
    const c1 = costToMakeSeq(hand, melds, s, 1);
    const c2 = costToMakeSeq(hand, melds, s, 4);
    const c3 = costToMakeSeq(hand, melds, s, 7);
    const total = c1 + c2 + c3;
    
    if (total <= 5) {
      const missing = [
        ...getMissingForSeq(hand, s, 1),
        ...getMissingForSeq(hand, s, 4),
        ...getMissingForSeq(hand, s, 7)
      ];
      suggestions.push({
        name: t.pureStraight,
        baseFan: 16,
        fan: 16,
        probability: 80 - total * 10,
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
        probability: 95,
        missingTiles: [],
        patternDetails: [`${t.fullFlush} (24)`, `已达成`]
      });
    } else {
      suggestions.push({
        name: t.fullFlush,
        baseFan: 24,
        fan: 24,
        probability: Math.max(20, probQYS),
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
      const { score: exScoreHYS, details: exDetailsHYS } = calculateMCRExtras(allTiles, melds, null, t, ['hunYiSe']);
      suggestions.push({
        name: t.mixedOneSuit,
        baseFan: 6,
        fan: 6 + exScoreHYS,
        probability: 90,
        missingTiles: [],
        patternDetails: [`${t.mixedOneSuit} (6)`, `已达成`, ...exDetailsHYS]
      });
    } else {
      const { score: exScoreHYS, details: exDetailsHYS } = calculateMCRExtras(allTiles, melds, null, t, ['hunYiSe']);
      suggestions.push({
        name: t.mixedOneSuit,
        baseFan: 6,
        fan: 6 + exScoreHYS,
        probability: Math.max(20, probHYS),
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
      const has1 = allTiles.filter(tile => tile.suit === s && tile.value === i).length;
      const has2 = allTiles.filter(tile => tile.suit === s && tile.value === i + 1).length;
      const has3 = allTiles.filter(tile => tile.suit === s && tile.value === i + 2).length;
      const minCount = Math.min(has1, has2, has3);
      
      if (minCount >= 2) {
        suggestions.push({
          name: t.pureDoubleChow || '一般高',
          baseFan: 1,
          fan: 1,
          probability: 95,
          missingTiles: [],
          patternDetails: [`${t.pureDoubleChow || '一般高'} (1)`]
        });
      }
    }
  });
  
  // 5b. 连六 (Lian Liu) - 1 Fan
  // 同一花色6张连续的序数牌
  [Suit.Man, Suit.Pin, Suit.Sou].forEach(s => {
    for (let i = 1; i <= 4; i++) {
      let hasAll = true;
      for (let j = 0; j < 6; j++) {
        if (!allTiles.some(tile => tile.suit === s && tile.value === i + j)) {
          hasAll = false;
          break;
        }
      }
      if (hasAll) {
        suggestions.push({
          name: t.shortStraight || '连六',
          baseFan: 1,
          fan: 1,
          probability: 95,
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
        probability: 95,
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
      probability: 90,
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
        probability: Math.max(20, 70 - terminalCount * 15),
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
      probability: 95,
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
      probability: 95,
      missingTiles: [],
      patternDetails: [`${lang === 'zh' ? '缺一门' : 'One Voided Suit'} (1)`, '已达成']
    });
  }

  // 6. Seven Pairs (七对) - 24 Fan
  let pairs = 0;
  const singleTiles: Tile[] = [];
  counts.forEach((c, key) => { 
    if (c >= 2) pairs++;
    if (c === 1) {
      const value = parseInt(key[0]);
      const suitChar = key.slice(1);
      const suit = suitChar === 'm' ? Suit.Man : suitChar === 'p' ? Suit.Pin : suitChar === 's' ? Suit.Sou : Suit.Zihai;
      singleTiles.push(createTile(suit, value));
    }
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
      probability: adjustedProb,
      missingTiles: missingForQiDui,
      patternDetails: [`${t.sevenPairs} (24)`, `已有${pairs}对，缺${pairsNeeded}张`]
    });
  }
  
  // 7. Four Concealed Pungs (四暗刻) - 64 Fan
  {
    let anKeCountForSuggestion = 0;
    counts.forEach(c => { if(c >= 3) anKeCountForSuggestion++; });
    
    const hasMingPong = melds.some(m => m.type === 'pong');
    
    if (anKeCountForSuggestion >= 4 && !hasMingPong) {
      const { score: exScoreSiAnKe, details: exDetailsSiAnKe } = calculateMCRExtras(allTiles, melds, null, t, ['siAnKe', 'pengPengHu', 'menQianQing', 'buQiuRen', 'sanAnKe', 'shuangAnKe']);
      
      suggestions.push({
        name: t.fourConcealedPungs || '四暗刻',
        baseFan: 64,
        fan: 64 + exScoreSiAnKe,
        probability: 95,
        missingTiles: [],
        patternDetails: [`${t.fourConcealedPungs || '四暗刻'} (64)`, `已有${anKeCountForSuggestion}个暗刻`, ...exDetailsSiAnKe]
      });
    } else if (anKeCountForSuggestion >= 3 && !hasMingPong) {
      const pairTilesForSiAnKe: Tile[] = [];
      counts.forEach((c, key) => {
        if (c === 2) {
          const value = parseInt(key[0]);
          const suitChar = key.slice(1);
          const suit = suitChar === 'm' ? Suit.Man : suitChar === 'p' ? Suit.Pin : suitChar === 's' ? Suit.Sou : Suit.Zihai;
          pairTilesForSiAnKe.push(createTile(suit, value));
        }
      });
      
      if (pairTilesForSiAnKe.length > 0) {
        const { score: exScoreSiAnKe, details: exDetailsSiAnKe } = calculateMCRExtras(allTiles, melds, null, t, ['siAnKe', 'pengPengHu', 'menQianQing', 'buQiuRen', 'sanAnKe', 'shuangAnKe']);
        
        suggestions.push({
          name: t.fourConcealedPungs || '四暗刻',
          baseFan: 64,
          fan: 64 + exScoreSiAnKe,
          probability: 60,
          missingTiles: pairTilesForSiAnKe.slice(0, 1),
          patternDetails: [`${t.fourConcealedPungs || '四暗刻'} (64)`, `已有${anKeCountForSuggestion}个暗刻，缺1张`, ...exDetailsSiAnKe]
        });
      }
    }
  }
  
  // 8. All Pungs (碰碰和) - 6 Fan
  let trips = 0;
  const pongMeldsCount = melds.filter(m => m.type === 'pong' || m.type === 'gang').length;
  counts.forEach(c => { if(c >= 3) trips++; });
  
  const totalTrips = trips + pongMeldsCount;
  
  const pairTilesForPeng: Tile[] = [];
  counts.forEach((c, key) => {
    if (c === 2) {
      const value = parseInt(key[0]);
      const suitChar = key.slice(1);
      const suit = suitChar === 'm' ? Suit.Man : suitChar === 'p' ? Suit.Pin : suitChar === 's' ? Suit.Sou : Suit.Zihai;
      pairTilesForPeng.push(createTile(suit, value));
    }
  });
  
  // 检查是否有更高番型（如四暗刻）排除了碰碰和
  const anKeForPeng = trips;
  const hasSiAnKe = anKeForPeng >= 4 && melds.every(m => m.type !== 'pong');
  
  if ((totalTrips >= 2 || pairTilesForPeng.length >= 4) && !hasSiAnKe) {
    const tripsNeededForPeng = Math.max(0, 4 - totalTrips);
    const missingForPeng = pairTilesForPeng.slice(0, Math.min(tripsNeededForPeng, 4));
    
    const baseProbPeng = totalTrips >= 3 ? 80 : totalTrips >= 2 ? 55 : 35;
    const { score: exScorePeng, details: exDetailsPeng } = calculateMCRExtras(allTiles, melds, null, t, ['pengPengHu']);
    
    suggestions.push({
      name: t.allPungs,
      baseFan: 6,
      fan: 6 + exScorePeng,
      probability: baseProbPeng,
      missingTiles: missingForPeng,
      patternDetails: [`${t.allPungs} (6)`, `已有${totalTrips}刻，缺${tripsNeededForPeng}张`, ...exDetailsPeng]
    });
  }

  // 9. 妙手回春/海底捞月 - 牌墙将尽时的特殊提示 (8 Fan)
  if (typeof wallCount === 'number' && wallCount <= 4 && wallCount > 0) {
    // 如果听牌状态且牌墙快空，提示可能获得海底番
    const isNearTenpai = hand.length === 13 || hand.length === 14;
    if (isNearTenpai) {
      suggestions.push({
        name: wallCount === 1 
          ? (lang === 'zh' ? '妙手回春/海底捞月' : 'Last Tile Draw/Claim')
          : (lang === 'zh' ? '海底机会' : 'Last Tile Chance'),
        baseFan: 8,
        fan: 8,
        probability: wallCount === 1 ? 90 : Math.max(10, 60 - (wallCount - 1) * 15),
        missingTiles: [],
        patternDetails: [
          `${t.lastTileDraw || '妙手回春'} / ${t.lastTileClaim || '海底捞月'} (8)`,
          lang === 'zh' 
            ? `牌墙仅剩${wallCount}张` 
            : `Only ${wallCount} tile(s) left`,
          t.lastTileHint || '牌墙将尽，可能获得海底番！'
        ]
      });
    }
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
