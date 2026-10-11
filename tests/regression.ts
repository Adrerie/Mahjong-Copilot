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
 *   P3a 起 API 用 `GameState.winSource` 记录自摸/点和，未记录即 'unknown'，此时不得计这三种番；
 *   门风/圈风、和牌张/末张、明暗杠仍无字段，结果里只报「仍缺哪些上下文」。
 * - 川麻口径：采用 Hi8 血战到底示例牌桌记录的口径
 *   （https://hi8.com/g/sichuanmajiang，见 utils/sichuanAnalyzer.ts 的 SICHUAN_RULE）：
 *   平胡 0、对对胡 1、清一色 2、七对 2、带幺九 2、金钩钓 2（含对对胡），每根 +1，
 *   封顶 4 指数番 = 16 倍。该口径只是该牌桌的示例，不是四川/重庆统一规范；
 *   自摸/点炮、杠类型、海底等事件未建模，一律不加番。
 */
import assert from 'node:assert/strict';
import { GameMode, GameState, Meld, Suit, Tile, WinSource } from '../types';
import { createTile, TEXT } from '../constants';
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
import { recognizeSichuanPatterns } from '../utils/sichuanAnalyzer';
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
/** 番种 id -> 叠加次数，按 id 排序，便于稳定比较。winSource 未记录时用 'unknown'。 */
const patternCounts = (hand: Tile[], melds: Meld[] = [], winSource: WinSource = 'unknown'): Record<string, number> => {
  const counts = new Map<string, number>();
  for (const r of recognizeMCRPatterns(hand, melds, winSource)) {
    counts.set(r.pattern.id, (counts.get(r.pattern.id) ?? 0) + r.count);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
};
const mcrFan = (hand: Tile[], melds: Meld[] = [], winSource: WinSource = 'unknown'): number =>
  calculateTotalFan(recognizeMCRPatterns(hand, melds, winSource)).totalFan;

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
  // A malformed cache cannot share deletion IDs across distinct tiles or melds.
  assert.equal(decodeEntryState(wrap({ ...saved, hand: [
    { ...createTile(Suit.Man, 1), id: 'same' }, { ...createTile(Suit.Man, 2), id: 'same' },
  ] }), GameMode.MCR), null);
  assert.equal(decodeEntryState(wrap({ ...saved, melds: [
    { ...pong(1), id: 'meld-same' }, { ...pong(2), id: 'meld-same' },
  ] }), GameMode.MCR), null);
  assert.equal(decodeEntryState(wrap({ ...saved, hand: [
    { ...createTile(Suit.Man, 1), id: 'empty-id' }, { ...createTile(Suit.Man, 2), id: '' },
  ] }), GameMode.MCR), null);
});

// ============================================================
// 四、四川血战计番（P2）：口径来源 Hi8 血战到底示例牌桌
// 平胡 0、对对胡 1、清一色 2、七对 2、带幺九 2、金钩钓 2（含对对胡），每根 +1，封顶 4 指数番 = 16 倍。
// ============================================================

test('Sichuan flush pungs = 3 exponents (8x), and a kong root is added before the cap', () => {
  // 33344466699977s：清一色 + 对对胡、无根；定缺万，只有一门。
  const flushPungs = sichuan(tiles('33344466699977', Suit.Sou), Suit.Man);
  assert.deepEqual(validateGameState(flushPungs, 'zh'), []);
  const score = recognizeSichuanPatterns(flushPungs.hand, flushPungs.melds, 'zh');
  assert.deepEqual(score.patterns, [{ id: 'qingYiSe', exponent: 2 }, { id: 'duiDuiHu', exponent: 1 }]);
  assert.equal(score.label, '清对');
  assert.equal(score.roots, 0);
  assert.equal(score.uncappedExponent, 3);
  assert.equal(score.cappedExponent, 3);
  assert.equal(score.multiplier, 8);
  const result = analyzeGame(flushPungs, 'zh');
  assert.equal(result.isWinning, true);
  assert.equal(result.suggestions[0]?.scoreText, '3 指数番 · 8 倍');
  assert.ok(!result.suggestions[0]?.patternDetails.some(d => d.includes('6番') || d.includes('64')), '清对不得再报 6 番/64 倍');

  // 对照：杠 9m 本身算一根，指数番 3+1=4 仍到封顶；倍率随根增大（8 → 16）。
  const withRoot = sichuan([...tiles('111222333', Suit.Man), ...tiles('55', Suit.Man)], Suit.Sou, [gang(9, Suit.Man)]);
  assert.deepEqual(validateGameState(withRoot, 'zh'), []);
  const rooted = recognizeSichuanPatterns(withRoot.hand, withRoot.melds, 'zh');
  assert.deepEqual(rooted.patterns, [{ id: 'qingYiSe', exponent: 2 }, { id: 'duiDuiHu', exponent: 1 }]);
  assert.equal(rooted.roots, 1);
  assert.equal(rooted.uncappedExponent, 4);
  assert.equal(rooted.multiplier, 16);
});

