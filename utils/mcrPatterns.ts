/**
 * 国标麻将番种识别模块
 * - 枚举合法拆分，在同一套拆分内计番，按总番择优（就高）
 * - 计算总番数和不计/另计规则
 * - 未记录的事实（明暗杠、和牌张、圈门风、末张、花牌）一律不推断
 */

import { Tile, Meld, Suit, WinSource, GameMode } from '../types';
import {
  getTileKey,
  MCR_88_FAN, MCR_64_FAN, MCR_48_FAN, MCR_32_FAN, MCR_24_FAN, MCR_16_FAN,
  MCR_12_FAN, MCR_8_FAN, MCR_6_FAN, MCR_4_FAN, MCR_2_FAN, MCR_1_FAN,
  MCRPattern
} from '../constants';
import { countTiles, countsToArray, indexToTile, tileKeyToIndex, tileToIndex } from './tileHelpers';
import {
  checkWinning, classifyKnittedHand, decomposeHand, knittedRemainders,
  HandDecomposition, SetShape,
} from './winningChecker';

// 识别到的番种
export interface RecognizedPattern {
  pattern: MCRPattern;
  count: number;  // 可叠加的番种数量（如箭刻/幺九刻可叠加）
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
  for (const rp of sorted) {
    if (rp.pattern.excludes) {
      for (const excId of rp.pattern.excludes) {
        excludedIds.add(excId);
      }
    }
  }

  // 过滤掉被排除的番种
  const validPatterns = sorted.filter(rp => !excludedIds.has(rp.pattern.id));

  // 被排除的番种只有在「更高番的番种声明其另计」时才加回来（例如清一色另计清龙）；
  // 低番种不能取消高番种的不计规则（例如混一色不能把大三元不计的箭刻加回来）。
  const additionalPatterns: RecognizedPattern[] = [];
  for (const rp of sorted) {
    if (!excludedIds.has(rp.pattern.id)) continue;
    const excluderFan = Math.max(0, ...sorted
      .filter(x => x.pattern.excludes?.includes(rp.pattern.id))
      .map(x => x.pattern.fan));
    const reincluderFan = Math.max(0, ...validPatterns
      .filter(x => x.pattern.includes?.includes(rp.pattern.id))
      .map(x => x.pattern.fan));
    if (reincluderFan > excluderFan) additionalPatterns.push(rp);
  }

