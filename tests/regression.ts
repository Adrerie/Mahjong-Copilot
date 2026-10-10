/**
 * 算法回归基线（P0）
 *
 * 分两组：
 * 1. `test(...)` —— 必须成立的守卫。失败即代表已修问题回退，`npm test` 退出码非 0。
 * 2. `defect(...)` —— 已确认错误的行为快照。断言「当前实际输出」，使缺陷可复现、可在修复时立刻暴露；
 *    记录规则预期与当前实际的差异，并标注归属批次（P2 川麻 / P3 国标 / P3 建议层）。
 *    这些条目在对应批次修复后必然失败，属于预期现象：修好后把断言改成正确值并删除对应说明。
 *
 * 每个牌例标注玩法、定缺、副露、和牌来源与规则口径。规则口径来源：
 * - `1111223344m5566p` 记 7 对：四张同牌按两对计（国标七对定义）。
 * - 国标 8 番起和：结构成牌与合法起和必须分开表达。
 * - 川麻口径见 constants.ts 顶部注释与 docs/RESTRUCTURE_PLAN_2026-10-10.md 第 4 节；项目尚未确定统一川渝规则，
 *   因此川麻相关条目只记录当前实现的输出，不作为结算依据。
 */
import assert from 'node:assert/strict';
import { GameMode, GameState, Meld, Suit, Tile } from '../types';
import { createTile } from '../constants';
import {
  analyzeGame,
  analyzeMCR,
  calculateMCRTotalFan,
  calculateQiDuiShanten,
  calculateShanten,
  calculateTotalFan,
  calculateWaitingTiles,
  checkWinning,
  countTiles,
  countsToArray,
  recognizeMCRPatterns,
} from '../utils/mahjongLogic';
import { validateGameState } from '../utils/inputValidation';

// ---------- 构造辅助 ----------

const tiles = (digits: string, suit: Suit): Tile[] => [...digits].map(v => createTile(suit, Number(v)));
const pong = (value: number, suit: Suit = Suit.Pin): Meld =>
  ({ id: `pong-${value}${suit}`, type: 'pong', tiles: tiles(`${value}${value}${value}`, suit) });
const gang = (value: number, suit: Suit = Suit.Pin): Meld =>
  ({ id: `gang-${value}${suit}`, type: 'gang', tiles: tiles(`${value}${value}${value}${value}`, suit) });
const chi = (digits: string, suit: Suit): Meld =>
  ({ id: `chi-${digits}${suit}`, type: 'chi', tiles: tiles(digits, suit) });
const state = (hand: Tile[], melds: Meld[] = [], extra: Partial<GameState> = {}): GameState =>
  ({ mode: GameMode.MCR, hand, melds, discards: [], wallCount: 50, voidSuit: null, ...extra });
const sichuan = (hand: Tile[], voidSuit: Suit | null, melds: Meld[] = [], extra: Partial<GameState> = {}): GameState =>
  ({ mode: GameMode.Sichuan, hand, melds, discards: [], wallCount: 50, voidSuit, ...extra });

