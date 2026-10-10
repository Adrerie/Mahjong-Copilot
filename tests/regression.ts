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
 * - 国标平和/不求人定义参考 https://www.mindmahjong.com/adobe/20141120CEJ.pdf；
 *   规则预期中的自摸/点和条件须明确，现有 API 未提供这些字段，不能从快照推断实际合法起和。
 * - 川麻口径见 docs/RESTRUCTURE_PLAN_2026-10-10.md 第 4 节；项目尚未确定统一川渝规则，
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
import {
  decodeEntryState,
  encodeEntryState,
  parseTileText,
  planTextHand,
  planTileAdd,
} from '../utils/entryEditing';

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
  assert.equal(result.isReady, false);
  assert.equal(result.status, 'deadWait');
});

test('Sichuan cannot win while the void suit or a third suit remains', () => {
  const hand = [...tiles('123789', Suit.Man), ...tiles('12355', Suit.Pin), ...tiles('123', Suit.Sou)];
  // 先证明牌数合法且结构成牌，避免非成牌输入让定缺守卫空通过。
  assert.deepEqual(validateGameState(sichuan(hand, Suit.Sou), 'zh'), []);
  assert.equal(checkWinning(countsToArray(countTiles(hand)), 0, GameMode.Sichuan), true);
  const threeSuits = analyzeGame(
    sichuan(hand, Suit.Sou), 'zh');
  assert.equal(threeSuits.isWinning, false);
  assert.ok(threeSuits.warnings.some(w => w.includes('定缺')));
  const noVoidChosen = analyzeGame(sichuan(tiles('33344466699977', Suit.Sou), null), 'zh');
  assert.equal(noVoidChosen.isWinning, false);
  assert.ok(noVoidChosen.warnings.some(w => w.includes('定缺')));
});

test('structural completeness and eight-fan eligibility stay separate', () => {
  // 明吃234m/345m/567p，暗手456s55m；非门清、非全求人。
  // 无事件加番、和4s且非绝张时，平和2 + 断幺2；自摸最多再加1，均不足8。
  // 原全暗手牌例在自摸时可有不求人4 + 平和2 + 断幺2 = 8，不能作为不足8的守卫。
  const hand = [...tiles('456', Suit.Sou), ...tiles('55', Suit.Man)];
  const melds = [chi('234', Suit.Man), chi('345', Suit.Man), chi('567', Suit.Pin)];
  assert.deepEqual(validateGameState(state(hand, melds), 'zh'), []);
  assert.equal(checkWinning(countsToArray(countTiles(hand)), melds.length), true);
  const api = calculateMCRTotalFan(hand, melds);
  // 当前计番尚漏平和；不锁定错误的总番，以免后续补平和时本守卫反而失败。
  assert.ok(api.totalFan < 8);
  assert.equal(api.isValid, false);
  const result = analyzeGame(state(hand, melds), 'zh');
  assert.equal(result.isWinning, true);
  assert.equal(result.isReady, false);
});

test('an invalid or incomplete position returns warnings instead of a verdict', () => {
  const empty = analyzeGame(state([]), 'zh');
  assert.equal(empty.isWinning, false);
  assert.equal(empty.isReady, false);
  assert.equal(empty.status, 'incomplete');
  assert.equal(empty.shanten, null);
  assert.equal(empty.suggestions.length, 0);
  assert.ok(empty.warnings.length > 0);
  const fifteen = analyzeGame(state([...tiles('123456789', Suit.Man), ...tiles('123456', Suit.Sou)]), 'zh');
  assert.equal(fifteen.status, 'invalid');
  assert.equal(fifteen.shanten, null);
  assert.equal(fifteen.isWinning, false);
  assert.equal(fifteen.waitingTiles.length, 0);
});

// ============================================================
// 三、P1 录入门槛：文本解析、原子替换、张数边界与局面恢复
// ============================================================

