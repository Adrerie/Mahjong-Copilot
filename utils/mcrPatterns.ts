/**
 * 国标麻将番种识别模块
 * - 识别已成牌型中的番种
 * - 计算总番数和不计/另计规则
 */

import { Tile, Meld, Suit } from '../types';
import { 
  createTile, getTileKey,
  MCR_88_FAN, MCR_64_FAN, MCR_48_FAN, MCR_32_FAN, MCR_24_FAN, MCR_16_FAN,
  MCR_12_FAN, MCR_8_FAN, MCR_6_FAN, MCR_4_FAN, MCR_2_FAN, MCR_1_FAN,
  MCRPattern
} from '../constants';
import { countTiles } from './tileHelpers';

// 识别到的番种
export interface RecognizedPattern {
  pattern: MCRPattern;
  count: number;  // 可叠加的番种数量（如箭刻可叠加）
}

// 获取所有番种
export const getAllPatterns = (): MCRPattern[] => [
  ...MCR_88_FAN, ...MCR_64_FAN, ...MCR_48_FAN, ...MCR_32_FAN, 
  ...MCR_24_FAN, ...MCR_16_FAN, ...MCR_12_FAN, ...MCR_8_FAN,
  ...MCR_6_FAN, ...MCR_4_FAN, ...MCR_2_FAN, ...MCR_1_FAN
];

// 根据ID获取番种
export const getPatternById = (id: string): MCRPattern | undefined => {
  return getAllPatterns().find(p => p.id === id);
};

// ========== 牌型判断辅助函数 ==========

const isHonors = (t: Tile): boolean => t.suit === Suit.Zihai;
const isTerminal = (t: Tile): boolean => t.suit !== Suit.Zihai && (t.value === 1 || t.value === 9);
const isTerminalOrHonor = (t: Tile): boolean => isTerminal(t) || isHonors(t);
const isSimple = (t: Tile): boolean => t.suit !== Suit.Zihai && t.value >= 2 && t.value <= 8;
const isDragon = (t: Tile): boolean => t.suit === Suit.Zihai && t.value >= 5;
const isWind = (t: Tile): boolean => t.suit === Suit.Zihai && t.value <= 4;

// 绿一色的牌: 23468条 + 发
const isGreen = (t: Tile): boolean => {
  if (t.suit === Suit.Sou && [2, 3, 4, 6, 8].includes(t.value)) return true;
  if (t.suit === Suit.Zihai && t.value === 6) return true; // 发
  return false;
};

// 推不倒的牌: 1234589筒, 245689条, 白板
const isReversible = (t: Tile): boolean => {
  if (t.suit === Suit.Pin && [1, 2, 3, 4, 5, 8, 9].includes(t.value)) return true;
  if (t.suit === Suit.Sou && [2, 4, 5, 6, 8, 9].includes(t.value)) return true;
  if (t.suit === Suit.Zihai && t.value === 5) return true; // 白
  return false;
};

/**
 * 计算总番数（应用不计/另计规则）
 */
export const calculateTotalFan = (patterns: RecognizedPattern[]): { 
  totalFan: number; 
  validPatterns: RecognizedPattern[];
  details: string[];
} => {
  // 按番数从高到低排序
  const sorted = [...patterns].sort((a, b) => b.pattern.fan - a.pattern.fan);
  
  // 收集所有需要排除的番种ID
  const excludedIds = new Set<string>();
  
  // 高番种的"不计"规则排除低番种
  for (const rp of sorted) {
    if (rp.pattern.excludes) {
      for (const excId of rp.pattern.excludes) {
        excludedIds.add(excId);
      }
    }
  }
  
  // 过滤掉被排除的番种
  const validPatterns = sorted.filter(rp => !excludedIds.has(rp.pattern.id));
  
  // 收集所有"另计"的番种（即使被excludes排除也要加回来）
  const includesIds = new Set<string>();
  for (const rp of validPatterns) {
    if (rp.pattern.includes) {
      for (const incId of rp.pattern.includes) {
        includesIds.add(incId);
      }
    }
  }
  
  // 检查被排除但需要另计的番种
  const additionalPatterns: RecognizedPattern[] = [];
  for (const rp of sorted) {
    if (excludedIds.has(rp.pattern.id) && includesIds.has(rp.pattern.id)) {
      // 这个番种被排除，但有高番种声明它为"另计"，需要加回来
      additionalPatterns.push(rp);
    }
  }
  
  // 合并有效番种
  const finalPatterns = [...validPatterns, ...additionalPatterns];
  
  // 计算总番数
  let totalFan = 0;
  const details: string[] = [];
  
  for (const rp of finalPatterns) {
    const fan = rp.pattern.fan * rp.count;
    totalFan += fan;
    if (rp.count > 1) {
      details.push(`${rp.pattern.nameZh} x${rp.count} (${fan}番)`);
    } else {
      details.push(`${rp.pattern.nameZh} (${fan}番)`);
    }
  }
  
  return { totalFan, validPatterns: finalPatterns, details };
};

/**
 * 识别手牌中的番种
 */
export const recognizeMCRPatterns = (hand: Tile[], melds: Meld[]): RecognizedPattern[] => {
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

/**
 * 计算MCR附加番（基于已识别的番种）
 * @param allTiles 所有牌（手牌+副露）
 * @param melds 副露
 * @param mainSuit 主花色（可选）
 * @param t 翻译文本对象
 * @param excludePatternIds 需要排除的番种ID列表（避免主番种在详情中重复出现）
 */
export const calculateMCRExtras = (
  allTiles: Tile[], 
  melds: Meld[], 
  mainSuit: Suit | null, 
  t: any, 
  excludePatternIds: string[] = []
): { score: number; details: string[] } => {
  const recognized = recognizeMCRPatterns(
    allTiles.slice(0, Math.min(14, allTiles.length)) as Tile[], 
    melds
  );
  
  // 过滤掉需要排除的番种
  const filtered = recognized.filter(r => !excludePatternIds.includes(r.pattern.id));
  const { totalFan, details } = calculateTotalFan(filtered);
  
  return { score: totalFan, details };
};