test('Sichuan exposed pongs are never counted again as concealed triplets', () => {
  // 碰 111p、碰 999p + 暗手 123456m + 77p：两顺两刻，只有基本和。
  const hand = [...tiles('123456', Suit.Man), ...tiles('77', Suit.Pin)];
  const melds = [pong(1), pong(9)];
  const exposed = sichuan(hand, Suit.Sou, melds);
  assert.deepEqual(validateGameState(exposed, 'zh'), []);
  const score = recognizeSichuanPatterns(hand, melds, 'zh');
  assert.deepEqual(score.patterns, [{ id: 'pingHu', exponent: 0 }]);
  assert.equal(score.uncappedExponent, 0);
  assert.equal(score.multiplier, 1);
  const result = analyzeGame(exposed, 'zh');
  assert.equal(result.isWinning, true);
  assert.equal(result.suggestions[0]?.name, '成牌（基本和，参考计番）');

  // 对照：同样两副明碰，暗手换成两刻 + 将时确实是对对胡（1 指数番 = 2 倍）。
  const tripletHand = [...tiles('555', Suit.Man), ...tiles('777', Suit.Man), ...tiles('33', Suit.Man)];
  const duiDui = sichuan(tripletHand, Suit.Sou, [pong(1), pong(9)]);
  assert.deepEqual(validateGameState(duiDui, 'zh'), []);
  const duiDuiScore = recognizeSichuanPatterns(tripletHand, [pong(1), pong(9)], 'zh');
  assert.deepEqual(duiDuiScore.patterns, [{ id: 'duiDuiHu', exponent: 1 }]);
  assert.equal(duiDuiScore.multiplier, 2);

  // 对照：副露已占的牌不得在暗手重复出现（同一种牌最多四张）。
  const duplicate = sichuan([...tiles('111', Suit.Pin), ...tiles('123456', Suit.Man)], Suit.Sou, [pong(1)]);
  assert.ok(validateGameState(duplicate, 'zh').length > 0);
});

test('Sichuan terminals pattern needs 123/789 chows and a terminal pair', () => {
  // 12378911m + 123789p：四副顺子都含幺九、将 11m 也含幺九 → 带幺九 2 指数番 = 4 倍。
  const hand = [...tiles('12378911', Suit.Man), ...tiles('123789', Suit.Pin)];
  const terminals = sichuan(hand, Suit.Sou);
  assert.deepEqual(validateGameState(terminals, 'zh'), []);
  const score = recognizeSichuanPatterns(hand, [], 'zh');
  assert.deepEqual(score.patterns, [{ id: 'daiYaoJiu', exponent: 2 }]);
  assert.equal(score.label, '带幺九');
  assert.equal(score.multiplier, 4);
  assert.equal(analyzeGame(terminals, 'zh').suggestions[0]?.scoreText, '2 指数番 · 4 倍');

  // 对照：同样的顺子结构，将牌 55m 不含幺九 → 只有基本和（0 指数番 = 1 倍）。
  const middlePair = [...tiles('12378955', Suit.Man), ...tiles('123789', Suit.Pin)];
  const plain = sichuan(middlePair, Suit.Sou);
  assert.deepEqual(validateGameState(plain, 'zh'), []);
  const plainScore = recognizeSichuanPatterns(middlePair, [], 'zh');
  assert.deepEqual(plainScore.patterns, [{ id: 'pingHu', exponent: 0 }]);
  assert.equal(plainScore.multiplier, 1);

  // 对照：牌面存在 9 不代表能拆出带幺九（234/567 顺子不含幺九）。
  const middleChows = [...tiles('23456799', Suit.Man), ...tiles('234567', Suit.Pin)];
  const chows = sichuan(middleChows, Suit.Sou);
  assert.deepEqual(validateGameState(chows, 'zh'), []);
  assert.equal(checkWinning(countsToArray(countTiles(middleChows)), 0, GameMode.Sichuan), true);
  assert.deepEqual(recognizeSichuanPatterns(middleChows, [], 'zh').patterns, [{ id: 'pingHu', exponent: 0 }]);
});