/** 牌串 → 便于断言的 `值+花色` 列表。 */
const keys = (list: Tile[]): string[] => list.map(t => `${t.value}${t.suit}`);

test('restored meld IDs cannot be reused after a page reload', () => {
  const saved = state([], [{ ...pong(1), id: 'meld-1' }]);
  const restored = decodeEntryState(encodeEntryState(saved), GameMode.MCR);
  assert.ok(restored);
  const result = planTileAdd(restored, { zone: 'melds', meldType: 'pong', tile: createTile(Suit.Pin, 2) });
  assert.equal(result.outcome, 'applied');
  if (result.outcome !== 'applied') return;
  assert.equal(new Set(result.state.melds.map(m => m.id)).size, 2);
  const remaining = result.state.melds.filter(m => m.id !== result.state.melds[1].id);
  assert.equal(remaining.length, 1, '删除新增副露时必须保留恢复的副露');
  assert.equal(remaining[0].id, 'meld-1');
});

test('text entry reads the same hand from both notations', () => {
  const expected = [...'33344466699977'].map(d => `${d}s`);
  const letter = parseTileText('33344466699977s', GameMode.Sichuan);
  const chinese = parseTileText('33344466699977条', GameMode.Sichuan);
  assert.equal(letter.outcome, 'parsed');
  assert.equal(chinese.outcome, 'parsed');
  if (letter.outcome !== 'parsed' || chinese.outcome !== 'parsed') return;
  assert.deepEqual(keys(letter.tiles), expected);
  assert.deepEqual(keys(chinese.tiles), expected);
  assert.equal(letter.tiles.length, 14);

  // 混合花色 + 字牌，以及空格/斜杠分隔与繁体后缀
  const mixed = parseTileText('123m456p789s11z', GameMode.MCR);
  assert.equal(mixed.outcome, 'parsed');
  if (mixed.outcome === 'parsed') {
    assert.deepEqual(keys(mixed.tiles), ['1m', '2m', '3m', '4p', '5p', '6p', '7s', '8s', '9s', '1z', '1z']);
  }
  const separated = parseTileText('123m 456p / 789s', GameMode.MCR);
  const traditional = parseTileText('123萬456條', GameMode.MCR);
  assert.equal(separated.outcome === 'parsed' ? separated.tiles.length : 0, 9);
  assert.deepEqual(
    traditional.outcome === 'parsed' ? keys(traditional.tiles) : [],
    ['1m', '2m', '3m', '4s', '5s', '6s'],
  );
  // 单张和一整串都是合法录入，1–14 张的中间态允许录入但不允许分析
  assert.equal(parseTileText('1p', GameMode.MCR).outcome, 'parsed');
});

test('text entry rejects bad strings with a reason', () => {
  const malformed = ['33344466699977x', '123', '0m', '10m', '8z', '11111m', '123456789123456m', '', 'm123'];
  for (const text of malformed) {
    const parsed = parseTileText(text, GameMode.MCR);
    assert.equal(parsed.outcome, 'rejected', `“${text}” 应被拒绝`);
    assert.ok(parsed.outcome === 'rejected' && parsed.message.zh.length > 0 && parsed.message.en.length > 0);
  }
  // 川麻不能录字牌；三门仍可录入，留给分析判断定缺未清。
  assert.equal(parseTileText('11z', GameMode.Sichuan).outcome, 'rejected');
  assert.equal(parseTileText('123m456p789s', GameMode.Sichuan).outcome, 'parsed');
  assert.equal(parseTileText('123m456p789s', GameMode.MCR).outcome, 'parsed');
});

