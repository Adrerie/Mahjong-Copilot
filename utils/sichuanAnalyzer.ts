/**
 * 四川麻将分析模块
 */

import { Suit, Tile, Meld, FanSuggestion, Language } from '../types';
import { createTile, TEXT } from '../constants';
import { countTiles, getSuitCount } from './tileHelpers';

// 四川麻将分析
export const analyzeSichuan = (hand: Tile[], melds: Meld[], voidSuit: Suit | null, lang: Language): FanSuggestion[] => {
  const t = TEXT[lang];
  const suggestions: FanSuggestion[] = [];
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
  const counts = countTiles(allTiles);

  if (voidSuit) {
    const hasVoid = allTiles.some(t => t.suit === voidSuit);
    if (hasVoid) {
      return [{
        name: t.huaZhu,
        fan: 0,
        baseFan: 0,
        probability: 0,
        missingTiles: [],
        patternDetails: [t.illegal],
        description: t.illegal
      }];
    }
  }

  let roots = 0;
  counts.forEach((val) => { if (val === 4) roots++; });

  const suits = new Set(allTiles.map(t => t.suit));
  const isFullFlush = suits.size === 1;
  
  // 统计碰/杠副露
  const pongMelds = melds.filter(m => m.type === 'pong' || m.type === 'gang');

  let pairs = 0;
  let triplets = 0;
  counts.forEach((c) => { 
    if (c >= 2) pairs++; 
    if (c >= 3) triplets++;
  });

  const makeSichuanSug = (name: string, baseFan: number, missing: Tile[], prob: number) => {
    const finalFan = baseFan + roots; 
    const details = [`${name} (${baseFan})`];
    if (roots > 0) details.push(`${t.root} x${roots} (+${roots})`);
    
    suggestions.push({
      name: roots > 0 ? `${name} + ${roots}${t.root}` : name,
      fan: finalFan,
      baseFan: baseFan,
      probability: prob,
      missingTiles: missing,
      patternDetails: details
    });
  };

  if (isFullFlush) {
    if (pairs >= 5) {
      makeSichuanSug(t.qiDui, 4, [], 80);
    } else if (triplets + melds.length >= 3) {
      makeSichuanSug(t.qingDui, 6, [], 85);
    } else {
      makeSichuanSug(t.qingYiSe, 4, [], 90);
    }
  } else {
    // 分析清一色潜力：找出最多的花色，计算需要换掉多少张其他花色的牌
    let maxSuit = Suit.Man; 
    let maxC = 0;
    [Suit.Man, Suit.Pin, Suit.Sou].forEach(s => {
      const c = getSuitCount(allTiles, s);
      if(c > maxC) { maxC = c; maxSuit = s; }
    });
    
    // 需要换掉的牌 = 总牌数 - 最多花色的牌数
    const otherSuitCount = allTiles.length - maxC;
    
    // 如果主花色 >= 8张，或者其他花色 <= 4张，就有清一色的可能
    if (maxC >= 8 || otherSuitCount <= 4) {
      // 找出需要换掉的牌（其他花色）
      const otherSuitTiles = allTiles.filter(tile => tile.suit !== maxSuit).slice(0, 4);
      const missing = otherSuitTiles.map(tile => createTile(tile.suit, tile.value));
      
      // 概率：主花色越多越高
      const prob = Math.min(90, maxC * 7);
      makeSichuanSug(t.qingYiSe, 4, missing, prob);
    }
  }

  // 四川七对分析：需要7对，计算当前对子数和缺少的牌
  if (melds.length === 0) {
    const singleTilesForQiDui: Tile[] = [];
    counts.forEach((c, key) => {
      if (c === 1) {
        const value = parseInt(key[0]);
        const suitChar = key.slice(1);
        const suit = suitChar === 'm' ? Suit.Man : suitChar === 'p' ? Suit.Pin : suitChar === 's' ? Suit.Sou : Suit.Zihai;
        singleTilesForQiDui.push(createTile(suit, value));
      }
    });
    
    const pairsNeededSC = 7 - pairs;
    
    // 如果对子数 >= 3，就有七对的可能
    if (pairs >= 3 && singleTilesForQiDui.length >= pairsNeededSC) {
      const missingForQiDuiSC = singleTilesForQiDui.slice(0, Math.min(pairsNeededSC, 4));
      const baseProbSC = pairs >= 6 ? 90 : pairs >= 5 ? 75 : pairs >= 4 ? 55 : 35;
      const adjustedProbSC = Math.max(10, baseProbSC - pairsNeededSC * 8);
      
      const name = roots > 0 ? t.longQiDui : t.qiDui;
      makeSichuanSug(name, 4, missingForQiDuiSC, adjustedProbSC);
    }
  }

  // 对对胡分析：需要4个刻子+1对将
  // triplets = 手牌中的刻子数，melds中的碰/杠也算
  const totalTripsForDui = triplets + pongMelds.length;
  
  if (totalTripsForDui >= 2 || pairs >= 4) {
    // 找出可以凑刻子的对子（需要再来1张）
    const pairTiles: Tile[] = [];
    counts.forEach((c, key) => {
      if (c === 2) {
        const value = parseInt(key[0]);
        const suitChar = key.slice(1);
        const suit = suitChar === 'm' ? Suit.Man : suitChar === 'p' ? Suit.Pin : suitChar === 's' ? Suit.Sou : Suit.Zihai;
        pairTiles.push(createTile(suit, value));
      }
    });
    
    // 还需要多少个刻子（总共需要4个）
    const tripsNeeded = Math.max(0, 4 - totalTripsForDui);
    const missingForDui = pairTiles.slice(0, Math.min(tripsNeeded, 4));
    
    const isQing = isFullFlush || (getSuitCount(allTiles, allTiles[0]?.suit || Suit.Man) >= 10);
    const baseProb = totalTripsForDui >= 3 ? 80 : totalTripsForDui >= 2 ? 60 : 40;
    
    if (isQing) {
      makeSichuanSug(t.qingDui, 6, missingForDui, baseProb);
    } else {
      makeSichuanSug(t.duiDuiHu, 2, missingForDui, baseProb);
    }
  }

  if (!isFullFlush && pairs < 4 && melds.every(m => m.type === 'chi')) {
    makeSichuanSug(t.pingHu, 0, [], 95);
  }
  
  return suggestions.sort((a, b) => b.fan - a.fan);
};
