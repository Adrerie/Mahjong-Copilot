
import { GameMode, GameState, Suit, Tile, AnalysisResult, FanSuggestion, Language, Meld } from '../types';
import { 
  createTile, getTileKey, TEXT,
  MCR_88_FAN, MCR_64_FAN, MCR_48_FAN, MCR_32_FAN, MCR_24_FAN, MCR_16_FAN,
  MCR_12_FAN, MCR_8_FAN, MCR_6_FAN, MCR_4_FAN, MCR_2_FAN, MCR_1_FAN,
  MCRPattern, MCR_RULES
} from '../constants';

// --- Helper Functions ---

const sortTiles = (tiles: Tile[]): Tile[] => {
  const suitOrder = { [Suit.Man]: 1, [Suit.Pin]: 2, [Suit.Sou]: 3, [Suit.Zihai]: 4 };
  return [...tiles].sort((a, b) => {
    if (a.suit !== b.suit) return suitOrder[a.suit] - suitOrder[b.suit];
    return a.value - b.value;
  });
};

const countTiles = (tiles: Tile[]): Map<string, number> => {
  const counts = new Map<string, number>();
  tiles.forEach(t => {
    const key = getTileKey(t.suit, t.value);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
};

const getSuitCount = (tiles: Tile[], suit: Suit) => tiles.filter(t => t.suit === suit).length;

const getUniqueTiles = (tiles: Tile[]) => {
    const seen = new Set<string>();
    const unique: Tile[] = [];
    tiles.forEach(t => {
        const k = getTileKey(t.suit, t.value);
        if(!seen.has(k)) { seen.add(k); unique.push(t); }
    });
    return unique;
};

// Check if we have specific tile or meld containing it
const hasTileOrSeq = (hand: Tile[], melds: Meld[], suit: Suit, val: number): boolean => {
    // Check hand
    if (hand.some(t => t.suit === suit && t.value === val)) return true;
    // Check melds
    for (const m of melds) {
        if (m.type === 'chi') {
            const min = Math.min(...m.tiles.map(t => t.value));
            if (m.tiles[0].suit === suit && val >= min && val <= min + 2) return true;
        }
        if (m.type === 'pong' || m.type === 'gang') {
            if (m.tiles[0].suit === suit && m.tiles[0].value === val) return true;
        }
    }
    return false;
};

// Simplified sequence checker: returns cost to make a sequence
const costToMakeSeq = (hand: Tile[], melds: Meld[], suit: Suit, startVal: number): number => {
    // 1. Check existing Melds (Chi)
    const existingMeld = melds.find(m => m.type === 'chi' && m.tiles[0].suit === suit && Math.min(...m.tiles.map(t=>t.value)) === startVal);
    if (existingMeld) return 0;

    // 2. Check Hand
    // We need startVal, startVal+1, startVal+2
    let missing = 3;
    const v1 = hand.some(t => t.suit === suit && t.value === startVal);
    const v2 = hand.some(t => t.suit === suit && t.value === startVal + 1);
    const v3 = hand.some(t => t.suit === suit && t.value === startVal + 2);
    
    if (v1) missing--;
    if (v2) missing--;
    if (v3) missing--;
    
    return missing;
};

// Helper to get missing tiles for a sequence
const getMissingForSeq = (hand: Tile[], suit: Suit, startVal: number): Tile[] => {
    const needed = [startVal, startVal+1, startVal+2];
    const missing: Tile[] = [];
    needed.forEach(v => {
        if (!hand.some(t => t.suit === suit && t.value === v)) {
            // Check if we already added this value to missing (to avoid duplicates in naive check)
             if(!missing.some(m => m.suit === suit && m.value === v)) {
                 missing.push(createTile(suit, v));
             }
        }
    });
    // This simple check might duplicate if we need 2 of same, but for sequence we usually need distinct
    // Refinement: Remove found tiles from a temp array to handle duplicates correctly if hand has pairs?
    // For suggestions, simplified unique missing is usually okay.
    return missing;
};


// --- SICHUAN LOGIC ENGINE ---
// (Kept largely the same, just ensuring interface matches)

const analyzeSichuan = (hand: Tile[], melds: Meld[], voidSuit: Suit | null, lang: Language): FanSuggestion[] => {
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


// --- MCR LOGIC ENGINE REFACTOR ---

// ============================================================
// 国标麻将番种识别与总番计算
// 核心原则：
// 1. 8番起和 - 总番必须 >= 8
// 2. 可叠加计分 - 除excludes外的番种都可以叠加
// 3. 不重复计分 - 高番型的excludes中的低番型不再计算
// ============================================================

// 已识别的番种结果
interface RecognizedPattern {
  pattern: MCRPattern;
  count: number; // 数量（如多个箭刻）
}

// 计算总番（应用不重复计分原则）
const calculateTotalFan = (patterns: RecognizedPattern[]): { totalFan: number; validPatterns: RecognizedPattern[]; details: string[] } => {
  // 按番数从高到低排序
  const sorted = [...patterns].sort((a, b) => b.pattern.fan - a.pattern.fan);
  
  // 收集所有被排除的番种ID
  const excludedIds = new Set<string>();
  sorted.forEach(p => {
    p.pattern.excludes.forEach(ex => excludedIds.add(ex));
  });
  
  // 过滤出有效番种（未被排除的）
  const validPatterns: RecognizedPattern[] = [];
  let totalFan = 0;
  const details: string[] = [];
  
  sorted.forEach(p => {
    if (!excludedIds.has(p.pattern.id)) {
      validPatterns.push(p);
      const fanValue = p.pattern.fan * p.count;
      totalFan += fanValue;
      
      if (p.count > 1) {
        details.push(`${p.pattern.nameZh} x${p.count} (${p.pattern.fan}×${p.count}=${fanValue})`);
      } else {
        details.push(`${p.pattern.nameZh} (${p.pattern.fan})`);
      }
    }
  });
  
  return { totalFan, validPatterns, details };
};

// 获取所有番种的查找表
const getAllPatterns = (): MCRPattern[] => [
  ...MCR_88_FAN, ...MCR_64_FAN, ...MCR_48_FAN, ...MCR_32_FAN,
  ...MCR_24_FAN, ...MCR_16_FAN, ...MCR_12_FAN, ...MCR_8_FAN,
  ...MCR_6_FAN, ...MCR_4_FAN, ...MCR_2_FAN, ...MCR_1_FAN,
];

const getPatternById = (id: string): MCRPattern | undefined => {
  return getAllPatterns().find(p => p.id === id);
};

// 辅助判断函数
const isHonors = (tile: Tile) => tile.suit === Suit.Zihai;
const isTerminal = (tile: Tile) => tile.value === 1 || tile.value === 9;
const isTerminalOrHonor = (tile: Tile) => isHonors(tile) || isTerminal(tile);
const isSimple = (tile: Tile) => !isHonors(tile) && !isTerminal(tile);
const isDragon = (tile: Tile) => tile.suit === Suit.Zihai && tile.value >= 5; // 白发中: 5,6,7
const isWind = (tile: Tile) => tile.suit === Suit.Zihai && tile.value <= 4; // 东南西北: 1,2,3,4
const isGreen = (tile: Tile) => {
  // 绿一色：23468条 + 发财
  if (tile.suit === Suit.Sou && [2, 3, 4, 6, 8].includes(tile.value)) return true;
  if (tile.suit === Suit.Zihai && tile.value === 6) return true; // 发
  return false;
};
const isReversible = (tile: Tile) => {
  // 推不倒：1234589筒、245689条、白板
  if (tile.suit === Suit.Pin && [1, 2, 3, 4, 5, 8, 9].includes(tile.value)) return true;
  if (tile.suit === Suit.Sou && [2, 4, 5, 6, 8, 9].includes(tile.value)) return true;
  if (tile.suit === Suit.Zihai && tile.value === 5) return true; // 白
  return false;
};

// 识别手牌中的番种
const recognizeMCRPatterns = (hand: Tile[], melds: Meld[]): RecognizedPattern[] => {
  const recognized: RecognizedPattern[] = [];
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
  const counts = countTiles(allTiles);
  
  // 统计花色
  const suits = new Set(allTiles.filter(t => t.suit !== Suit.Zihai).map(t => t.suit));
  const hasMan = allTiles.some(t => t.suit === Suit.Man);
  const hasPin = allTiles.some(t => t.suit === Suit.Pin);
  const hasSou = allTiles.some(t => t.suit === Suit.Sou);
  const hasWinds = allTiles.some(t => isWind(t));
  const hasDragons = allTiles.some(t => isDragon(t));
  
  // 统计刻子/杠数量
  const pongMelds = melds.filter(m => m.type === 'pong' || m.type === 'gang');
  const chiMelds = melds.filter(m => m.type === 'chi');
  const gangMelds = melds.filter(m => m.type === 'gang');
  
  // 统计暗刻（手牌中3张以上相同的）
  let anKeCount = 0;
  counts.forEach((count) => {
    if (count >= 3) anKeCount++;
  });
  
  // 统计对子
  let pairCount = 0;
  counts.forEach((count) => {
    if (count >= 2) pairCount++;
  });
  
  // 统计四归一
  let siGuiYiCount = 0;
  counts.forEach((count) => {
    if (count === 4) siGuiYiCount++;
  });
  
  // ===== 88番 =====
  
  // 绿一色
  if (allTiles.every(isGreen)) {
    const p = getPatternById('lvYiSe');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // 十三幺 - 特殊判断（需要全部幺九字牌）
  const yaoJiuTypes = ['1m', '9m', '1p', '9p', '1s', '9s', '1z', '2z', '3z', '4z', '5z', '6z', '7z'];
  const hasAllYaoJiu = yaoJiuTypes.every(key => {
    const suit = key[1] as 'm' | 'p' | 's' | 'z';
    const val = parseInt(key[0]);
    const suitEnum = suit === 'm' ? Suit.Man : suit === 'p' ? Suit.Pin : suit === 's' ? Suit.Sou : Suit.Zihai;
    return allTiles.some(t => t.suit === suitEnum && t.value === val);
  });
  if (hasAllYaoJiu && allTiles.length === 14) {
    const p = getPatternById('shiSanYao');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // 四杠
  if (gangMelds.length === 4) {
    const p = getPatternById('siGang');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // ===== 64番 =====
  
  // 字一色
  if (allTiles.every(isHonors)) {
    const p = getPatternById('ziYiSe');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // 四暗刻
  if (anKeCount >= 4 && melds.every(m => m.type !== 'pong')) {
    const p = getPatternById('siAnKe');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // ===== 32番 =====
  
  // 三杠
  if (gangMelds.length === 3) {
    const p = getPatternById('sanGang');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // 混幺九
  if (allTiles.every(isTerminalOrHonor)) {
    const p = getPatternById('hunYaoJiu');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // ===== 24番 =====
  
  // 七对
  if (pairCount >= 7 && melds.length === 0) {
    const p = getPatternById('qiDui');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // 清一色
  if (suits.size === 1 && !allTiles.some(isHonors)) {
    const p = getPatternById('qingYiSe');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // 全大 (789)
  if (allTiles.every(t => !isHonors(t) && t.value >= 7)) {
    const p = getPatternById('quanDa');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // 全中 (456)
  if (allTiles.every(t => !isHonors(t) && t.value >= 4 && t.value <= 6)) {
    const p = getPatternById('quanZhong');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // 全小 (123)
  if (allTiles.every(t => !isHonors(t) && t.value <= 3)) {
    const p = getPatternById('quanXiao');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // 全双刻 (2468)
  if (allTiles.every(t => !isHonors(t) && [2, 4, 6, 8].includes(t.value))) {
    const p = getPatternById('quanShuangKe');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // ===== 16番 =====
  
  // 三暗刻
  if (anKeCount >= 3) {
    const p = getPatternById('sanAnKe');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // ===== 12番 =====
  
  // 大于五 (6789)
  if (allTiles.every(t => !isHonors(t) && t.value >= 6)) {
    const p = getPatternById('daYuWu');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // 小于五 (1234)
  if (allTiles.every(t => !isHonors(t) && t.value <= 4)) {
    const p = getPatternById('xiaoYuWu');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // 三风刻
  const windPongs = pongMelds.filter(m => isWind(m.tiles[0])).length;
  const handWindTriples = allTiles.filter(t => isWind(t)).length;
  if (windPongs >= 3 || (windPongs >= 2 && handWindTriples >= 3)) {
    const p = getPatternById('sanFengKe');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // ===== 8番 =====
  
  // 推不倒
  if (allTiles.every(isReversible)) {
    const p = getPatternById('tuiBuDao');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // ===== 6番 =====
  
  // 碰碰和
  const totalPongs = pongMelds.length + anKeCount;
  if (totalPongs >= 4) {
    const p = getPatternById('pengPengHu');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // 混一色
  if (suits.size === 1 && allTiles.some(isHonors)) {
    const p = getPatternById('hunYiSe');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // 五门齐
  if (hasMan && hasPin && hasSou && hasWinds && hasDragons) {
    const p = getPatternById('wuMenQi');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // 双暗杠
  const anGangCount = gangMelds.filter(m => {
    // 假设暗杠在melds中标记（简化判断）
    return true; // 实际应检查是否为暗杠
  }).length;
  if (anGangCount >= 2) {
    const p = getPatternById('shuangAnGang');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // 双箭刻
  const dragonPongs = pongMelds.filter(m => isDragon(m.tiles[0])).length;
  if (dragonPongs >= 2) {
    const p = getPatternById('shuangJianKe');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // ===== 4番 =====
  
  // 全带幺
  // 每组都带幺九或字牌（简化检测）
  const hasTerminalInEachGroup = melds.every(m => m.tiles.some(isTerminalOrHonor));
  if (hasTerminalInEachGroup && allTiles.some(isTerminalOrHonor)) {
    const p = getPatternById('quanDaiYao');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // 不求人（门前清自摸）
  if (melds.length === 0) {
    const p = getPatternById('buQiuRen');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // 双明杠
  const mingGangCount = gangMelds.length; // 简化，实际应区分明暗
  if (mingGangCount >= 2) {
    const p = getPatternById('shuangMingGang');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // ===== 2番 =====
  
  // 箭刻（可叠加）
  const dragonPongCount = pongMelds.filter(m => isDragon(m.tiles[0])).length;
  if (dragonPongCount >= 1) {
    const p = getPatternById('jianKe');
    if (p) recognized.push({ pattern: p, count: dragonPongCount });
  }
  
  // 门前清
  if (melds.length === 0) {
    const p = getPatternById('menQianQing');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // 平和（4顺子+序数将）
  if (chiMelds.length >= 4 || (chiMelds.length >= 3 && melds.length === chiMelds.length)) {
    const p = getPatternById('pingHu');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // 四归一
  if (siGuiYiCount >= 1) {
    const p = getPatternById('siGuiYi');
    if (p) recognized.push({ pattern: p, count: siGuiYiCount });
  }
  
  // 双暗刻
  if (anKeCount >= 2) {
    const p = getPatternById('shuangAnKe');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // 断幺
  if (allTiles.every(isSimple)) {
    const p = getPatternById('duanYao');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // ===== 1番 =====
  
  // 幺九刻
  const yaoJiuKe = pongMelds.filter(m => isTerminalOrHonor(m.tiles[0])).length;
  if (yaoJiuKe >= 1) {
    const p = getPatternById('yaoJiuKe');
    if (p) recognized.push({ pattern: p, count: yaoJiuKe });
  }
  
  // 明杠
  if (gangMelds.length >= 1) {
    const p = getPatternById('mingGang');
    if (p) recognized.push({ pattern: p, count: gangMelds.length });
  }
  
  // 缺一门
  if (suits.size === 2) {
    const p = getPatternById('queYiMen');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // 无字
  if (!allTiles.some(isHonors)) {
    const p = getPatternById('wuZi');
    if (p) recognized.push({ pattern: p, count: 1 });
  }
  
  // 自摸（需要额外参数判断，这里暂不加）
  
  return recognized;
};

// 计算MCR附加番（基于已识别的番种）
const calculateMCRExtras = (allTiles: Tile[], melds: Meld[], mainSuit: Suit | null, t: any): { score: number, details: string[] } => {
    const recognized = recognizeMCRPatterns(allTiles.slice(0, Math.min(14, allTiles.length)) as Tile[], melds);
    const { totalFan, details } = calculateTotalFan(recognized);
    
    return { score: totalFan, details };
};

const analyzeMCR = (hand: Tile[], melds: Meld[], lang: Language): FanSuggestion[] => {
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
            ]; // This is rough, logic above 'cost' is better for count
            
            // Calculate extras
            const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, null, t);
            
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
    // There are 6 permutations of suits.
    const perms = [
        [Suit.Man, Suit.Pin, Suit.Sou],
        [Suit.Man, Suit.Sou, Suit.Pin],
        [Suit.Pin, Suit.Man, Suit.Sou],
        [Suit.Pin, Suit.Sou, Suit.Man],
        [Suit.Sou, Suit.Man, Suit.Pin],
        [Suit.Sou, Suit.Pin, Suit.Man],
    ];
    
    for (let i = 1; i <= 5; i++) { // 123, 234, 345 -> max start is 5 (567, 678, 789) is invalid? No, 789 is last.
        // If i=7, n=7, n+1=8, n+2=9. 9,10,11 invalid. Max i depends on structure.
        // Seq 1: i..i+2. Seq 2: i+1..i+3. Seq 3: i+2..i+4. Max i+4 <= 9 => i <= 5.
        
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
                const { score: exScore, details: exDetails } = calculateMCRExtras(allTiles, melds, null, t);
                
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
    // 注意：五门齐是附加番，必须在有效和牌型基础上
    // 需要检查：1) 五门都有 2) 手牌接近有效和牌型
    const hasManMCR = getSuitCount(allTiles, Suit.Man) > 0;
    const hasPinMCR = getSuitCount(allTiles, Suit.Pin) > 0;
    const hasSouMCR = getSuitCount(allTiles, Suit.Sou) > 0;
    const hasWindMCR = allTiles.some(x => x.suit === Suit.Zihai && x.value <= 4);
    const hasDragonMCR = allTiles.some(x => x.suit === Suit.Zihai && x.value >= 5);
    
    let gates = 0;
    if(hasManMCR) gates++; if(hasPinMCR) gates++; if(hasSouMCR) gates++; if(hasWindMCR) gates++; if(hasDragonMCR) gates++;
    
    // 计算基本和牌型的向听数（简化估算）
    // 标准和牌：4面子(顺子/刻子) + 1将(对子)
    // 向听数 = 需要的面子数 - 已有的面子数
    const existingMelds = melds.length; // 已有的副露面子
    const handTileCount = hand.length;
    
    // 估算手牌中的面子和搭子
    let estimatedMelds = existingMelds;
    let estimatedPairs = 0;
    const handCounts = countTiles(hand);
    handCounts.forEach((c) => {
        if (c >= 3) estimatedMelds++; // 刻子
        if (c >= 2) estimatedPairs++; // 对子
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
    
    // 向听数估算：需要4面子，已有estimatedMelds个
    const shantenEstimate = Math.max(0, 4 - Math.min(4, estimatedMelds));
    
    // 只有当五门齐且向听数 <= 2 时才建议
    if (gates === 5 && shantenEstimate <= 2) {
         const { score: exScore, details: exDetails } = calculateMCRExtras(allTiles, melds, null, t);
         suggestions.push({
            name: t.fiveGates,
            baseFan: 6,
            fan: 6 + exScore,
            probability: Math.max(20, 70 - shantenEstimate * 20),
            missingTiles: [], // 五门已齐，无缺少
            patternDetails: [`${t.fiveGates} (6)`, `向听${shantenEstimate}`, ...exDetails]
         });
    } else if (gates === 4 && shantenEstimate <= 1) {
        // 差一门，且接近听牌
        const missing: Tile[] = [];
        if(!hasManMCR) missing.push(createTile(Suit.Man, 5)); // 建议中张
        if(!hasPinMCR) missing.push(createTile(Suit.Pin, 5));
        if(!hasSouMCR) missing.push(createTile(Suit.Sou, 5));
        if(!hasWindMCR) missing.push(createTile(Suit.Zihai, 1)); // 东风
        if(!hasDragonMCR) missing.push(createTile(Suit.Zihai, 5)); // 白板
        
        const { score: exScore, details: exDetails } = calculateMCRExtras(allTiles, melds, null, t);
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
    // Check Man, Pin, Sou
    [Suit.Man, Suit.Pin, Suit.Sou].forEach(s => {
        // Need 123, 456, 789
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
                 fan: 16, // usually conflicts with other small things or overrides them
                 probability: 80 - total * 10,
                 missingTiles: missing.slice(0, 4),
                 patternDetails: [`${t.pureStraight} (16)`]
             });
        }
    });

    // 5. Full Flush (清一色 24番) / Half Flush (混一色 6番)
    // 分析清一色/混一色潜力
    let maxSuitMCR = Suit.Man;
    let maxSuitCountMCR = 0;
    [Suit.Man, Suit.Pin, Suit.Sou].forEach(s => {
        const c = getSuitCount(allTiles, s);
        if (c > maxSuitCountMCR) { maxSuitCountMCR = c; maxSuitMCR = s; }
    });
    
    const honorCount = allTiles.filter(t => t.suit === Suit.Zihai).length;
    const otherSuitCountMCR = allTiles.length - maxSuitCountMCR - honorCount;
    
    // 清一色：只有一种花色，无字牌
    if (maxSuitCountMCR >= 8 && otherSuitCountMCR <= 4 && honorCount <= 2) {
        const otherTiles = allTiles.filter(t => t.suit !== maxSuitMCR).slice(0, 4);
        const missingQYS = otherTiles.map(t => createTile(t.suit, t.value));
        const probQYS = Math.min(85, maxSuitCountMCR * 6);
        
        suggestions.push({
            name: t.fullFlush,
            baseFan: 24,
            fan: 24,
            probability: probQYS,
            missingTiles: missingQYS,
            patternDetails: [`${t.fullFlush} (24)`, `主花色${maxSuitCountMCR}张，需换${otherSuitCountMCR + honorCount}张`]
        });
    }
    
    // 混一色：一种花色+字牌
    if (maxSuitCountMCR >= 7 && honorCount >= 1 && otherSuitCountMCR <= 4) {
        const otherSuitTilesMCR = allTiles.filter(t => t.suit !== maxSuitMCR && t.suit !== Suit.Zihai).slice(0, 4);
        const missingHYS = otherSuitTilesMCR.map(t => createTile(t.suit, t.value));
        const probHYS = Math.min(80, (maxSuitCountMCR + honorCount) * 5);
        
        const { score: exScoreHYS, details: exDetailsHYS } = calculateMCRExtras(allTiles, melds, null, t);
        suggestions.push({
            name: t.mixedOneSuit,
            baseFan: 6,
            fan: 6 + exScoreHYS,
            probability: probHYS,
            missingTiles: missingHYS,
            patternDetails: [`${t.mixedOneSuit} (6)`, ...exDetailsHYS]
        });
    }
    
    // 6. Seven Pairs (七对) - 24 Fan
    // 需要7个对子，计算当前对子数和缺少的牌
    let pairs = 0;
    const singleTiles: Tile[] = []; // 单张牌（可以凑对的候选）
    counts.forEach((c, key) => { 
        if (c >= 2) pairs++;
        if (c === 1) {
            // 解析 key 获取 suit 和 value
            const value = parseInt(key[0]);
            const suitChar = key.slice(1);
            const suit = suitChar === 'm' ? Suit.Man : suitChar === 'p' ? Suit.Pin : suitChar === 's' ? Suit.Sou : Suit.Zihai;
            singleTiles.push(createTile(suit, value));
        }
    });
    
    // 七对需要7对，当前有pairs对，还需要 (7 - pairs) 对
    // 每个单张变成对子需要再来1张相同的牌
    const pairsNeeded = 7 - pairs;
    const tilesNeededForQiDui = pairsNeeded; // 需要摸到的牌数
    
    // 如果对子数 >= 3 且单张数足够，就有七对的可能
    if (pairs >= 3 && melds.length === 0 && singleTiles.length >= pairsNeeded) {
        // 缺少的牌 = 前 pairsNeeded 个单张（需要再来一张凑对）
        const missingForQiDui = singleTiles.slice(0, Math.min(pairsNeeded, 4));
        
        // 概率计算：基于对子数和需要摸到的牌数
        // 每张单张还有3张在牌池(假设)，概率随需要的牌数递减
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
    
    // 7. All Pungs (碰碰和) - 6 Fan
    // 需要4个刻子+1对将
    let trips = 0;
    const pongMeldsCount = melds.filter(m => m.type === 'pong' || m.type === 'gang').length;
    counts.forEach(c => { if(c >= 3) trips++; });
    
    const totalTrips = trips + pongMeldsCount;
    
    // 找出可以凑刻子的对子
    const pairTilesForPeng: Tile[] = [];
    counts.forEach((c, key) => {
        if (c === 2) {
            const value = parseInt(key[0]);
            const suitChar = key.slice(1);
            const suit = suitChar === 'm' ? Suit.Man : suitChar === 'p' ? Suit.Pin : suitChar === 's' ? Suit.Sou : Suit.Zihai;
            pairTilesForPeng.push(createTile(suit, value));
        }
    });
    
    // 如果刻子数 >= 2 或者对子数 >= 4，就有碰碰和的可能
    if (totalTrips >= 2 || pairTilesForPeng.length >= 4) {
        const tripsNeededForPeng = Math.max(0, 4 - totalTrips);
        const missingForPeng = pairTilesForPeng.slice(0, Math.min(tripsNeededForPeng, 4));
        
        const baseProbPeng = totalTrips >= 3 ? 80 : totalTrips >= 2 ? 55 : 35;
        const { score: exScorePeng, details: exDetailsPeng } = calculateMCRExtras(allTiles, melds, null, t);
        
        suggestions.push({
            name: t.allPungs,
            baseFan: 6,
            fan: 6 + exScorePeng,
            probability: baseProbPeng,
            missingTiles: missingForPeng,
            patternDetails: [`${t.allPungs} (6)`, `已有${totalTrips}刻，缺${tripsNeededForPeng}张`, ...exDetailsPeng]
        });
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
            if (b.fan !== a.fan) return b.fan - a.fan; // 先按番数
            return b.probability - a.probability; // 再按概率
        });
};

// --- MAIN EXPORT ---

export const analyzeGame = (state: GameState, lang: Language = 'en'): AnalysisResult => {
  const { hand, melds, discards, wallCount, mode, voidSuit } = state;
  const warnings: string[] = [];
  const t = TEXT[lang];
  
  // Best Discard Logic
  let bestDiscard: { tile: Tile, reason: string } | undefined;
  if (hand.length > 0) {
      if (mode === GameMode.Sichuan && voidSuit) {
          const voidTile = hand.find(t => t.suit === voidSuit);
          if (voidTile) bestDiscard = { tile: voidTile, reason: t.huaZhu };
      }
      if (!bestDiscard) {
        const counts = countTiles(hand);
        const isolated = hand.find(tile => {
            const k = getTileKey(tile.suit, tile.value);
            return counts.get(k) === 1 && 
                   !hand.some(o => o.suit === tile.suit && Math.abs(o.value - tile.value) <= 1);
        });
        if (isolated) bestDiscard = { tile: isolated, reason: t.discardHint };
        else bestDiscard = { tile: hand[0], reason: t.discardHint };
      }
  }

  // Suggestions
  let suggestions: FanSuggestion[] = [];
  if (mode === GameMode.Sichuan) {
      suggestions = analyzeSichuan(hand, melds, voidSuit, lang);
  } else {
      suggestions = analyzeMCR(hand, melds, lang);
  }

  // Mock Waiting Tiles
  const isReady = suggestions.length > 0 && suggestions[0].missingTiles.length <= 1;
  const waitingTiles = [];
  if (suggestions.length > 0 && suggestions[0].missingTiles.length > 0) {
      // Pick top missing tiles
       suggestions[0].missingTiles.slice(0, 3).forEach(mt => {
           waitingTiles.push({
              tile: mt,
              remaining: Math.floor(Math.random() * 4),
              probability: 'N/A'
           });
       });
  }

  return {
    isReady,
    shanten: isReady ? 0 : 1, // Mock
    waitingTiles,
    bestDiscard,
    suggestions,
    scoreEstimate: suggestions.length > 0 ? suggestions[0].fan : 0,
    warnings,
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

export { sortTiles, countTiles, recognizeMCRPatterns, calculateTotalFan };