test('text replacement is atomic and never mutates the previous position', () => {
  const before = state([...tiles('123', Suit.Man)], [], { discards: tiles('9', Suit.Sou) });
  const rejected = planTextHand(before, '99999p');
  assert.equal(rejected.outcome, 'rejected');
  assert.deepEqual(keys(before.hand), ['1m', '2m', '3m']);
  assert.deepEqual(keys(before.discards), ['9s']);

  const applied = planTextHand(before, '33344466699977s');
  assert.equal(applied.outcome, 'applied');
  if (applied.outcome !== 'applied') return;
  assert.equal(applied.state.hand.length, 14);
  assert.deepEqual(keys(before.hand), ['1m', '2m', '3m'], '替换成功也不得改写旧局面，否则一步撤销会失真');
  assert.deepEqual(keys(applied.state.discards), ['9s'], '替换暗手不自动删除牌河');
  assert.notStrictEqual(applied.state, before);
});

test('text replacement counts copies in melds and river', () => {
  const withMeld = state(tiles('12', Suit.Man), [pong(1, Suit.Pin)], { discards: tiles('9', Suit.Sou) });
  assert.equal(planTextHand(withMeld, '1111p').outcome, 'rejected');
  assert.equal(planTextHand(withMeld, '11p').outcome, 'rejected');
  assert.equal(planTextHand(withMeld, '99s').outcome, 'applied');
});

test('adding tiles checks every copy of the whole position before committing', () => {
  const twoCopies = state(tiles('11', Suit.Pin));
  const extraPong = planTileAdd(twoCopies, { zone: 'melds', meldType: 'pong', tile: createTile(Suit.Pin, 1) });
  assert.equal(extraPong.outcome, 'rejected');
  assert.ok(extraPong.outcome === 'rejected' && extraPong.message.zh.includes('已见 2 张') && extraPong.message.zh.includes('添加 3 张'));
  const fourEights = state([...tiles('8888', Suit.Man), ...tiles('123', Suit.Pin)]);
  assert.equal(planTileAdd(fourEights, { zone: 'hand', meldType: 'pong', tile: createTile(Suit.Man, 8) }).outcome, 'rejected');
  // 吃 7m 需要 7m/8m/9m：8m 已满 → 拒绝；吃 6m 的第二张 8m 同样超四 → 拒绝
  assert.equal(planTileAdd(fourEights, { zone: 'melds', meldType: 'chi', tile: createTile(Suit.Man, 7) }).outcome, 'rejected');
  assert.equal(planTileAdd(fourEights, { zone: 'melds', meldType: 'chi', tile: createTile(Suit.Man, 6) }).outcome, 'rejected');

  // 牌河里的已知牌同样计入四张上限
  const riverHeld = state(tiles('11', Suit.Pin), [], { discards: tiles('11', Suit.Pin) });
  assert.equal(planTileAdd(riverHeld, { zone: 'hand', meldType: 'pong', tile: createTile(Suit.Pin, 1) }).outcome, 'rejected');
  assert.equal(planTileAdd(riverHeld, { zone: 'discards', meldType: 'pong', tile: createTile(Suit.Pin, 1) }).outcome, 'rejected');

  // 合法添加仍应通过
  const ok = planTileAdd(state(tiles('123', Suit.Man)), { zone: 'hand', meldType: 'pong', tile: createTile(Suit.Pin, 5) });
  assert.equal(ok.outcome, 'applied');
});

test('entry bounds: 14 effective tiles, four melds and chow span', () => {
  const full = state([...tiles('123456789', Suit.Man), ...tiles('12345', Suit.Pin)]);
  const handFull = planTileAdd(full, { zone: 'hand', meldType: 'pong', tile: createTile(Suit.Sou, 5) });
  assert.equal(handFull.outcome, 'rejected');
  assert.ok(handFull.outcome === 'rejected' && handFull.message.zh.includes('手牌已满'));

  const threeMelds = [chi('123', Suit.Man), chi('234', Suit.Pin), chi('345', Suit.Sou)];
  const withMelds = state(tiles('12', Suit.Man), threeMelds);
  assert.equal(effectiveTiles(withMelds.hand, withMelds.melds), 11);
  const fourth = planTileAdd(withMelds, { zone: 'melds', meldType: 'pong', tile: createTile(Suit.Pin, 9) });
  assert.equal(fourth.outcome, 'applied');
  const fourMelds = fourth.outcome === 'applied' ? fourth.state : withMelds;
  assert.equal(effectiveTiles(fourMelds.hand, fourMelds.melds), 14);
  assert.equal(planTileAdd(fourMelds, { zone: 'melds', meldType: 'pong', tile: createTile(Suit.Sou, 9) }).outcome, 'rejected');

  const short = state(tiles('12', Suit.Man));
  assert.equal(planTileAdd(short, { zone: 'melds', meldType: 'chi', tile: createTile(Suit.Man, 8) }).outcome, 'rejected');
  assert.equal(planTileAdd(short, { zone: 'melds', meldType: 'chi', tile: createTile(Suit.Man, 7) }).outcome, 'applied');
});