test('Sichuan seven pairs counts four of a kind as two pairs and roots separately', () => {
  // 11114444777799s：1/4/7 各四张拆成两对 + 99s 共七对；清一色 2 + 七对 2 + 根 ×3 = 7 → 封顶 4 = 16 倍。
  const hand = tiles('11114444777799', Suit.Sou);
  const position = sichuan(hand, Suit.Man);
  assert.deepEqual(validateGameState(position, 'zh'), []);
  const score = recognizeSichuanPatterns(hand, [], 'zh');
  assert.deepEqual(score.patterns, [{ id: 'qingYiSe', exponent: 2 }, { id: 'qiDui', exponent: 2 }]);
  assert.equal(score.label, '清龙七对');
  assert.equal(score.roots, 3);
  assert.equal(score.uncappedExponent, 7);
  assert.equal(score.cappedExponent, 4);
  assert.equal(score.multiplier, 16);
  assert.equal(analyzeGame(position, 'zh').suggestions[0]?.scoreText, '4 指数番 · 16 倍');

  // 对照：无根的清七对 11223344556677s 正好 4 指数番 = 16 倍。
  const plainScore = recognizeSichuanPatterns(tiles('11223344556677', Suit.Sou), [], 'zh');
  assert.equal(plainScore.label, '清七对');
  assert.equal(plainScore.roots, 0);
  assert.equal(plainScore.uncappedExponent, 4);
  assert.equal(plainScore.multiplier, 16);

  // 对照：同样是四张同牌，整体不是七对（顺子刻子混合）时不按七对计，根仍单算。
  const mixed = [...tiles('111123', Suit.Sou), ...tiles('45678999', Suit.Man)];
  assert.equal(checkWinning(countsToArray(countTiles(mixed)), 0, GameMode.Sichuan), true);
  const mixedScore = recognizeSichuanPatterns(mixed, [], 'zh');
  assert.deepEqual(mixedScore.patterns, [{ id: 'pingHu', exponent: 0 }]);
  assert.equal(mixedScore.roots, 1);
  assert.equal(mixedScore.uncappedExponent, 1);
  assert.equal(mixedScore.multiplier, 2);
});

test('Sichuan scoring never combines seven pairs with a different chow decomposition', () => {
  // Hi8 每组/每对带幺九；七对拆分里的22/33/77/88不是幺九对子。
  // 11112233778899s 也可拆成123/123/789/789/11，两种拆分只能择一。
  const hand = tiles('11112233778899', Suit.Sou);
  assert.equal(checkWinning(countsToArray(countTiles(hand)), 0, GameMode.Sichuan), true);
  const score = recognizeSichuanPatterns(hand, [], 'zh');
  assert.deepEqual(score.patterns, [{ id: 'qingYiSe', exponent: 2 }, { id: 'qiDui', exponent: 2 }]);
  assert.equal(score.baseExponent, 4);
  assert.equal(score.roots, 1);
  assert.equal(score.uncappedExponent, 5);
});

test('Sichuan terminal seven pairs checks the pairs in its own decomposition', () => {
  // Hi8「每对都带一或九」：七对的七个对子均为幺九，根与七对分开计算。
  const hand = [...tiles('11119999', Suit.Man), ...tiles('111199', Suit.Pin)];
  assert.equal(checkWinning(countsToArray(countTiles(hand)), 0, GameMode.Sichuan), true);
  const score = recognizeSichuanPatterns(hand, [], 'zh');
  assert.deepEqual(score.patterns, [{ id: 'qiDui', exponent: 2 }, { id: 'daiYaoJiu', exponent: 2 }]);
  assert.equal(score.baseExponent, 4);
  assert.equal(score.roots, 3);
  assert.equal(score.uncappedExponent, 7);
});

test('Sichuan never adds 对对胡 and 带幺九 from two different decompositions', () => {
  // 111222333m99911p 有两种合法拆分：
  //   111/222/333/999 + 11 将 → 对对胡 1 指数番；
  //   123/123/123/999 + 11 将 → 每副面子与将都带幺九 → 带幺九 2 指数番。
  // 一次和牌只能按一种拆分结算，取较高者 = 带幺九 2 指数番 = 4 倍，不是 1+2=3 → 8 倍。
  const hand = [...tiles('111222333', Suit.Man), ...tiles('99911', Suit.Pin)];
  const position = sichuan(hand, Suit.Sou);
  assert.deepEqual(validateGameState(position, 'zh'), []);
  const score = recognizeSichuanPatterns(hand, [], 'zh');
  assert.deepEqual(score.patterns, [{ id: 'daiYaoJiu', exponent: 2 }]);
  assert.equal(score.label, '带幺九');
  assert.equal(score.baseExponent, 2);
  assert.equal(score.roots, 0);
  assert.equal(score.uncappedExponent, 2);
  assert.equal(score.cappedExponent, 2);
  assert.equal(score.multiplier, 4);
  assert.equal(analyzeGame(position, 'zh').suggestions[0]?.scoreText, '2 指数番 · 4 倍');
  // 替代拆分只用于内部择高，不在普通结果中显示，避免误导。
  assert.ok(!score.details.some(detail => detail.includes('对对胡') || detail.includes('待核')));
  // 指数番仍等于选中拆分 + 根，未把两套拆分相加。
  assert.equal(score.uncappedExponent, score.patterns.reduce((total, hit) => total + hit.exponent, 0) + score.roots);
});

