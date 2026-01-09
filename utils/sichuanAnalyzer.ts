/**
 * 四川麻将（成都玩法）分析模块
 * 
 * 番种体系（大番优先检测）:
 * 64番: 天和（庄家配牌直接和）
 * 32番: 地和（闲家第一张自摸）
 * 16番: 清幺九、清金钩钓、清七对
 * 8番: 将对、清对
 * 4番: 清一色、金钩钓、七对、带幺九
 * 2番: 门前清(自摸)、断幺九、对对胡
 * 1番: 基本和(无番和/鸡和)
 * 
 * 附加番: 根(+1根)、自摸(+1番或+1根)、杠上开花/抢杠/海底捞月/和绝张(+1根)
 * 
 * 参考: https://zh.moegirl.org.cn/四川麻将
 */

import { Suit, Tile, Meld, FanSuggestion, Language } from '../types';
import { createTile, TEXT } from '../constants';
import { countTiles, getSuitCount } from './tileHelpers';

// ========== 辅助函数 ==========

// 判断是否全是幺九牌（1和9）
const isTerminal = (value: number) => value === 1 || value === 9;

// 判断是否是将牌（2,5,8）
const isJiang = (value: number) => value === 2 || value === 5 || value === 8;

// 解析牌key (如 "1m" -> {value: 1, suit: Man})
const parseKey = (key: string): { value: number; suit: Suit } => {
  const value = parseInt(key[0]);
  const suitChar = key.slice(1);
  const suit = suitChar === 'm' ? Suit.Man : suitChar === 'p' ? Suit.Pin : suitChar === 's' ? Suit.Sou : Suit.Zihai;
  return { value, suit };
};

// ========== 主分析函数 ==========