test('Sichuan entry refuses honors and chows before committing', () => {
  const hand = sichuan(tiles('123', Suit.Man), Suit.Sou);
  assert.equal(planTileAdd(hand, { zone: 'hand', meldType: 'pong', tile: createTile(Suit.Zihai, 1) }).outcome, 'rejected');
  assert.equal(planTileAdd(hand, { zone: 'melds', meldType: 'chi', tile: createTile(Suit.Man, 1) }).outcome, 'rejected');
  assert.equal(planTileAdd(hand, { zone: 'hand', meldType: 'pong', tile: createTile(Suit.Man, 4) }).outcome, 'applied');
});

test('Sichuan text entry preserves a three-suit shape and analysis rejects winning', () => {
  const position = sichuan([], Suit.Sou);
  const result = planTextHand(position, '123789m12355p123s');
  assert.equal(result.outcome, 'applied');
  if (result.outcome !== 'applied') return;
  assert.deepEqual(validateGameState(result.state, 'zh'), []);
  assert.equal(checkWinning(countsToArray(countTiles(result.state.hand)), 0, GameMode.Sichuan), true);
  const analysis = analyzeGame(result.state, 'zh');
  assert.equal(analysis.isWinning, false);
  assert.ok(analysis.warnings.some(w => w.includes('定缺')));
});

test('saved positions round-trip per mode and corrupt data is ignored', () => {
  const saved = state([...tiles('123', Suit.Man)], [pong(5, Suit.Pin)], {
    discards: tiles('9', Suit.Sou), wallCount: 61,
  });
  const restored = decodeEntryState(encodeEntryState(saved), GameMode.MCR);
  assert.ok(restored);
  assert.deepEqual(keys(restored.hand), ['1m', '2m', '3m']);
  assert.deepEqual(keys(restored.discards), ['9s']);
  assert.equal(restored.wallCount, 61);
  assert.equal(restored.melds.length, 1);

  // 11 张的录入中间态也要能恢复，不能因为不足 13 张被当成损坏数据丢弃
  const partial = state([...tiles('123', Suit.Man), ...tiles('456', Suit.Pin), ...tiles('789', Suit.Sou), ...tiles('11', Suit.Zihai)]);
  assert.equal(decodeEntryState(encodeEntryState(partial), GameMode.MCR)?.hand.length, 11);
  // 川麻定缺与墙数一并恢复
  const sichuanSaved = sichuan(tiles('123456', Suit.Man), Suit.Pin, [], { wallCount: 40 });
  const sichuanRestored = decodeEntryState(encodeEntryState(sichuanSaved), GameMode.Sichuan);
  assert.equal(sichuanRestored?.voidSuit, Suit.Pin);
  assert.equal(sichuanRestored?.wallCount, 40);

  const wrap = (stateValue: unknown) => JSON.stringify({ version: 1, state: stateValue });
  assert.equal(decodeEntryState(null, GameMode.MCR), null);
  assert.equal(decodeEntryState('{oops', GameMode.MCR), null);
  assert.equal(decodeEntryState('[]', GameMode.MCR), null);
  assert.equal(decodeEntryState('{"version":1,"state":{}}', GameMode.MCR), null);
  assert.equal(decodeEntryState(JSON.stringify({ version: 2, state: saved }), GameMode.MCR), null);
  assert.equal(decodeEntryState(encodeEntryState(saved), GameMode.Sichuan), null, '玩法不符时不得串用另一套牌局');
  assert.equal(decodeEntryState(wrap({ ...saved, hand: tiles('11111', Suit.Man) }), GameMode.MCR), null);
  assert.equal(decodeEntryState(wrap({ ...saved, hand: [{ id: 'x', suit: Suit.Man, value: 10 }] }), GameMode.MCR), null);
  assert.equal(decodeEntryState(wrap({ ...saved, hand: 'nope' }), GameMode.MCR), null);
  assert.equal(decodeEntryState(wrap({ ...saved, wallCount: 999 }), GameMode.MCR), null);
  assert.equal(decodeEntryState(wrap({ ...saved, voidSuit: 'x' }), GameMode.MCR), null);
});