test('Sichuan 对对胡/带幺九/金钩钓 boundary readings', () => {
  // 四副幺九刻子但将牌 55m 不含幺九：只有一套拆分 → 对对胡 1 指数番 = 2 倍，不得补带幺九。
  const pongHand = [...tiles('11199955', Suit.Man), ...tiles('111999', Suit.Pin)];
  assert.deepEqual(validateGameState(sichuan(pongHand, Suit.Sou), 'zh'), []);
  assert.equal(checkWinning(countsToArray(countTiles(pongHand)), 0, GameMode.Sichuan), true);
  const pongScore = recognizeSichuanPatterns(pongHand, [], 'zh');
  assert.deepEqual(pongScore.patterns, [{ id: 'duiDuiHu', exponent: 1 }]);
  assert.equal(pongScore.multiplier, 2);

  // 111222333m99977p：刻子拆分是对对胡 1，顺子拆分不给番型 → 取较高的刻子拆分 = 2 倍。
  const chowOrPung = [...tiles('111222333', Suit.Man), ...tiles('99977', Suit.Pin)];
  const mixedScore = recognizeSichuanPatterns(chowOrPung, [], 'zh');
  assert.deepEqual(mixedScore.patterns, [{ id: 'duiDuiHu', exponent: 1 }]);
  assert.equal(mixedScore.multiplier, 2);

  // 金钩钓（四副明碰 + 单钓将）按来源包含对对胡、不双计；将牌不是幺九就不加带幺九。
  const jinGouHand = tiles('55', Suit.Pin);
  const jinGouMelds = [pong(1, Suit.Man), pong(2, Suit.Man), pong(3, Suit.Man), pong(9)];
  assert.deepEqual(validateGameState(sichuan(jinGouHand, Suit.Sou, jinGouMelds), 'zh'), []);
  const jinGouScore = recognizeSichuanPatterns(jinGouHand, jinGouMelds, 'zh');
  assert.deepEqual(jinGouScore.patterns, [{ id: 'jinGouDiao', exponent: 2 }]);
  assert.equal(jinGouScore.multiplier, 4);

  // 七对与对对胡互斥：反过来真对对胡也不判七对。
  const duiDuiHand = [...tiles('555', Suit.Man), ...tiles('777', Suit.Man), ...tiles('33', Suit.Man)];
  const duiDuiScore = recognizeSichuanPatterns(duiDuiHand, [pong(1), pong(9)], 'zh');
  assert.deepEqual(duiDuiScore.patterns, [{ id: 'duiDuiHu', exponent: 1 }]);
  const qiDuiScore = recognizeSichuanPatterns(tiles('11114444777799', Suit.Sou), [], 'zh');
  assert.ok(qiDuiScore.patterns.some(hit => hit.id === 'qiDui'));
  assert.ok(!qiDuiScore.patterns.some(hit => hit.id === 'duiDuiHu'));
});

test('Sichuan exponents are capped at 4 and unknown events are never scored', () => {
  // 11112377889999s：清一色 2 + 带幺九 2 + 根 ×2 = 6 指数番 → 封顶 4 = 16 倍（不是 2^6 = 64）。
  const hand = tiles('11112377889999', Suit.Sou);
  assert.deepEqual(validateGameState(sichuan(hand, Suit.Man), 'zh'), []);
  const score = recognizeSichuanPatterns(hand, [], 'zh');
  assert.deepEqual(score.patterns, [{ id: 'qingYiSe', exponent: 2 }, { id: 'daiYaoJiu', exponent: 2 }]);
  assert.equal(score.roots, 2);
  assert.equal(score.uncappedExponent, 6);
  assert.equal(score.cappedExponent, 4);
  assert.equal(score.multiplier, 16);
  assert.equal(score.capExponent, 4);
  assert.equal(score.ruleId, 'hi8-blood-battle');
  assert.equal(score.ruleSource, 'https://hi8.com/g/sichuanmajiang');
  // 指数番只由番型与根构成：自摸/杠类型/海底等未建模事件不得自动加番。
  assert.equal(score.uncappedExponent, score.patterns.reduce((sum, p) => sum + p.exponent, 0) + score.roots);
  assert.deepEqual(score.pendingContext, TEXT.zh.pendingEvents);
  // 国标路径不受影响：仍按番数显示，不出现指数番文本。
  const mcr = analyzeGame(state([...tiles('111123', Suit.Sou), ...tiles('45678999', Suit.Man)]), 'zh');
  assert.equal(mcr.isWinning, true);
  assert.equal(mcr.suggestions[0]?.scoreText, undefined);
});