// 四川麻将分析
export const analyzeSichuan = (hand: Tile[], melds: Meld[], voidSuit: Suit | null, lang: Language): FanSuggestion[] => {
  const t = TEXT[lang];
  const suggestions: FanSuggestion[] = [];
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
  const counts = countTiles(allTiles);

  // 检查花猪（缺一门未完成）
  if (voidSuit) {
    const hasVoid = allTiles.some(tile => tile.suit === voidSuit);
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

  // ========== 基本统计 ==========
  
  // 统计根（四张相同的牌）
  let roots = 0;
  counts.forEach((val) => { if (val === 4) roots++; });

  // 统计花色
  const suits = new Set(allTiles.filter(tile => tile.suit !== Suit.Zihai).map(tile => tile.suit));
  const isFullFlush = suits.size === 1 && allTiles.length > 0;
  
  // 统计副露
  const pongMelds = melds.filter(m => m.type === 'pong' || m.type === 'gang');

  // 统计对子、刻子
  let pairs = 0;
  let triplets = 0;
  let allTerminals = true;  // 是否全是幺九
  let allJiang = true;      // 是否全是将牌（2,5,8）
  
  counts.forEach((c, key) => { 
    if (c >= 2) pairs++; 
    if (c >= 3) triplets++;
    const { value } = parseKey(key);
    if (!isTerminal(value)) allTerminals = false;
    if (!isJiang(value)) allJiang = false;
  });

  // 刻子总数（手牌刻子 + 碰/杠副露）
  const totalTriplets = triplets + pongMelds.length;
  
  // 判断是否金钩钓：4副露碰/杠 + 单钓（手里只剩1张牌）
  // 或者：4副露碰/杠 + 手里只剩1对（听牌状态，再摸1张就是金钩钓和牌）
  const isJinGouDiao = pongMelds.length === 4 && (hand.length === 1 || (hand.length === 2 && pairs === 1));
  
  // 找出主花色
  let maxSuit = Suit.Man; 
  let maxC = 0;
  [Suit.Man, Suit.Pin, Suit.Sou].forEach(s => {
    const c = getSuitCount(allTiles, s);
    if(c > maxC) { maxC = c; maxSuit = s; }
  });

  // ========== 番种建议生成函数 ==========
  
  const makeSug = (name: string, baseFan: number, missing: Tile[], prob: number, extraDetails: string[] = []) => {
    // 计算最终番数：基础番 + 根数（四川麻将番数相加）
    // 倍数 = 2^番数（例：3番 = 2³ = 8倍）
    const finalFan = baseFan + roots;
    
    const details = [`${name} (${baseFan}番)`];
    if (roots > 0) details.push(`${t.root} x${roots} (+${roots}番)`);
    details.push(...extraDetails);
    
    suggestions.push({
      name: roots > 0 ? `${name} + ${roots}${t.root}` : name,
      fan: finalFan,
      baseFan: baseFan,
      probability: prob,
      missingTiles: missing,
      patternDetails: details
    });
  };

  // ========== 从大番到小番依次检测 ==========
  // 参考constants.ts中SICHUAN_BASE_PATTERNS的番数定义
  
  // --- 8番 番种 (清一色复合) ---
  
  // 清金钩钓（8番）：清一色(4) + 金钩钓(4)
  if (isFullFlush && isJinGouDiao) {
    makeSug(t.qingJinGou, 8, [], 95);
    return suggestions;
  }

  // 清七对（8番）：清一色(4) + 七对(4)
  if (isFullFlush && melds.length === 0 && pairs >= 7) {
    makeSug(t.qingQiDui, 8, [], 95);
    return suggestions;
  }
  
  // 清七对潜力
  if (isFullFlush && melds.length === 0 && pairs >= 5) {
    const singleTiles: Tile[] = [];
    counts.forEach((c, key) => {
      if (c === 1 || c === 3) {
        const { value, suit } = parseKey(key);
        singleTiles.push(createTile(suit, value));
      }
    });
    const pairsNeeded = 7 - pairs;
    if (pairsNeeded <= 2 && singleTiles.length >= pairsNeeded) {
      makeSug(t.qingQiDui, 8, singleTiles.slice(0, pairsNeeded), 65 - pairsNeeded * 15);
    }
  }

  // --- 6番 番种 ---
  
  // 清对（6番）：清一色(4) + 对对胡(2)
  if (isFullFlush && totalTriplets >= 4) {
    makeSug(t.qingDui, 6, [], 95);
  } else if (isFullFlush && totalTriplets >= 2) {
    const pairTiles: Tile[] = [];
    counts.forEach((c, key) => {
      if (c === 2) {
        const { value, suit } = parseKey(key);
        if (suit === maxSuit) {
          pairTiles.push(createTile(suit, value));
        }
      }
    });
    const tripsNeeded = Math.max(0, 4 - totalTriplets);
    makeSug(t.qingDui, 6, pairTiles.slice(0, tripsNeeded), 60);
  }

  // --- 4番 番种 ---
  
  // 将对（4番）：只用2,5,8的对对胡
  if (allJiang && totalTriplets >= 4 && !isFullFlush) {
    makeSug(t.jiangDui, 4, [], 95);
  } else if (allJiang && totalTriplets >= 2 && !isFullFlush) {
    const pairTiles: Tile[] = [];
    counts.forEach((c, key) => {
      if (c === 2) {
        const { value, suit } = parseKey(key);
        if (isJiang(value)) {
          pairTiles.push(createTile(suit, value));
        }
      }
    });
    if (pairTiles.length > 0) {
      const tripsNeeded = Math.max(0, 4 - totalTriplets);
      makeSug(t.jiangDui, 4, pairTiles.slice(0, tripsNeeded), 50);
    }
  }

  // 清一色（4番）- 只有非复合情况时显示
  if (isFullFlush && !allTerminals && !isJinGouDiao && pairs < 7 && totalTriplets < 4) {
    makeSug(t.qingYiSe, 4, [], 90);
  } else if (!isFullFlush) {
    // 清一色潜力分析
    const otherSuitCount = allTiles.length - maxC;
    // 只有当其他花色很少（<=3张）且主花色>=9张时才推荐
    if (otherSuitCount <= 3 && maxC >= 9) {
      // 清一色的"缺少"应该为空，因为不是缺牌，而是需要换掉其他花色
      // 在extraDetails中说明需要换掉的牌
      const otherSuitTiles = allTiles.filter(tile => tile.suit !== maxSuit);
      const suitName = lang === 'zh' 
        ? (maxSuit === Suit.Man ? '万' : maxSuit === Suit.Pin ? '筒' : '条')
        : (maxSuit === Suit.Man ? 'Wan' : maxSuit === Suit.Pin ? 'Pin' : 'Sou');
      const hint = lang === 'zh' 
        ? `做清${suitName}，需换${otherSuitCount}张` 
        : `Go for ${suitName}, need to discard ${otherSuitCount}`;
      const prob = Math.max(20, 90 - otherSuitCount * 20);
      makeSug(t.qingYiSe, 4, [], prob, [hint]);
    }
  }

  // 金钩钓（4番）：4碰/杠 + 单钓
  if (isJinGouDiao && !isFullFlush) {
    makeSug(t.jinGouDiao, 4, [], 95);
  }
  // 金钩钓潜力（只在还不是金钩钓时显示）
  if (pongMelds.length >= 3 && !isFullFlush && !isJinGouDiao) {
    const tripsNeeded = 4 - pongMelds.length;
    const pairTiles: Tile[] = [];
    counts.forEach((c, key) => {
      if (c === 2) {
        const { value, suit } = parseKey(key);
        pairTiles.push(createTile(suit, value));
      }
    });
    if (tripsNeeded <= 1 && pairTiles.length >= tripsNeeded) {
      makeSug(t.jinGouDiao, 4, pairTiles.slice(0, 1), 70);
    }
  }

  // 七对（4番）：7对
  if (melds.length === 0 && !isFullFlush) {
    if (pairs >= 7) {
      const name = roots > 0 ? t.longQiDui : t.qiDui;
      makeSug(name, 4, [], 95);
    } else if (pairs >= 4) {
      const singleTiles: Tile[] = [];
      counts.forEach((c, key) => {
        if (c === 1 || c === 3) {
          const { value, suit } = parseKey(key);
          singleTiles.push(createTile(suit, value));
        }
      });
      const pairsNeeded = 7 - pairs;
      if (singleTiles.length >= pairsNeeded) {
        const prob = pairs >= 6 ? 85 : pairs >= 5 ? 65 : 45;
        const name = roots > 0 ? t.longQiDui : t.qiDui;
        makeSug(name, 4, singleTiles.slice(0, Math.min(pairsNeeded, 3)), prob);
      }
    }
  }

  // 带幺九（4番）：所有面子和将都含幺九
  const allMeldsHaveTerminals = melds.every(m => m.tiles.some(tile => isTerminal(tile.value)));
  let handTerminalGroups = 0;
  // 简化检测：如果所有牌值都是1或9，则满足
  if (allTerminals && !isFullFlush && totalTriplets >= 3) {
    makeSug(t.daiYaoJiu, 4, [], 80);
  }

  // --- 2番 番种 ---
  
  // 门前清（2番）：仅自摸成立，没有吃碰
  // 注：门前清是额外加番，不单独作为主番型推荐
  // 只有在有其他主番型且没有副露时才作为附加说明
  
  // 断幺九（2番）：没有1和9
  let hasTerminal = false;
  counts.forEach((c, key) => {
    const { value } = parseKey(key);
    if (isTerminal(value)) hasTerminal = true;
  });
  if (!hasTerminal && !isFullFlush && allTiles.length >= 10 && !isJinGouDiao) {
    makeSug(t.duanYaoJiu, 2, [], 85);
  }

  // 对对胡（2番）：4刻子 + 1对将
  // 注意：金钩钓是对对胡的升级版，不重复显示
  if (totalTriplets >= 4 && !isFullFlush && !allJiang && !allTerminals && !isJinGouDiao) {
    makeSug(t.duiDuiHu, 2, [], 90);
  } else if (totalTriplets >= 2 && !isFullFlush && pairs >= 3 && !isJinGouDiao) {
    const pairTiles: Tile[] = [];
    counts.forEach((c, key) => {
      if (c === 2) {
        const { value, suit } = parseKey(key);
        pairTiles.push(createTile(suit, value));
      }
    });
    const tripsNeeded = Math.max(0, 4 - totalTriplets);
    if (tripsNeeded <= 2) {
      makeSug(t.duiDuiHu, 2, pairTiles.slice(0, tripsNeeded), 55);
    }
  }

  // --- 1番 番种 ---
  
  // 基本和/平胡（1番）：标准的基础番型
  // 无论其他高番建议如何，基本和始终作为保底选项
  // 注意：金钩钓等高番型不需要显示基本和
  const hasHighFan = suggestions.some(s => s.baseFan >= 4);
  if ((!hasHighFan || suggestions.length === 0) && !isJinGouDiao) {
    // 没有高番建议时，显示基本和
    makeSug(t.pingHu, 1, [], 95);
  }
  
  // 如果已经处于听牌状态（13张牌），基本和应该是首选
  if (allTiles.length === 13 && !isFullFlush && !allTerminals && !allJiang && !isJinGouDiao) {
    // 确保基本和在列表中
    const hasPingHu = suggestions.some(s => s.baseFan === 1);
    if (!hasPingHu) {
      makeSug(t.pingHu, 1, [], 98);
    }
  }
  
  return suggestions.sort((a, b) => b.fan - a.fan);
};

// ========== 四川麻将和牌番型识别 ==========

/**
 * 识别四川麻将已和牌的番型（用于14张牌和牌时）
 * 
 * 成都玩法番种体系:
 * 16番: 清幺九、清金钩钓、清七对
 * 8番: 将对、清对
 * 4番: 清一色、金钩钓、七对、带幺九
 * 2番: 门前清(自摸)、断幺九、对对胡
 * 1番: 基本和
 * 
 * 复合规则：高番包含低番时不重复计算
 */
export const recognizeSichuanPatterns = (
  hand: Tile[], 
  melds: Meld[], 
  voidSuit: Suit | null,
  lang: Language
): { totalFan: number; details: string[] } => {
  const t = TEXT[lang];
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
  const counts = countTiles(allTiles);
  const details: string[] = [];
  let baseFan = 1; // 基础番（基本和）
  
  // ========== 基本统计 ==========
  
  // 统计根（四张相同的牌）
  let roots = 0;
  counts.forEach((val) => { if (val === 4) roots++; });

  // 统计花色
  const suits = new Set(allTiles.filter(tile => tile.suit !== Suit.Zihai).map(tile => tile.suit));
  const isFullFlush = suits.size === 1 && allTiles.length > 0;
  
  // 统计副露
  const pongMelds = melds.filter(m => m.type === 'pong' || m.type === 'gang');
  const isMenQing = melds.length === 0;

  // 统计对子、刻子
  let pairs = 0;
  let triplets = 0;
  let allTerminals = true;  // 是否全是幺九（1和9）
  let allJiang = true;      // 是否全是将牌（2,5,8）
  let hasTerminal = false;  // 是否有幺九牌
  let distinctTileTypes = 0; // 不同牌的种类数
  
  counts.forEach((c, key) => { 
    if (c >= 2) pairs++; 
    if (c >= 3) triplets++;
    if (c >= 1) distinctTileTypes++;
    const { value } = parseKey(key);
    if (!isTerminal(value)) allTerminals = false;
    if (!isJiang(value)) allJiang = false;
    if (isTerminal(value)) hasTerminal = true;
  });

  // 刻子总数
  const totalTriplets = triplets + pongMelds.length;
  
  // 是否七对：没有副露，手牌14张，且正好7种牌每种至少2张
  // 龙七对（含根）时，是6种牌（其中一种4张），也算七对
  const totalHandTiles = allTiles.length;
  const isQiDui = melds.length === 0 && totalHandTiles === 14 && 
    ((distinctTileTypes === 7 && pairs === 7) || // 普通七对
     (distinctTileTypes === 6 && pairs === 6 && roots >= 1) || // 龙七对（6种牌+1根）
     (distinctTileTypes === 5 && pairs === 5 && roots >= 2)); // 双龙七对
  
  // 是否对对胡
  const isDuiDui = totalTriplets >= 4;
  
  // 是否金钩钓（4碰/杠 + 单钓）
  const isJinGouDiao = pongMelds.length === 4 && hand.length === 2;

  // ========== 番型识别（从大到小，高番包含低番） ==========
  // 四川麻将番数相加，参考constants.ts中的SICHUAN_BASE_PATTERNS
  
  // --- 8番 (清一色复合番型) ---
  if (isFullFlush && isJinGouDiao) {
    // 清金钩钓（8番）= 清一色(4) + 金钩钓(4)
    baseFan = 8;
    details.push(`${t.qingJinGou} (8番)`);
  } else if (isFullFlush && isQiDui) {
    // 清七对（8番）= 清一色(4) + 七对(4)
    // 如果有根，则是清龙七对
    baseFan = 8;
    const qiDuiName = roots > 0 ? (t.qingLongQiDui || '清龙七对') : t.qingQiDui;
    details.push(`${qiDuiName} (8番)`);
  }
  // --- 6番 ---
  else if (isFullFlush && isDuiDui) {
    // 清对（6番）= 清一色(4) + 对对胡(2)
    baseFan = 6;
    details.push(`${t.qingDui} (6番)`);
  }
  // --- 4番 ---
  else if (allJiang && isDuiDui) {
    // 将对（4番）= 只用2,5,8的对对胡
    baseFan = 4;
    details.push(`${t.jiangDui} (4番)`);
  } else if (isFullFlush) {
    // 清一色（4番）
    baseFan = 4;
    details.push(`${t.qingYiSe} (4番)`);
  } else if (isJinGouDiao) {
    // 金钩钓（4番）
    baseFan = 4;
    details.push(`${t.jinGouDiao} (4番)`);
  } else if (isQiDui) {
    // 七对（4番）
    baseFan = 4;
    details.push(roots > 0 ? `${t.longQiDui} (4番)` : `${t.qiDui} (4番)`);
  } else if (allTerminals && isDuiDui) {
    // 带幺九（4番）
    baseFan = 4;
    details.push(`${t.daiYaoJiu} (4番)`);
  }
  // --- 2番 ---
  else if (!hasTerminal) {
    // 断幺九（2番）
    baseFan = 2;
    details.push(`${t.duanYaoJiu} (2番)`);
  } else if (isDuiDui) {
    // 对对胡（2番）
    baseFan = 2;
    details.push(`${t.duiDuiHu} (2番)`);
  }
  // --- 1番 ---
  else {
    // 基本和（1番）
    baseFan = 1;
    details.push(`${t.pingHu} (1番)`);
  }
  
  // ========== 计算最终番数（番数相加，倍数是2^番数） ==========
  // 四川麻将：番数 = 基础番 + 根数
  // 倍数 = 2^番数（例：3番 = 2³ = 8倍）
  const totalFan = baseFan + roots;
  
  if (roots > 0) {
    details.push(`${t.root} x${roots} (+${roots}番)`);
  }

  return { totalFan, details };
};