// ============================================================
// 四、已确认缺陷（行为快照）
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
  '123456789m + 12355p 应有清龙 16番；456m 与将牌55p 不含幺九，全带幺不应成立',
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

defect('M06', 'P3b', '四张相同牌按一对计，1111223344m5566p 的七对漏识别',
  '四张同牌应记两对，1111223344m5566p 是七对 24番',
  { winning: true, totalFan: 12, isValid: true, hasQiDui: false },
  () => {
    const hand = [...tiles('1111223344', Suit.Man), ...tiles('5566', Suit.Pin)];
    const api = calculateMCRTotalFan(hand, []);
    return { winning: checkWinning(countsToArray(countTiles(hand)), 0), totalFan: api.totalFan, isValid: api.isValid, hasQiDui: api.patterns.some(p => p.id === 'qiDui') };
  });

defect('M01+A10', 'P3c', '合法 8 番牌型因三色三同顺未识别，被 isValid 判为不足 8 番（假阴性）',
  '234m234p234s + 567m + 55s 有三色三同顺8番，本身达到门槛；不求人另需确认门清自摸，当前未录和牌来源',
  { totalFan: 6, isValid: false, hasSanSeSanTongShun: false },
  () => {
    const hand = [...tiles('234', Suit.Man), ...tiles('234', Suit.Pin), ...tiles('234', Suit.Sou), ...tiles('567', Suit.Man), ...tiles('55', Suit.Sou)];
    const api = calculateMCRTotalFan(hand, []);
    return { totalFan: api.totalFan, isValid: api.isValid, hasSanSeSanTongShun: api.patterns.some(p => p.id === 'sanSeSanTongShun') };
  });

defect('M05+A10', 'P3b', '全带幺在没有副露时恒真，把不足 8 番的牌型误判为可起和（假阳性）',
  '123m234p345s678s + 99s 在无花/事件、和6s且非绝张的条件下，门清点和为门前清2 + 平和2 + 连六1，自摸为不求人4 + 平和2 + 连六1，均不足8；平和不计无字，全带幺不成立。当前API未记录这些上下文',
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

defect('M07', 'P3b', '三风刻错误认可第三种风的将牌；明碰又被当成暗刻',
  '只有东、南两副风碰，西风只作将，三风刻不成立；明碰也不是暗刻',
  { sanFengKe: 1, shuangAnKe: 1 },
  () => {
    const hand = [...tiles('123456', Suit.Man), ...tiles('33', Suit.Zihai)];
    const melds = [pong(1, Suit.Zihai), pong(2, Suit.Zihai)];
    assert.deepEqual(validateGameState(state(hand, melds), 'zh'), []);
    assert.equal(checkWinning(countsToArray(countTiles(hand)), melds.length), true);
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
  '12378911m + 123789p 存在每副面子与将均带幺九的拆分；是否计带幺九及其指数番/倍率须由选定川麻规则确定，不能先认定4番',
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