test('Sichuan advice on an unfinished hand lists potentials without invented probabilities', () => {
  const unfinished = sichuan([...tiles('11223344', Suit.Man), ...tiles('12345', Suit.Pin)], Suit.Sou);
  assert.deepEqual(validateGameState(unfinished, 'zh'), []);
  const result = analyzeGame(unfinished, 'zh');
  assert.equal(result.isWinning, false);
  assert.ok(result.suggestions.length > 0);
  for (const suggestion of result.suggestions) {
    assert.equal(suggestion.probability, 0);
    assert.ok(suggestion.scoreText?.includes('指数番'), suggestion.name);
    assert.ok(!suggestion.patternDetails.some(d => d.includes('%') || d.includes('64')));
  }

  // 定缺花色还没打完：只报花猪，不给番型期望，也不给概率或倍率。
  const flowerPig = analyzeGame(sichuan(tiles('33344466699977', Suit.Sou), Suit.Sou), 'zh');
  assert.equal(flowerPig.isWinning, false);
  assert.equal(flowerPig.suggestions[0]?.name, '花猪');
  assert.equal(flowerPig.suggestions[0]?.probability, 0);
  assert.equal(flowerPig.suggestions[0]?.scoreText, '无法和牌');
});

// ============================================================
// 五、P3a 国标和牌上下文与特殊结构
// ============================================================

test('P3a open knitted straight scores its concealed nine tiles with a locked meld', () => {
  const hand = [...tiles('147', Suit.Man), ...tiles('258', Suit.Pin), ...tiles('369', Suit.Sou), ...tiles('55', Suit.Man)];
  for (const meld of [pong(6, Suit.Zihai), gang(6, Suit.Zihai), chi('456', Suit.Man)]) {
    const score = calculateMCRTotalFan(hand, [meld]);
    assert.equal(score.structuralWin, true);
    assert.equal(score.patterns.find(p => p.id === 'zuHeLong')?.fan, 12);
  }
  const noPair = [...hand.slice(0, -1), createTile(Suit.Man, 6)];
  assert.equal(calculateMCRTotalFan(noPair, [pong(6, Suit.Zihai)]).structuralWin, false);
});

test('P3a missing last-tile facts cannot establish a maximum or rule out eight fan', () => {
  // 可确认断幺2番；和牌来源再加至多4番，不代表事件总上限。
  // 妙手回春/海底捞月本身8番，尚未记录，不能据此宣称不足8番。
  const hand = [...tiles('23434555', Suit.Man), ...tiles('567', Suit.Pin), ...tiles('456', Suit.Sou)];
  for (const source of ['unknown', 'selfDraw', 'claim'] as const) {
    const score = calculateMCRTotalFan(hand, [], source);
    assert.equal(score.eligibility, 'unverified');
    assert.equal(score.isValid, false);
    assert.ok(score.missingContext.includes('winningTile'));
    const details = analyzeGame(state(hand, [], { winSource: source }), 'zh').suggestions[0]?.patternDetails ?? [];
    assert.ok(details.some(detail => detail.includes('8 番起和待核')));
    assert.ok(!details.some(detail => /补齐事件后|最多|不足 8 番/.test(detail)));
  }
});

test('P3a knitted hands retain self-draw fan when fully concealed hand is excluded', () => {
  for (const hand of [
    [...tiles('147', Suit.Man), ...tiles('258', Suit.Pin), createTile(Suit.Sou, 3), ...tiles('1234567', Suit.Zihai)],
    [...tiles('147', Suit.Man), ...tiles('258', Suit.Pin), ...tiles('369', Suit.Sou), ...tiles('12345', Suit.Zihai)],
  ]) {
    const draw = calculateMCRTotalFan(hand, [], 'selfDraw');
    const claim = calculateMCRTotalFan(hand, [], 'claim');
    assert.equal(draw.patterns.find(p => p.id === 'ziMo')?.fan, 1);
    assert.equal(draw.patterns.some(p => p.id === 'buQiuRen'), false);
    assert.equal(draw.totalFan, claim.totalFan + 1);
    assert.equal(claim.patterns.some(p => p.id === 'ziMo'), false);
  }
});