  const finalPatterns = [...validPatterns, ...additionalPatterns];

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

// ========== 同一拆分内计番：面子视图 ==========

/** 锁定副露转成的面子；杠的明暗类型未记录，只计入杠数，不判明杠/暗杠/双明杠/双暗杠。 */
interface LockedShape {
  shape: SetShape;
  kong: boolean;
}

/** 一套拆分里的面子视图：indices 为该面子涉及的牌值索引。 */
interface ShapeView {
  kind: 'pong' | 'chow';
  indices: number[];
  concealed: boolean;   // 暗手拆出：刻子记暗刻，顺子无明暗
  kong: boolean;
}

const isHonorIndex = (index: number): boolean => index >= 27;
const isWindIndex = (index: number): boolean => index >= 27 && index <= 30;
const isDragonIndex = (index: number): boolean => index >= 31 && index <= 33;
const isNumberIndex = (index: number): boolean => index >= 0 && index < 27;
const isTerminalOrHonorIndex = (index: number): boolean =>
  index >= 27 || (!isNumberIndex(index) ? false : index % 9 === 0 || index % 9 === 8);
const numberValueOfIndex = (index: number): number => (index % 9) + 1;
const suitOfIndex = (index: number): number => Math.floor(index / 9); // 0-2 万筒条, 3 字牌

const shapeIndices = (shape: SetShape): number[] =>
  shape.kind === 'pong' ? [shape.tile] : [shape.start, shape.start + 1, shape.start + 2];

const pongTileOf = (shape: SetShape): number | null => (shape.kind === 'pong' ? shape.tile : null);

const viewOfShape = (shape: SetShape, concealed: boolean, kong: boolean): ShapeView =>
  ({ kind: shape.kind, indices: shapeIndices(shape), concealed, kong });

/** 把已锁定的副露转成面子（吃=顺子，碰/杠=刻子）。 */
const lockedMeldShapes = (melds: Meld[]): LockedShape[] => melds.map(meld => {
  const lowest = [...meld.tiles].sort((a, b) => a.value - b.value)[0];
  const index = tileToIndex(lowest);
  return {
    shape: meld.type === 'chi' ? { kind: 'chow', start: index } : { kind: 'pong', tile: index },
    kong: meld.type === 'gang',
  };
});

/** 三花色各一副、逐步递增的顺子/刻子是否成立（step=1 三步高/三节高，step=3 花龙）。 */
const hasShiftedTriple = (lookup: (suit: number, offset: number) => boolean, step: number): boolean =>
  [0, 1, 2].some(a => [0, 1, 2].some(b => [0, 1, 2].some(c =>
    new Set([a, b, c]).size === 3 &&
    lookup(a, 0) && lookup(b, step) && lookup(c, step * 2))));

/**
 * 一套合法拆分内的面子相关番种。
 * 明暗杠类型、和牌张、圈门风未记录，因此不判明杠/暗杠/双明杠/双暗杠、门风刻/圈风刻、边张/坎张/单钓将。
 */
const recognizeSetPatterns = (
  decomposition: HandDecomposition,
  locked: LockedShape[],
  melds: Meld[],
  winSource: WinSource,
  allCounts: number[],
): RecognizedPattern[] => {
  const out: RecognizedPattern[] = [];
  const add = (id: string, count = 1) => {
    const pattern = getPatternById(id);
    if (pattern && count > 0) out.push({ pattern, count });
  };

  const views = [
    ...locked.map(item => viewOfShape(item.shape, false, item.kong)),
    ...decomposition.shapes.map(shape => viewOfShape(shape, true, false)),
  ];
  if (views.length !== 4) return out;

  const pongs = views.filter(view => view.kind === 'pong');
  const chows = views.filter(view => view.kind === 'chow');
  const concealedPongs = pongs.filter(view => view.concealed).length;
  const kongCount = views.filter(view => view.kong).length;
  const pair = decomposition.pair;
  const pongIndices = pongs.map(view => view.indices[0]);
  const chowStarts = chows.map(view => view.indices[0]);

  // 平和 / 全带幺 / 全带五
  if (chows.length === 4 && isNumberIndex(pair)) add('pingHu');
  if (views.every(view => view.indices.some(isTerminalOrHonorIndex)) && isTerminalOrHonorIndex(pair)) add('quanDaiYao');
  if (views.every(view => view.indices.every(isNumberIndex) && view.indices.some(index => numberValueOfIndex(index) === 5)) &&
    isNumberIndex(pair) && numberValueOfIndex(pair) === 5) add('quanDaiWu');

  // 碰碰和 / 暗刻族 / 杠数
  if (pongs.length === 4) add('pengPengHu');
  if (concealedPongs >= 4) add('siAnKe');
  else if (concealedPongs >= 3) add('sanAnKe');
  else if (concealedPongs >= 2) add('shuangAnKe');
  if (kongCount >= 4) add('siGang');
  else if (kongCount === 3) add('sanGang');

  // 幺九刻 / 箭刻族 / 风刻族
  const yaoJiuPongs = pongIndices.filter(isTerminalOrHonorIndex).length;
  if (yaoJiuPongs > 0) add('yaoJiuKe', yaoJiuPongs);

  const dragonPongs = pongIndices.filter(isDragonIndex).length;
  if (dragonPongs >= 3) add('daSanYuan');
  else if (dragonPongs === 2 && isDragonIndex(pair)) add('xiaoSanYuan');
  else if (dragonPongs === 2) add('shuangJianKe');
  if (dragonPongs > 0) add('jianKe', dragonPongs);

  const windPongs = pongIndices.filter(isWindIndex).length;
  if (windPongs >= 4) add('daSiXi');
  else if (windPongs === 3 && isWindIndex(pair)) add('xiaoSiXi');
  else if (windPongs === 3) add('sanFengKe');

  // 同刻：三同刻已含双同刻，故双同刻只计恰好两花色
  const suitsByValue = new Map<number, Set<number>>();
  pongIndices.filter(isNumberIndex).forEach(index => {
    const value = numberValueOfIndex(index);
    const suits = suitsByValue.get(value) ?? new Set<number>();
    suits.add(suitOfIndex(index));
    suitsByValue.set(value, suits);
  });
  let shuangTongKe = 0;
  let sanTongKe = 0;
  suitsByValue.forEach(suits => {
    if (suits.size === 2) shuangTongKe += 1;
    if (suits.size >= 3) sanTongKe += 1;
  });
  if (shuangTongKe > 0) add('shuangTongKe', shuangTongKe);
  if (sanTongKe > 0) add('sanTongKe', sanTongKe);

  // 顺子族
  const chowKey = (suit: number, offset: number) => `${suit}-${offset}`;
  const chowsByKey = new Map<string, number>();
  const offsetsBySuit = new Map<number, Set<number>>();
  const suitsByOffset = new Map<number, Set<number>>();
  chowStarts.forEach(start => {
    const suit = suitOfIndex(start);
    const offset = start % 9;
    chowsByKey.set(chowKey(suit, offset), (chowsByKey.get(chowKey(suit, offset)) ?? 0) + 1);
    const offsets = offsetsBySuit.get(suit) ?? new Set<number>();
    offsets.add(offset);
    offsetsBySuit.set(suit, offsets);
    const suits = suitsByOffset.get(offset) ?? new Set<number>();
    suits.add(suit);
    suitsByOffset.set(offset, suits);
  });
  const hasChow = (suit: number, offset: number) => chowsByKey.has(chowKey(suit, offset));

  let yiBanGao = 0;
  chowsByKey.forEach(count => { yiBanGao += (count * (count - 1)) / 2; });
  if (yiBanGao > 0) add('yiBanGao', yiBanGao);

  let xiXiangFeng = 0;
  suitsByOffset.forEach(suits => { xiXiangFeng += (suits.size * (suits.size - 1)) / 2; });
  if (xiXiangFeng > 0) add('xiXiangFeng', xiXiangFeng);

  let lianLiu = 0;
  let laoShaoFu = 0;
  offsetsBySuit.forEach(offsets => {
    // 连六：同花色两副连续顺子（123456 / 234567 / 345678 / 456789 都算）
    for (let start = 0; start <= 3; start++) {
      if (offsets.has(start) && offsets.has(start + 3)) lianLiu += 1;
    }
    if (offsets.has(0) && offsets.has(6)) laoShaoFu += 1;
  });
  if (lianLiu > 0) add('lianLiu', lianLiu);
  if (laoShaoFu > 0) add('laoShaoFu', laoShaoFu);

  // 清龙 / 花龙
  if ([0, 1, 2].some(suit => [0, 3, 6].every(offset => hasChow(suit, offset)))) add('qingLong');
  if (hasShiftedTriple((suit, offset) => hasChow(suit, offset), 3)) add('huaLong');

  // 三色三同顺 / 一色三同顺 / 一色四同顺
  let sanSeSanTongShun = 0;
  suitsByOffset.forEach(suits => { if (suits.size >= 3) sanSeSanTongShun += 1; });
  if (sanSeSanTongShun > 0) add('sanSeSanTongShun', sanSeSanTongShun);

  let yiSeSiTongShun = 0;
  let yiSeSanTongShun = 0;
  chowsByKey.forEach(count => {
    if (count >= 4) yiSeSiTongShun += 1;
    else if (count === 3) yiSeSanTongShun += 1;
  });
  if (yiSeSiTongShun > 0) add('yiSeSiTongShun', yiSeSiTongShun);
  else if (yiSeSanTongShun > 0) add('yiSeSanTongShun', yiSeSanTongShun);

  // 一色三/四步高（依次递增 1 或 2）/ 三色三步高
  let yiSeSiBuGao = 0;
  let yiSeSanBuGao = 0;
  offsetsBySuit.forEach(offsets => {
    for (const step of [1, 2]) {
      for (let start = 0; start + 3 * step <= 8; start++) {
        if ([0, 1, 2, 3].every(k => offsets.has(start + k * step))) yiSeSiBuGao += 1;
        else if ([0, 1, 2].every(k => offsets.has(start + k * step))) yiSeSanBuGao += 1;
      }
    }
  });
  if (yiSeSiBuGao > 0) add('yiSeSiBuGao', yiSeSiBuGao);
  else if (yiSeSanBuGao > 0) add('yiSeSanBuGao', yiSeSanBuGao);
  if (hasShiftedTriple((suit, offset) => hasChow(suit, offset), 1)) add('sanSeSanBuGao');

  // 节高：一色三/四节高、三色三节高
  const pongOffsetsBySuit = new Map<number, Set<number>>();
  pongIndices.filter(isNumberIndex).forEach(index => {
    const suit = suitOfIndex(index);
    const offsets = pongOffsetsBySuit.get(suit) ?? new Set<number>();
    offsets.add(index % 9);
    pongOffsetsBySuit.set(suit, offsets);
  });
  let yiSeSiJieGao = 0;
  let yiSeSanJieGao = 0;
  pongOffsetsBySuit.forEach(offsets => {
    for (let start = 0; start <= 5; start++) {
      if ([0, 1, 2, 3].every(k => offsets.has(start + k))) yiSeSiJieGao += 1;
      else if ([0, 1, 2].every(k => offsets.has(start + k))) yiSeSanJieGao += 1;
    }
  });
  if (yiSeSiJieGao > 0) add('yiSeSiJieGao', yiSeSiJieGao);
  else if (yiSeSanJieGao > 0) add('yiSeSanJieGao', yiSeSanJieGao);
  if (hasShiftedTriple((suit, offset) => pongOffsetsBySuit.get(suit)?.has(offset) ?? false, 1)) add('sanSeSanJieGao');

  // 一色双龙会（同花色 123×2 + 789×2 + 5 作将）/ 三色双龙会
  const doubleDragon = [0, 1, 2].some(suit =>
    (chowsByKey.get(chowKey(suit, 0)) ?? 0) >= 2 && (chowsByKey.get(chowKey(suit, 6)) ?? 0) >= 2 &&
    isNumberIndex(pair) && suitOfIndex(pair) === suit && numberValueOfIndex(pair) === 5);
  if (doubleDragon) add('yiSeShuangLongHui');
  const terminalChowSuits = [0, 1, 2].filter(suit => hasChow(suit, 0) && hasChow(suit, 6));
  if (terminalChowSuits.length >= 2 && isNumberIndex(pair) && numberValueOfIndex(pair) === 5 &&
    !terminalChowSuits.includes(suitOfIndex(pair))) add('sanSeShuangLongHui');

  // 四归一：4 张同牌分布在两副以上面子；杠的 4 张属于杠本身，不计
  const kongTiles = new Set<number>();
  locked.forEach(item => {
    if (!item.kong) return;
    const tile = pongTileOf(item.shape);
    if (tile !== null) kongTiles.add(tile);
  });
  const setsPerTile = new Map<number, number>();
  views.forEach(view => new Set(view.indices).forEach(index =>
    setsPerTile.set(index, (setsPerTile.get(index) ?? 0) + 1)));
  let siGuiYi = 0;
  for (let index = 0; index < 34; index++) {
    if (allCounts[index] !== 4 || kongTiles.has(index)) continue;
    if ((setsPerTile.get(index) ?? 0) >= 2) siGuiYi += 1;
  }
  if (siGuiYi > 0) add('siGuiYi', siGuiYi);

  // 全求人：4 副全为吃/碰（含杠时无法确认明暗）+ 和别家打出的牌
  if (melds.length === 4 && melds.every(meld => meld.type !== 'gang') && winSource === 'claim') add('quanQiuRen');

  // 两副顺子组成的小番必须遵守套算一次；三副顺子的高番成立时，
  // 第四副最多再贡献一个小番，不能将所有两两关系直接相加。
  const lowChowIds = ['yiBanGao', 'xiXiangFeng', 'lianLiu', 'laoShaoFu'];
  const fourChowIds = ['yiSeSiTongShun', 'yiSeSiBuGao', 'yiSeShuangLongHui', 'sanSeShuangLongHui'];
  const threeChowIds = ['qingLong', 'huaLong', 'sanSeSanTongShun', 'yiSeSanTongShun', 'yiSeSanBuGao', 'sanSeSanBuGao'];
  const scored = calculateTotalFan(out).validPatterns;
  let allowance = scored.some(r => fourChowIds.includes(r.pattern.id)) ? 0
    : scored.some(r => threeChowIds.includes(r.pattern.id)) ? 1 : Math.max(0, chows.length - 1);
  for (const id of lowChowIds) {
    const hit = out.find(r => r.pattern.id === id);
    if (!hit || !scored.includes(hit)) continue;
    hit.count = Math.min(hit.count, allowance);
    allowance -= hit.count;
  }

  return out.filter(r => r.count > 0);
};

// ========== 与拆分无关的番种 ==========

/** 只由牌面（花色/点数）决定的番种，与拆分无关。 */
const recognizeTilePatterns = (
  allTiles: Tile[],
  counts: Map<string, number>,
): RecognizedPattern[] => {
  const out: RecognizedPattern[] = [];
  const add = (id: string) => {
    const pattern = getPatternById(id);
    if (pattern) out.push({ pattern, count: 1 });
  };
  const suits = new Set(allTiles.filter(t => t.suit !== Suit.Zihai).map(t => t.suit));
  const hasMan = allTiles.some(t => t.suit === Suit.Man);
  const hasPin = allTiles.some(t => t.suit === Suit.Pin);
  const hasSou = allTiles.some(t => t.suit === Suit.Sou);
  const hasWinds = allTiles.some(isWind);
  const hasDragons = allTiles.some(isDragon);
  const countArray = countsToArray(counts);

  if (allTiles.length > 0 && allTiles.every(isGreen)) add('lvYiSe');
  if (allTiles.length > 0 && allTiles.every(isHonors)) add('ziYiSe');
  if (allTiles.length > 0 && allTiles.every(t => !isHonors(t) && (t.value === 1 || t.value === 9))) add('qingYaoJiu');
  if (allTiles.length > 0 && allTiles.every(isTerminalOrHonor)) add('hunYaoJiu');

  // 十三幺：13 种幺九字牌各一张，另有一张重复
  const yaoJiuTypes = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  if (allTiles.length === 14 && yaoJiuTypes.every(index => countArray[index] >= 1)) add('shiSanYao');

  if (suits.size === 1 && !allTiles.some(isHonors)) add('qingYiSe');
  if (suits.size === 1 && allTiles.some(isHonors)) add('hunYiSe');
  if (hasMan && hasPin && hasSou && hasWinds && hasDragons) add('wuMenQi');
  if (allTiles.length > 0 && allTiles.every(isSimple)) add('duanYao');
  if (allTiles.length > 0 && !allTiles.some(isHonors)) add('wuZi');
  if (suits.size === 2) add('queYiMen');

  if (allTiles.length > 0 && allTiles.every(t => !isHonors(t) && t.value >= 7)) add('quanDa');
  if (allTiles.length > 0 && allTiles.every(t => !isHonors(t) && t.value >= 4 && t.value <= 6)) add('quanZhong');
  if (allTiles.length > 0 && allTiles.every(t => !isHonors(t) && t.value <= 3)) add('quanXiao');
  if (allTiles.length > 0 && allTiles.every(t => !isHonors(t) && [2, 4, 6, 8].includes(t.value))) add('quanShuangKe');
  if (allTiles.length > 0 && allTiles.every(t => !isHonors(t) && t.value >= 6)) add('daYuWu');
  if (allTiles.length > 0 && allTiles.every(t => !isHonors(t) && t.value <= 4)) add('xiaoYuWu');
  if (allTiles.length > 0 && allTiles.every(isReversible)) add('tuiBuDao');

  return out;
};

/** 和牌来源已记录时才成立的番种：不求人 / 门前清 / 自摸。 */
const sourcePatterns = (
  recognized: RecognizedPattern[],
  melds: Meld[],
  winSource: WinSource,
): RecognizedPattern[] => {
  const out: RecognizedPattern[] = [];
  const add = (id: string) => {
    const pattern = getPatternById(id);
    if (pattern) out.push({ pattern, count: 1 });
  };
  // 不计不求人的特殊型（七星不靠/全不靠/七对/九莲宝灯）不得加入，否则会连带排除自摸
  const excludesFullyConcealed = recognized.some(r => r.pattern.excludes?.includes('buQiuRen'));
  if (melds.length === 0 && winSource === 'selfDraw' && !excludesFullyConcealed) add('buQiuRen');
  if (melds.length === 0 && winSource === 'claim') add('menQianQing');
  if (winSource === 'selfDraw') add('ziMo');
  return out;
};

/** 与面子拆分互斥的特殊结构：七对 / 连七对。 */
const EXCLUSIVE_STRUCTURE_IDS = new Set(['qiDui', 'lianQiDui']);

/** 特殊结构番种：七对、连七对、七星不靠、全不靠、组合龙。 */
const recognizeStructurePatterns = (
  allTiles: Tile[],
  melds: Meld[],
  counts: Map<string, number>,
  concealedCounts: number[],
): RecognizedPattern[] => {
  const out: RecognizedPattern[] = [];
  const add = (id: string) => {
    const pattern = getPatternById(id);
    if (pattern) out.push({ pattern, count: 1 });
  };
  const countArray = countsToArray(counts);

  // 七对：暗手 14 张全为对子；四张同牌记两对
  const pairUnits = [...counts.values()].reduce((sum, count) => sum + Math.floor(count / 2), 0);
  const allEven = [...counts.values()].every(count => count % 2 === 0);
  if (melds.length === 0 && allTiles.length === 14 && pairUnits === 7 && allEven) {
    add('qiDui');
    const hogs = countArray.filter(count => count === 4).length;
    if (hogs > 0) {
      const pattern = getPatternById('siGuiYi');
      if (pattern) out.push({ pattern, count: hogs });
    }
    // 连七对：同一花色 7 个连续对子
    const sameSuit = new Set(allTiles.map(t => t.suit)).size === 1 && !allTiles.some(isHonors);
    if (sameSuit) {
      const occupied = countArray.map((count, index) => (count > 0 ? index : -1)).filter(index => index >= 0).sort((a, b) => a - b);
      if (occupied.length === 7 && occupied[6] - occupied[0] === 6) add('lianQiDui');
    }
  }

  // 九莲宝灯须核对和牌前的13张为1112345678999；当前未记录和牌张，
  // 无法从最终14张倒推这个事实，因此暂不确认88番，仍按普通拆分计番。

  // 七星不靠 / 全不靠
  const knitted = melds.length === 0 ? classifyKnittedHand(countArray) : 'none';
  if (knitted === 'sevenStars') add('qiXingBuKao');
  else if (knitted === 'lesser') add('quanBuKao');

  // 组合龙：147/258/369 三组龙齐全，且整手牌为合法和牌结构
  if (knittedRemainders(concealedCounts).length > 0 && checkWinning(concealedCounts, melds.length, GameMode.MCR)) {
    add('zuHeLong');
  }
  return out;
};

/**
 * 识别手牌中的番种：枚举合法拆分 → 同一拆分内计番 → 总番择优（就高）。
 * @param winSource 已记录的和牌来源；'unknown' 时不识别不求人、门前清、自摸。
 */
export const recognizeMCRPatterns = (
  hand: Tile[], melds: Meld[], winSource: WinSource = 'unknown',
): RecognizedPattern[] => {
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
  const counts = countTiles(allTiles);
  const allCounts = countsToArray(counts);
  const tilePatterns = recognizeTilePatterns(allTiles, counts);
  const concealedCounts = countsToArray(countTiles(hand));
  const structures = recognizeStructurePatterns(allTiles, melds, counts, concealedCounts);
  const exclusive = structures.filter(r => EXCLUSIVE_STRUCTURE_IDS.has(r.pattern.id));
  const shared = structures.filter(r => !EXCLUSIVE_STRUCTURE_IDS.has(r.pattern.id) && r.pattern.id !== 'siGuiYi');

  const locked = lockedMeldShapes(melds);
  const decompositions = melds.length <= 4 ? decomposeHand(concealedCounts, 4 - melds.length) : [];
  const candidates: RecognizedPattern[][] = decompositions.map(decomposition => [
    ...tilePatterns,
    ...shared,
    ...recognizeSetPatterns(decomposition, locked, melds, winSource, allCounts),
  ]);
  exclusive.forEach(structure => candidates.push([
    ...tilePatterns, ...shared, structure,
    ...(structure.pattern.id === 'qiDui' ? structures.filter(r => r.pattern.id === 'siGuiYi') : []),
  ]));
  if (candidates.length === 0) return [...tilePatterns, ...structures, ...sourcePatterns([...tilePatterns, ...structures], melds, winSource)];

  let best = candidates[0];
  let bestFan = -1;
  for (const candidate of candidates) {
    const fan = calculateTotalFan(candidate).totalFan;
    if (fan > bestFan) {
      bestFan = fan;
      best = candidate;
    }
  }
  return [...best, ...sourcePatterns(best, melds, winSource)];
};

/**
 * 计算MCR附加番（基于已识别的番种）
 * @param allTiles 所有牌（手牌+副露）
 * @param melds 副露
 * @param excludePatternIds 需要排除的番种ID列表（避免主番种在详情中重复出现）
 */
export const calculateMCRExtras = (
  allTiles: Tile[],
  melds: Meld[],
  excludePatternIds: string[] = []
): { score: number; details: string[] } => {
  // 从全部牌里扣掉副露张数，得到暗手；不能用手牌直接截断前 14 张
  const remaining = new Map(countTiles(allTiles));
  melds.forEach(meld => meld.tiles.forEach(tile => {
    const key = getTileKey(tile.suit, tile.value);
    remaining.set(key, (remaining.get(key) ?? 0) - 1);
  }));
  const concealed: Tile[] = [];
  remaining.forEach((count, key) => {
    const index = tileKeyToIndex(key);
    if (index < 0) return;
    for (let i = 0; i < count; i++) concealed.push(indexToTile(index));
  });

  const recognized = recognizeMCRPatterns(concealed, melds);
  const filtered = recognized.filter(r => !excludePatternIds.includes(r.pattern.id));
  const { totalFan, details } = calculateTotalFan(filtered);

  return { score: totalFan, details };
};
