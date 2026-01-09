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
  
  // --- PARTIAL PATTERN SEEKERS ---

  // 1. Mixed Triple Chow (San Se San Tong Shun) - 8 Fan
  // Strategy: Look for Sequence S1(n), S2(n), S3(n)
  for (let i = 1; i <= 7; i++) { // Can be 123 to 789
    const m1 = costToMakeSeq(hand, melds, Suit.Man, i);
    const m2 = costToMakeSeq(hand, melds, Suit.Pin, i);
    const m3 = costToMakeSeq(hand, melds, Suit.Sou, i);
    const totalMissing = m1 + m2 + m3;
    
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

  // 去重：同一番种只保留最高概率的
  const uniqueSuggestions = new Map<string, FanSuggestion>();
  suggestions.forEach(s => {
    const existing = uniqueSuggestions.get(s.name);
    if (!existing || s.fan > existing.fan || (s.fan === existing.fan && s.probability > existing.probability)) {
      uniqueSuggestions.set(s.name, s);
    }
  });
  
  // 排序：严格按总番数降序，相同番数按概率降序
  return Array.from(uniqueSuggestions.values())
    .sort((a, b) => {
      if (b.fan !== a.fan) return b.fan - a.fan;
      return b.probability - a.probability;
    });
};