test('A04 MCR special structures are legal winning shapes (positive)', () => {
  // 结构口径（国标特殊牌型）：147/258/369 不能错位地分属三种花色，孤张不得重复。
  const sevenStars = [...tiles('147', Suit.Man), ...tiles('258', Suit.Pin), createTile(Suit.Sou, 3), ...tiles('1234567', Suit.Zihai)];
  const lesserKnitted = [...tiles('147', Suit.Man), ...tiles('258', Suit.Pin), ...tiles('369', Suit.Sou), ...tiles('12345', Suit.Zihai)];
  const knittedStraight = [...tiles('147', Suit.Man), ...tiles('258', Suit.Pin), ...tiles('369', Suit.Sou), ...tiles('111', Suit.Man), ...tiles('22', Suit.Pin)];

  assert.equal(checkWinning(countsToArray(countTiles(sevenStars)), 0), true);
  assert.equal(checkWinning(countsToArray(countTiles(lesserKnitted)), 0), true);
  assert.equal(checkWinning(countsToArray(countTiles(knittedStraight)), 0), true);
  // 组合龙也可只有一副副露：9 张龙 + 将 收在暗手
  assert.equal(checkWinning(countsToArray(countTiles([...tiles('147', Suit.Man), ...tiles('258', Suit.Pin), ...tiles('369', Suit.Sou), ...tiles('55', Suit.Man)])), 1), true);

  // 番种：七星不靠 24（不叠全不靠）、全不靠 12、组合龙 12。
  // 注：总番还受未修的 P3b 缺陷影响（全带幺在无副露时恒真，见下方 M05+A10 快照），
  // 本批只断言特殊结构本身被正确识别与计番，不把该缺陷的总数写成期望值。
  const sevenStarsFan = calculateMCRTotalFan(sevenStars, []);
  assert.equal(sevenStarsFan.structuralWin, true);
  assert.equal(sevenStarsFan.details.includes('七星不靠 (24番)'), true);
  assert.equal(sevenStarsFan.patterns.some(p => p.id === 'quanBuKao'), false);
  const lesserFan = calculateMCRTotalFan(lesserKnitted, []);
  assert.equal(lesserFan.details.includes('全不靠 (12番)'), true);
  assert.equal(lesserFan.patterns.some(p => p.id === 'qiXingBuKao'), false);
  assert.equal(patternCounts(knittedStraight).zuHeLong, 1);
  assert.equal(calculateMCRTotalFan(knittedStraight, []).patterns.find(p => p.id === 'zuHeLong')?.fan, 12);
});

test('A04 MCR special structures reject duplicates, short hands, shifted groups and melds (negative)', () => {
  const duplicated = [...tiles('1477', Suit.Man), ...tiles('25', Suit.Pin), createTile(Suit.Sou, 3), ...tiles('1234567', Suit.Zihai)];
  assert.equal(duplicated.length, 14);
  assert.equal(checkWinning(countsToArray(countTiles(duplicated)), 0), false);
  // 少一张 / 多一张
  const short = [...tiles('147', Suit.Man), ...tiles('258', Suit.Pin), ...tiles('369', Suit.Sou), ...tiles('1234', Suit.Zihai)];
  assert.equal(checkWinning(countsToArray(countTiles(short)), 0), false);
  // 错位：两组龙落在同一花色（147m + 258m），也没有第三组
  const shifted = [...tiles('147', Suit.Man), ...tiles('258', Suit.Man), ...tiles('369', Suit.Sou), ...tiles('111', Suit.Man), ...tiles('22', Suit.Pin)];
  assert.equal(checkWinning(countsToArray(countTiles(shifted)), 0), false);
  // 组合龙缺一张龙（36s 而不是 369s）
  const brokenKnitted = [...tiles('147', Suit.Man), ...tiles('258', Suit.Pin), ...tiles('36', Suit.Sou), ...tiles('111', Suit.Man), ...tiles('22', Suit.Pin)];
  assert.equal(brokenKnitted.length, 13);
  assert.equal(checkWinning(countsToArray(countTiles(brokenKnitted)), 0), false);
  // 带副露时七星不靠/全不靠不成立
  const sevenStars = [...tiles('147', Suit.Man), ...tiles('258', Suit.Pin), createTile(Suit.Sou, 3), ...tiles('1234567', Suit.Zihai)];
  assert.equal(checkWinning(countsToArray(countTiles(sevenStars)), 1), false);
});