const codes = (list: Tile[]): string[] => list.map(t => `${t.value}${t.suit}`);
const effectiveTiles = (hand: Tile[], melds: Meld[]): number => hand.length + melds.length * 3;
/** 番种 id -> 叠加次数，按 id 排序，便于稳定比较。 */
const patternCounts = (hand: Tile[], melds: Meld[] = []): Record<string, number> => {
  const counts = new Map<string, number>();
  for (const r of recognizeMCRPatterns(hand, melds)) {
    counts.set(r.pattern.id, (counts.get(r.pattern.id) ?? 0) + r.count);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
};
const mcrFan = (hand: Tile[], melds: Meld[] = []): number =>
  calculateTotalFan(recognizeMCRPatterns(hand, melds)).totalFan;

// ---------- 运行器 ----------

let passed = 0;
let defects = 0;
const test = (name: string, run: () => void) => { run(); passed++; console.log(`PASS ${name}`); };
const defect = (
  id: string,
  owner: string,
  name: string,
  expected: string,
  observed: unknown,
  compute: () => unknown,
) => {
  const actual = compute();
  defects++;
  console.log(`DEFECT ${id} [${owner}] ${name}`);
  console.log(`  规则预期: ${expected}`);
  console.log(`  当前实际: ${JSON.stringify(actual)}`);
  assert.deepEqual(actual, observed,
    `${id} 的当前行为已变化：若为有意修复，请把断言改成正确值并更新 docs/RESTRUCTURE_PLAN_2026-10-10.md。`);
};

// ============================================================
// 一、已修问题守卫（A01–A08、S02）：不得回退
// ============================================================

test('standard single wait is zero shanten', () => {
  const hand = [...tiles('123456789', Suit.Man), ...tiles('1235', Suit.Pin)];
  assert.equal(calculateShanten(hand, []), 0);
  assert.deepEqual(calculateWaitingTiles(hand, []).map(t => `${t.value}${t.suit}`), ['5p']);
});
test('four pairs and five singles is two shanten for seven pairs', () => {
  assert.equal(calculateQiDuiShanten(countsToArray(countTiles([...tiles('11223344', Suit.Man), ...tiles('12345', Suit.Pin)]))), 2);
});
test('extra concealed tile cannot produce a winning result', () => {
  const result = analyzeGame(state([...tiles('1234568', Suit.Man), ...tiles('77', Suit.Pin)], [pong(1), pong(9)]), 'zh');
  assert.equal(result.isWinning, false);
  assert.equal(result.suggestions.length, 0);
  assert.ok(result.warnings.length);
});
test('wait cannot require a fifth copy in melds', () => {
  assert.equal(calculateWaitingTiles(tiles('5', Suit.Pin), [pong(1), pong(2), pong(3), pong(5)]).length, 0);
});
test('seven concealed tiles with two melds can be ready', () => {
  const result = analyzeGame(state([...tiles('123456', Suit.Man), ...tiles('7', Suit.Pin)], [pong(1), pong(9)]), 'zh');
  assert.equal(result.isReady, true);
  assert.ok(result.waitingTiles.some(w => w.tile.value === 7 && w.tile.suit === Suit.Pin));
});
test('eight concealed tiles with two melds can receive a discard suggestion', () => {
  const result = analyzeGame(state([...tiles('1234568', Suit.Man), ...tiles('7', Suit.Pin)], [pong(1), pong(9)]), 'zh');
  assert.equal(result.isWinning, false);
  assert.ok(result.bestDiscard);
});
test('five copies and malformed melds are rejected', () => {
  assert.ok(validateGameState(state(tiles('11111', Suit.Man)), 'zh', false).length);
  assert.ok(validateGameState(state([], [{ id: 'bad', type: 'chi', tiles: tiles('124', Suit.Man) }]), 'zh', false).length);
});
test('empty and one-tile MCR API inputs cannot claim eight-fan eligibility', () => {
  for (const hand of [[], tiles('2', Suit.Sou)]) {
    const result = calculateMCRTotalFan(hand, []);
    assert.equal(result.totalFan, 0);
    assert.equal(result.isValid, false);
  }
});
test('Sichuan void suit prevents winning even for a complete shape', () => {
  const result = analyzeGame({ ...state(tiles('33344466699977', Suit.Sou)), mode: GameMode.Sichuan, voidSuit: Suit.Sou }, 'zh');
  assert.equal(result.isWinning, false);
  assert.ok(result.warnings.some(w => w.includes('定缺')));
});
test('Sichuan waits do not include honors or void suit', () => {
  const waits = calculateWaitingTiles([...tiles('123456789', Suit.Man), ...tiles('1235', Suit.Pin)], [], GameMode.Sichuan, Suit.Sou);
  assert.deepEqual(waits.map(t => `${t.value}${t.suit}`), ['5p']);
});

// ============================================================
// 二、高风险边界守卫（P0 计划第 2.4 节）
// ============================================================

test('a kong counts as three effective tiles but keeps four physical copies', () => {
  const five = gang(5);
  // 10 暗手 + 1 杠（3 等效）= 13；11 暗手 + 1 杠 = 14：均合法
  assert.deepEqual(validateGameState(state([...tiles('123456789', Suit.Man), createTile(Suit.Sou, 1)], [five]), 'zh'), []);
  assert.deepEqual(validateGameState(state([...tiles('123456789', Suit.Man), ...tiles('12', Suit.Sou)], [five]), 'zh'), []);
  assert.equal(effectiveTiles([...tiles('123456789', Suit.Man), ...tiles('12', Suit.Sou)], [five]), 14);
  // 12 暗手 + 1 杠 = 15 等效：拒绝
  const fifteen = state([...tiles('123456789', Suit.Man), ...tiles('123', Suit.Sou)], [five]);
  assert.ok(validateGameState(fifteen, 'zh').some(e => e.includes('等效牌数')));
  // 杠已占用四张实体牌，暗手不得再出现同一张
  const fifthCopy = state([...tiles('12345678', Suit.Man), ...tiles('12', Suit.Sou), createTile(Suit.Pin, 5)], [five]);
  assert.ok(validateGameState(fifthCopy, 'zh').some(e => e.includes('每种牌最多4张')));
});

test('melds are rejected tile by tile, including chows that reach beyond their run', () => {
  const illegal: Meld[] = [
    chi('124', Suit.Man),                                                   // 中间断档
    { id: 'span-suit', type: 'chi', tiles: [...tiles('89', Suit.Man), createTile(Suit.Pin, 1)] },
    chi('123', Suit.Zihai),                                                 // 字牌不能吃
    { id: 'mixed-pong', type: 'pong', tiles: [...tiles('55', Suit.Man), createTile(Suit.Pin, 5)] },
    { id: 'short-gang', type: 'gang', tiles: tiles('555', Suit.Pin) },       // 杠必须四张
    { id: 'long-chi', type: 'chi', tiles: tiles('1234', Suit.Man) },
  ];
  for (const meld of illegal) {
    const errors = validateGameState(state([], [meld]), 'zh');
    assert.ok(errors.some(e => e.includes('副露')), `meld ${meld.id} should be rejected`);
  }
  const fiveMelds = [pong(1), pong(2), pong(3), pong(4), pong(5)];
  assert.ok(validateGameState(state(tiles('12', Suit.Man), fiveMelds), 'zh').some(e => e.includes('最多4副面子')));
});

test('tile values outside the deck are rejected before analysis', () => {
  assert.ok(validateGameState(state([{ id: 'bad-honor', suit: Suit.Zihai, value: 8 }]), 'zh').length);
  assert.ok(validateGameState(state([{ id: 'bad-zero', suit: Suit.Man, value: 0 }]), 'zh').length);
  assert.ok(validateGameState(state([{ id: 'bad-ten', suit: Suit.Pin, value: 10 }]), 'zh').length);
});

test('discards stay known: a wait whose last copies are all visible is a dead wait', () => {
  // 123456789m + 555p + 1p（13 等效张）；唯一的 1p 待牌已被牌河占满
  const hand = [...tiles('123456789', Suit.Man), ...tiles('555', Suit.Pin), createTile(Suit.Pin, 1)];
  const position = state(hand, [], { discards: tiles('111', Suit.Pin) });
  assert.deepEqual(validateGameState(position, 'zh'), []);
  const result = analyzeGame(position, 'zh');
  assert.equal(result.isWinning, false);
  assert.deepEqual(result.waitingTiles.map(w => `${w.tile.value}${w.tile.suit}:${w.remaining}`), ['1p:0']);
  assert.ok(result.warnings.some(w => w.includes('死叫')));
});

test('Sichuan cannot win while the void suit or a third suit remains', () => {
  const threeSuits = analyzeGame(
    sichuan([...tiles('112233', Suit.Man), ...tiles('445566', Suit.Pin), ...tiles('78', Suit.Sou)], Suit.Sou), 'zh');
  assert.equal(threeSuits.isWinning, false);
  assert.ok(threeSuits.warnings.some(w => w.includes('定缺')));
  const noVoidChosen = analyzeGame(sichuan(tiles('33344466699977', Suit.Sou), null), 'zh');
  assert.equal(noVoidChosen.isWinning, false);
  assert.ok(noVoidChosen.warnings.some(w => w.includes('定缺')));
});

test('structural completeness and eight-fan eligibility stay separate', () => {
  // 234m345m567p456s55m：结构成牌，但只有 不求人4 + 断幺2 = 6 番（断幺不计无字），不足 8 番
  const hand = [...tiles('234', Suit.Man), ...tiles('345', Suit.Man), ...tiles('567', Suit.Pin), ...tiles('456', Suit.Sou), ...tiles('55', Suit.Man)];
  assert.deepEqual(validateGameState(state(hand), 'zh'), []);
  assert.equal(checkWinning(countsToArray(countTiles(hand)), 0), true);
  const api = calculateMCRTotalFan(hand, []);
  assert.equal(api.totalFan, 6);
  assert.equal(api.isValid, false);
  const result = analyzeGame(state(hand), 'zh');
  assert.equal(result.isWinning, true);
  assert.equal(result.isReady, false);
});

test('an invalid or incomplete position returns warnings instead of a verdict', () => {
  const empty = analyzeGame(state([]), 'zh');
  assert.equal(empty.isWinning, false);
  assert.equal(empty.isReady, false);
  assert.equal(empty.shanten, 8);
  assert.equal(empty.suggestions.length, 0);
  assert.ok(empty.warnings.length > 0);
  const fifteen = analyzeGame(state([...tiles('123456789', Suit.Man), ...tiles('123456', Suit.Sou)]), 'zh');
  assert.equal(fifteen.isWinning, false);
  assert.equal(fifteen.waitingTiles.length, 0);
});

// ============================================================
// 三、已确认缺陷（行为快照）
// ============================================================

defect('A04', 'P3a', '全不靠 / 七星不靠 / 组合龙 不是 checkWinning 认可的和牌结构',
  '147m258p3s1234567z 是七星不靠（24番），应被结构判定认作和牌',
  { sevenHonorsKnitted: false, lesserKnitted: false, knittedStraight: false },
  () => ({
    sevenHonorsKnitted: checkWinning(countsToArray(countTiles([
      ...tiles('147', Suit.Man), ...tiles('258', Suit.Pin), createTile(Suit.Sou, 3), ...tiles('1234567', Suit.Zihai)])), 0),
    lesserKnitted: checkWinning(countsToArray(countTiles([
      ...tiles('147', Suit.Man), ...tiles('258', Suit.Pin), ...tiles('369', Suit.Sou), ...tiles('12345', Suit.Zihai)])), 0),
    knittedStraight: checkWinning(countsToArray(countTiles([
      ...tiles('147', Suit.Man), ...tiles('258', Suit.Pin), ...tiles('369', Suit.Sou), ...tiles('111', Suit.Man), ...tiles('22', Suit.Pin)])), 0),
  }));

defect('M01', 'P3c', '大三元未识别，用三暗刻等低番凑出 30 番',
  '555666777z + 12355m 应有大三元 88番',
  { totalFan: 30, hasDaSanYuan: false, patterns: ['buQiuRen', 'hunYiSe', 'quanDaiYao', 'sanAnKe'] },
  () => {
    const hand = [...tiles('555666777', Suit.Zihai), ...tiles('12355', Suit.Man)];
    const api = calculateMCRTotalFan(hand, []);
    return { totalFan: api.totalFan, hasDaSanYuan: api.patterns.some(p => p.id === 'daSanYuan'), patterns: api.patterns.map(p => p.id).sort() };
  });

defect('M01+M05', 'P3b', '清龙未识别；同一手牌又错误加上全带幺',
  '123456789m + 12355p 应有清龙 16番；456m 与 123p 不含幺九，全带幺不应成立',
  { totalFan: 10, hasQingLong: false, hasQuanDaiYao: true },
  () => {
    const hand = [...tiles('123456789', Suit.Man), ...tiles('12355', Suit.Pin)];
    const api = calculateMCRTotalFan(hand, []);
    return { totalFan: api.totalFan, hasQingLong: api.patterns.some(p => p.id === 'qingLong'), hasQuanDaiYao: api.patterns.some(p => p.id === 'quanDaiYao') };
  });

defect('M02', 'P3b', '明碰被当成暗刻，进而误判双暗刻与碰碰和',
  '碰 111p、999p 加暗手 123456m + 77p 只有两副顺子，不应是碰碰和，明碰也不能算暗刻',
  { pengPengHu: 1, shuangAnKe: 1, yaoJiuKe: 2 },
  () => {
    const hand = [...tiles('123456', Suit.Man), ...tiles('77', Suit.Pin)];
    const counts = patternCounts(hand, [pong(1), pong(9)]);
    return { pengPengHu: counts.pengPengHu ?? 0, shuangAnKe: counts.shuangAnKe ?? 0, yaoJiuKe: counts.yaoJiuKe ?? 0 };
  });

defect('M03', 'P3b', '同一副杠同时算双暗杠、双明杠、明杠与四归一',
  '杠的明暗未知时不得自动推断；杠的四张属于杠本身，也不是四归一',
  { totalFan: 26, patterns: { mingGang: 2, pengPengHu: 1, shuangAnGang: 1, shuangAnKe: 1, shuangMingGang: 1, siGuiYi: 2, wuZi: 1, yaoJiuKe: 1 } },
  () => {
    const hand = [...tiles('123456', Suit.Man), ...tiles('55', Suit.Sou)];
    const melds = [gang(1), gang(2)];
    return { totalFan: mcrFan(hand, melds), patterns: patternCounts(hand, melds) };
  });

defect('M03', 'P3a', 'Meld 没有明杠/暗杠/补杠属性，明暗杠上下文无法表达',
  'P3a 需要补充杠的种类上下文，当前类型只有 id/type/tiles',
  ['id', 'tiles', 'type'],
  () => Object.keys(gang(1)).sort());

defect('M06', 'P3b', '四张相同牌按一对计，1111223344m5566p 的七对漏识别',
  '四张同牌应记两对，1111223344m5566p 是七对 24番',
  { winning: true, totalFan: 12, isValid: true, hasQiDui: false },
  () => {
    const hand = [...tiles('1111223344', Suit.Man), ...tiles('5566', Suit.Pin)];
    const api = calculateMCRTotalFan(hand, []);
    return { winning: checkWinning(countsToArray(countTiles(hand)), 0), totalFan: api.totalFan, isValid: api.isValid, hasQiDui: api.patterns.some(p => p.id === 'qiDui') };
  });

defect('M01+A10', 'P3c', '合法 8 番牌型因三色三同顺未识别，被 isValid 判为不足 8 番（假阴性）',
  '234m234p234s + 567m + 55s 有三色三同顺 8番，加不求人 4番，应满足 8 番起和',
  { totalFan: 6, isValid: false, hasSanSeSanTongShun: false },
  () => {
    const hand = [...tiles('234', Suit.Man), ...tiles('234', Suit.Pin), ...tiles('234', Suit.Sou), ...tiles('567', Suit.Man), ...tiles('55', Suit.Sou)];
    const api = calculateMCRTotalFan(hand, []);
    return { totalFan: api.totalFan, isValid: api.isValid, hasSanSeSanTongShun: api.patterns.some(p => p.id === 'sanSeSanTongShun') };
  });

defect('M05+A10', 'P3b', '全带幺在没有副露时恒真，把不足 8 番的牌型误判为可起和（假阳性）',
  '123m234p345s678s + 99s 只有不求人4 + 无字1（连六未识别），全带幺不应成立',
  { totalFan: 9, isValid: true, hasQuanDaiYao: true },
  () => {
    const hand = [...tiles('123', Suit.Man), ...tiles('234', Suit.Pin), ...tiles('345', Suit.Sou), ...tiles('678', Suit.Sou), ...tiles('99', Suit.Sou)];
    const api = calculateMCRTotalFan(hand, []);
    return { totalFan: api.totalFan, isValid: api.isValid, hasQuanDaiYao: api.patterns.some(p => p.id === 'quanDaiYao') };
  });

defect('P3-建议', 'P3b', 'costToMakeSeq 只看「存在」，123456789m 被重复用于 123/234/345，报出「一色三步高 缺 0 张」',
  '一色三步高需要同花色 123+234+345 共 9 张（1、5 各一张，2、4 各两张，3 三张）；仅 123456789m 时至少还缺 4 张',
  { shanten: 2, missing: 0, probability: 80, fan: 25 },
  () => {
    const hand = [...tiles('123456789', Suit.Man), ...tiles('147', Suit.Pin), ...tiles('19', Suit.Sou)];
    const suggestion = analyzeMCR(hand, [], 'zh', 50).find(s => s.name.includes('一色三步高'));
    return { shanten: calculateShanten(hand, []), missing: suggestion?.missingTiles.length ?? -1, probability: suggestion?.probability ?? -1, fan: suggestion?.fan ?? -1 };
  });

defect('P3-建议', 'P3b', '五门齐用「存在即计一组」估算面子，向听被算成 0',
  '12345m + 123p + 456s + 1z + 5z 的 123/234/345 共用同一批万子，实际向听为 1，不是 0',
  { realShanten: 1, claimedShanten: '向听0', fan: 14 },
  () => {
    const hand = [...tiles('12345', Suit.Man), ...tiles('123', Suit.Pin), ...tiles('456', Suit.Sou), createTile(Suit.Zihai, 1), createTile(Suit.Zihai, 5)];
    const suggestion = analyzeMCR(hand, [], 'zh', 50).find(s => s.name.includes('五门齐'));
    const line = suggestion?.patternDetails.find(d => d.startsWith('向听'));
    return { realShanten: calculateShanten(hand, []), claimedShanten: line ?? '', fan: suggestion?.fan ?? -1 };
  });

defect('P3-建议', 'P3b', '海底提示按暗手 13/14 张判断，开放听牌漏提示、非听牌 14 张反而提示',
  '海底/妙手回春只能在真实听牌时提示；两副碰 + 7 张暗手已听牌，应提示；14 张未听牌不应提示',
  { openTenpaiOffered: false, closedNonTenpaiOffered: true },
  () => {
    const openTenpai = analyzeGame(state([...tiles('1234567', Suit.Man)], [pong(1), pong(9)], { wallCount: 1 }), 'zh');
    const closedNotTenpai = analyzeGame(state([
      ...tiles('159', Suit.Man), ...tiles('159', Suit.Pin), ...tiles('159', Suit.Sou),
      ...tiles('12345', Suit.Zihai)], [], { wallCount: 1 }), 'zh');
    const lastTileWords = ['海底', '妙手'];
    return {
      openTenpaiOffered: openTenpai.suggestions.some(s => lastTileWords.some(w => s.name.includes(w))),
      closedNonTenpaiOffered: closedNotTenpai.suggestions.some(s => lastTileWords.some(w => s.name.includes(w))),
    };
  });

defect('M04', 'P3a', '无副露就自动计不求人，和牌来源未知（未判定自摸）',
  '不求人需要门前清自摸；此处没有自摸/荣和上下文，不能自动成立',
  { hasBuQiuRen: true, hasMenQianQing: true },
  () => {
    const hand = [...tiles('234', Suit.Man), ...tiles('345', Suit.Man), ...tiles('567', Suit.Pin), ...tiles('456', Suit.Sou), ...tiles('55', Suit.Man)];
    const counts = patternCounts(hand);
    return { hasBuQiuRen: (counts.buQiuRen ?? 0) > 0, hasMenQianQing: (counts.menQianQing ?? 0) > 0 };
  });

defect('M05', 'P3b', '平和只看已录吃的数量，四副暗手顺子的平和漏识别',
  '123m456m789p234s + 55s 是四顺子 + 序数将，应有平和 2番',
  { totalFan: 9, hasPingHu: false, hasQuanDaiYao: true },
  () => {
    const hand = [...tiles('123', Suit.Man), ...tiles('456', Suit.Man), ...tiles('789', Suit.Pin), ...tiles('234', Suit.Sou), ...tiles('55', Suit.Sou)];
    const api = calculateMCRTotalFan(hand, []);
    return { totalFan: api.totalFan, hasPingHu: api.patterns.some(p => p.id === 'pingHu'), hasQuanDaiYao: api.patterns.some(p => p.id === 'quanDaiYao') };
  });

defect('M07', 'P3b', '三风刻按「两副风碰 + 手上有三张风牌」成立；明碰又被当成暗刻',
  '只有东、南两副风碰，第三门风只有单张，三风刻不成立；明碰也不是暗刻',
  { sanFengKe: 1, shuangAnKe: 1 },
  () => {
    const hand = [...tiles('12345', Suit.Man), ...tiles('77', Suit.Pin), createTile(Suit.Zihai, 3)];
    const melds = [pong(1, Suit.Zihai), pong(2, Suit.Zihai)];
    const counts = patternCounts(hand, melds);
    return { sanFengKe: counts.sanFengKe ?? 0, shuangAnKe: counts.shuangAnKe ?? 0 };
  });

defect('S01', 'P2', '川麻把清对记为 6 番 / 64 倍，与「清一色 2 指数番 + 大对子 1 指数番 = 8 倍」的参考口径不一致',
  '33344466699977s 是清对，无根、含 9；倍率须在选定规则来源后才能定',
  { isWinning: true, fan: 6, details: ['清对 (6番)'] },
  () => {
    const result = analyzeGame(sichuan(tiles('33344466699977', Suit.Sou), Suit.Man), 'zh');
    return { isWinning: result.isWinning, fan: result.suggestions[0]?.fan, details: result.suggestions[0]?.patternDetails };
  });

defect('S05', 'P2', '三根七对 11114444777799s 漏识别七对，只报清一色 + 3 根',
  '11114444777799s 是三组四张 + 一对，应按七对（含三根）判断',
  { fan: 7, details: ['清一色 (4番)', '根 x3 (+3番)'] },
  () => {
    const result = analyzeGame(sichuan(tiles('11114444777799', Suit.Sou), Suit.Man), 'zh');
    return { fan: result.suggestions[0]?.fan, details: result.suggestions[0]?.patternDetails };
  });

defect('S04', 'P2', '带幺九只看牌值是否为 1/9，漏掉 123/789 顺子',
  '12378911m + 123789p 的每副牌都带幺九，应识别带幺九 4番',
  { isWinning: true, fan: 1, details: ['基本和 (1番)'] },
  () => {
    const result = analyzeGame(sichuan([...tiles('12378911', Suit.Man), ...tiles('123789', Suit.Pin)], Suit.Sou), 'zh');
    return { isWinning: result.isWinning, fan: result.suggestions[0]?.fan, details: result.suggestions[0]?.patternDetails };
  });

defect('S03', 'P2', '刻子先按全部牌统计再叠加副露数量，明碰被计两次，误判对对胡',
  '碰 111p、999p 加暗手 123456m + 77p 是两顺两刻，应判基本和而非对对胡',
  { isWinning: true, fan: 2, details: ['对对胡 (2番)'] },
  () => {
    const hand = [...tiles('123456', Suit.Man), ...tiles('77', Suit.Pin)];
    const result = analyzeGame(sichuan(hand, Suit.Sou, [pong(1), pong(9)]), 'zh');
    return { isWinning: result.isWinning, fan: result.suggestions[0]?.fan, details: result.suggestions[0]?.patternDetails };
  });

console.log(`\n${passed} 项守卫通过；${defects} 项已确认缺陷（快照断言，非通过项）。`);
console.log('缺陷归属见上述 DEFECT 行：P2 = 川麻计番，P3a/P3b/P3c = 国标上下文/已知错误/缺失番种。');