test('M04 MCR 不求人 / 门前清 / 自摸 require a recorded win source', () => {
  // 口径：不求人 = 门前清 + 自摸；门前清 = 门清 + 点和。没有来源事实时三者都不得自动成立。
  const hand = [...tiles('234', Suit.Man), ...tiles('345', Suit.Man), ...tiles('567', Suit.Pin), ...tiles('456', Suit.Sou), ...tiles('55', Suit.Man)];
  assert.equal(patternCounts(hand).buQiuRen ?? 0, 0);
  assert.equal(patternCounts(hand).menQianQing ?? 0, 0);
  assert.equal(patternCounts(hand).ziMo ?? 0, 0);

  // 自摸：不求人成立，且用 excludes 去掉自摸/门前清，不重复相加
  assert.equal(patternCounts(hand, [], 'selfDraw').buQiuRen, 1);
  assert.equal(patternCounts(hand, [], 'selfDraw').menQianQing ?? 0, 0);
  assert.deepEqual(calculateMCRTotalFan(hand, [], 'selfDraw').patterns.map(p => p.id).sort(), ['buQiuRen', 'duanYao']);

  // 点和：门前清成立，不求人不成立
  assert.equal(patternCounts(hand, [], 'claim').menQianQing, 1);
  assert.equal(patternCounts(hand, [], 'claim').buQiuRen ?? 0, 0);

  // 有副露：三种都不成立，但自摸（1番）仍与来源一致
  const melds = [pong(1), pong(2), pong(3)];
  const openHand = [...tiles('234', Suit.Man), ...tiles('55', Suit.Man)];
  assert.equal(patternCounts(openHand, melds, 'selfDraw').ziMo, 1);
  assert.equal(patternCounts(openHand, melds, 'selfDraw').buQiuRen ?? 0, 0);
  assert.equal(patternCounts(openHand, melds).ziMo ?? 0, 0);

  // 仅和牌来源能加至 4 + 2 = 6 番；末张等事件未知，不能断言不足8番
  const unknown = calculateMCRTotalFan(hand, []);
  assert.equal(unknown.structuralWin, true);
  assert.equal(unknown.confirmedFan, 2);
  assert.equal(unknown.maxPossibleFan, 6);
  assert.equal(unknown.eligibility, 'unverified');
  assert.equal(unknown.isValid, false);
  assert.deepEqual(unknown.missingContext, ['winSource', 'winningTile', 'seatWind', 'kongType']);
  assert.equal(calculateMCRTotalFan(hand, [], 'selfDraw').eligibility, 'unverified');
  assert.equal(calculateMCRTotalFan(hand, [], 'claim').eligibility, 'unverified');
});

test('P3a unknown win source never claims the eight-fan minimum', () => {
  // 123m234p345s678s99s：当前识别为全带幺4 + 无字1（平和/连六未识别）。
  // 自摸可加不求人4 = 9 番，点和只加门前清2 = 7 番，因此来源未知时资格只能是「待核」。
  const hand = [...tiles('123', Suit.Man), ...tiles('234', Suit.Pin), ...tiles('345', Suit.Sou), ...tiles('678', Suit.Sou), ...tiles('99', Suit.Sou)];
  const unknown = calculateMCRTotalFan(hand, []);
  assert.equal(unknown.confirmedFan, 5);
  assert.equal(unknown.maxPossibleFan, 9);
  assert.equal(unknown.eligibility, 'unverified');
  assert.equal(unknown.isValid, false);
  assert.equal(unknown.missingContext.includes('winSource'), true);

  const selfDraw = calculateMCRTotalFan(hand, [], 'selfDraw');
  assert.equal(selfDraw.confirmedFan, 9);
  assert.equal(selfDraw.eligibility, 'met');
  assert.equal(selfDraw.isValid, true);
  assert.equal(selfDraw.missingContext.includes('winSource'), false);

  const claim = calculateMCRTotalFan(hand, [], 'claim');
  assert.equal(claim.confirmedFan, 7);
  assert.equal(claim.eligibility, 'unverified');

  // 未成牌结构不报可确认番，也不报上下文缺口
  const notWinning = calculateMCRTotalFan([...tiles('123', Suit.Man), ...tiles('456', Suit.Man), ...tiles('789', Suit.Pin), ...tiles('55', Suit.Sou)], []);
  assert.equal(notWinning.structuralWin, false);
  assert.deepEqual(notWinning.missingContext, []);
  assert.equal(notWinning.isValid, false);
});

// ============================================================
// 六、已确认缺陷（行为快照）
//
// P3a 基线变化：以下涉及无副露手牌的快照，其 totalFan / isValid 已随 M04 修复下调
// （不再自动计不求人 4 / 门前清 2）。缺陷本身（全带幺恒真、七对漏识别、明碰当暗刻、
// 建议层缺牌与向听估算等）仍未修，故仍以快照保留而不是改成正确断言。
// ============================================================

defect('M01', 'P3c', '大三元未识别，用三暗刻等低番凑番（P3a 去掉自动不求人后为 26 番）',
  '555666777z + 12355m 应有大三元 88番',
  { totalFan: 26, hasDaSanYuan: false, patterns: ['hunYiSe', 'quanDaiYao', 'sanAnKe'] },
  () => {
    const hand = [...tiles('555666777', Suit.Zihai), ...tiles('12355', Suit.Man)];
    const api = calculateMCRTotalFan(hand, []);
    return { totalFan: api.totalFan, hasDaSanYuan: api.patterns.some(p => p.id === 'daSanYuan'), patterns: api.patterns.map(p => p.id).sort() };
  });

defect('M01+M05', 'P3b', '清龙未识别；同一手牌又错误加上全带幺',
  '123456789m + 12355p 应有清龙 16番；456m 与将牌55p 不含幺九，全带幺不应成立',
  { totalFan: 6, hasQingLong: false, hasQuanDaiYao: true },
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
  { winning: true, totalFan: 8, isValid: true, hasQiDui: false },
  () => {
    const hand = [...tiles('1111223344', Suit.Man), ...tiles('5566', Suit.Pin)];
    const api = calculateMCRTotalFan(hand, []);
    return { winning: checkWinning(countsToArray(countTiles(hand)), 0), totalFan: api.totalFan, isValid: api.isValid, hasQiDui: api.patterns.some(p => p.id === 'qiDui') };
  });

defect('M01+A10', 'P3c', '合法 8 番牌型因三色三同顺未识别，被 isValid 判为不足 8 番（假阴性）',
  '234m234p234s + 567m + 55s 有三色三同顺8番，本身达到门槛；不求人另需确认门清自摸，当前未录和牌来源',
  { totalFan: 2, isValid: false, hasSanSeSanTongShun: false },
  () => {
    const hand = [...tiles('234', Suit.Man), ...tiles('234', Suit.Pin), ...tiles('234', Suit.Sou), ...tiles('567', Suit.Man), ...tiles('55', Suit.Sou)];
    const api = calculateMCRTotalFan(hand, []);
    return { totalFan: api.totalFan, isValid: api.isValid, hasSanSeSanTongShun: api.patterns.some(p => p.id === 'sanSeSanTongShun') };
  });

defect('M05+A10', 'P3b', '全带幺在没有副露时恒真，把不足 8 番的牌型误判为可起和（假阳性）',
  '123m234p345s678s + 99s 在无花/事件、和6s且非绝张的条件下，门清点和为门前清2 + 平和2 + 连六1，自摸为不求人4 + 平和2 + 连六1，均不足8；平和不计无字，全带幺不成立。当前API未记录这些上下文',
  { totalFan: 5, isValid: false, hasQuanDaiYao: true },
  () => {
    const hand = [...tiles('123', Suit.Man), ...tiles('234', Suit.Pin), ...tiles('345', Suit.Sou), ...tiles('678', Suit.Sou), ...tiles('99', Suit.Sou)];
    const api = calculateMCRTotalFan(hand, []);
    return { totalFan: api.totalFan, isValid: api.isValid, hasQuanDaiYao: api.patterns.some(p => p.id === 'quanDaiYao') };
  });

defect('P3-建议', 'P3b', 'costToMakeSeq 只看「存在」，123456789m 被重复用于 123/234/345，报出「一色三步高 缺 0 张」',
  '一色三步高需要同花色 123+234+345 共 9 张（1、5 各一张，2、4 各两张，3 三张）；仅 123456789m 时至少还缺 4 张',
  { shanten: 2, missing: 0, probability: 80, fan: 21 },
  () => {
    const hand = [...tiles('123456789', Suit.Man), ...tiles('147', Suit.Pin), ...tiles('19', Suit.Sou)];
    const suggestion = analyzeMCR(hand, [], 'zh', 50).find(s => s.name.includes('一色三步高'));
    return { shanten: calculateShanten(hand, []), missing: suggestion?.missingTiles.length ?? -1, probability: suggestion?.probability ?? -1, fan: suggestion?.fan ?? -1 };
  });

defect('P3-建议', 'P3b', '五门齐用「存在即计一组」估算面子，向听被算成 0',
  '12345m + 123p + 456s + 1z + 5z 的 123/234/345 共用同一批万子，实际向听为 1，不是 0',
  { realShanten: 1, claimedShanten: '向听0', fan: 10 },
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

defect('M05', 'P3b', '平和只看已录吃的数量，四副暗手顺子的平和漏识别',
  '123m456m789p234s + 55s 是四顺子 + 序数将，应有平和 2番',
  { totalFan: 5, hasPingHu: false, hasQuanDaiYao: true },
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

console.log(`\n${passed} 项守卫通过；${defects} 项已确认缺陷（快照断言，非通过项）。`);
console.log('缺陷归属见上述 DEFECT 行：P3a/P3b/P3c = 国标上下文/已知错误/缺失番种；P2 川麻计番四项已修为守卫。');
