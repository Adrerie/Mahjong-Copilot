/**
 * 算法回归基线
 *
 * 只保留必须成立的关键守卫：每个 `test(...)` 失败都代表已确认的规则行为回退，`npm test` 退出码非 0。
 * 未解决问题的清单放在 docs/RESTRUCTURE_PLAN_2026-10-10.md，不再写「当前输出快照」。
 *
 * 规则口径：
 * - 国标：数值番相加、8 番起和；结构成牌与起和资格分开表达。和牌来源、和牌张、末张、门风/圈风、
 *   明暗杠由 `GameState` 记录（winSource / winningTile / lastTile / seatWind / roundWind / Meld.kongKind），
 *   未记录时不计对应番种，只在结果里报「仍缺哪些上下文」。
 * - 国标平和/不求人口径参考 https://www.mindmahjong.com/adobe/20141120CEJ.pdf。
 * - 川麻采用 Hi8 血战到底示例牌桌口径（见 utils/sichuanAnalyzer.ts 的 SICHUAN_RULE）：
 *   平胡 0、对对胡 1、清一色 2、七对 2、带幺九 2、金钩钓 2（含对对胡），每根 +1，
 *   封顶 4 指数番 = 16 倍；自摸/点炮、杠类型、海底等事件未建模，一律不加番。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GameMode, GameState, KongKind, MCRContext, Meld, Suit, Tile, WinSource } from '../types';
import { createTile, INITIAL_WALL_MCR, INITIAL_WALL_SICHUAN, TEXT } from '../constants';
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
  getPatternById,
} from '../utils/mahjongLogic';
import { validateGameState } from '../utils/inputValidation';
import { recognizeSichuanPatterns } from '../utils/sichuanAnalyzer';
import { classifyGlyph, HAND_CENTERS, isScreenshotRatio, REFERENCE_GLYPHS, TILE_OPTIONS } from '../utils/mcrScreenshot';
import { compareHandSnapshots } from '../utils/gameSnapshot';
import {
  decodeEntryState,
  emptyEntryState,
  encodeEntryState,
  parseTileText,
  planImportedState,
  planTextHand,
  planTileAdd,
  withConsistentContext,
} from '../utils/entryEditing';

// ---------- 构造辅助 ----------

const tiles = (digits: string, suit: Suit): Tile[] => [...digits].map(v => createTile(suit, Number(v)));
const pong = (value: number, suit: Suit = Suit.Pin): Meld =>
  ({ id: `pong-${value}${suit}`, type: 'pong', tiles: tiles(`${value}${value}${value}`, suit) });
const gang = (value: number, suit: Suit = Suit.Pin, kongKind?: KongKind): Meld =>
  ({ id: `gang-${value}${suit}`, type: 'gang', tiles: tiles(`${value}${value}${value}${value}`, suit), kongKind });
const chi = (digits: string, suit: Suit): Meld =>
  ({ id: `chi-${digits}${suit}`, type: 'chi', tiles: tiles(digits, suit) });
const state = (hand: Tile[], melds: Meld[] = [], extra: Partial<GameState> = {}): GameState =>
  ({ mode: GameMode.MCR, hand, melds, discards: [], wallCount: 50, voidSuit: null, ...extra });
const sichuan = (hand: Tile[], voidSuit: Suit | null, melds: Meld[] = [], extra: Partial<GameState> = {}): GameState =>
  ({ mode: GameMode.Sichuan, hand, melds, discards: [], wallCount: 50, voidSuit, ...extra });

const effectiveTiles = (hand: Tile[], melds: Meld[]): number => hand.length + melds.length * 3;
const keys = (list: Tile[]): string[] => list.map(t => `${t.value}${t.suit}`);
/** 番种 id -> 叠加次数。winSource 未记录时用 'unknown'，与 UI 默认一致。 */
const patternCounts = (hand: Tile[], melds: Meld[] = [], winSource: WinSource = 'unknown', ctx: MCRContext = {}): Record<string, number> => {
  const counts = new Map<string, number>();
  for (const r of recognizeMCRPatterns(hand, melds, winSource, ctx)) {
    counts.set(r.pattern.id, (counts.get(r.pattern.id) ?? 0) + r.count);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
};
const mcrFan = (hand: Tile[], melds: Meld[] = [], winSource: WinSource = 'unknown', ctx: MCRContext = {}): number =>
  calculateTotalFan(recognizeMCRPatterns(hand, melds, winSource, ctx)).totalFan;
/** 国标起和结果：番种 id 列表（已按不计规则过滤）。 */
const mcrPatternIds = (hand: Tile[], melds: Meld[] = [], winSource: WinSource = 'unknown', ctx: MCRContext = {}): string[] =>
  calculateMCRTotalFan(hand, melds, winSource, ctx).patterns.map(p => p.id);

// ---------- 运行器 ----------

let passed = 0;
let failed = 0;
const test = (name: string, run: () => void) => {
  try {
    run();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${name}: ${String((error as Error).message).split('\n')[0]}`);
  }
};

test('国标截图导入：固定13+摸入位、有限模板可信匹配及未知拒识', () => {
  assert.equal(HAND_CENTERS.length, 14);
  assert.equal(TILE_OPTIONS.length, 34);
  assert.equal(isScreenshotRatio(2048, 1280), true);
  assert.equal(isScreenshotRatio(1536, 960), true);
  assert.equal(isScreenshotRatio(1920, 1080), false);
  for (const [key, descriptors] of Object.entries(REFERENCE_GLYPHS)) {
    for (const descriptor of descriptors) {
      assert.equal(descriptor.length, 192);
      assert.equal(classifyGlyph(descriptor).key, key);
    }
  }
  assert.equal(classifyGlyph('0'.repeat(192)).key, null);
  assert.equal(classifyGlyph('bad').key, null);
  const reviewedUnknownFace = 'f'.repeat(192);
  assert.equal(classifyGlyph(reviewedUnknownFace).key, null);
  assert.equal(classifyGlyph(reviewedUnknownFace, { z7: [reviewedUnknownFace] }).key, 'z7', '本地人工确认模板应被复用');
  // 一份示例中的13张+右侧单独摸入牌：不会以13张误触发弃牌建议。
  const screenHand: Tile[] = [
    ...tiles('1358898', Suit.Man), ...tiles('2', Suit.Sou),
    ...tiles('1146', Suit.Pin), createTile(Suit.Zihai, 1), createTile(Suit.Zihai, 4),
  ];
  assert.equal(screenHand.length, 14);
  const input = state(screenHand);
  assert.deepEqual(validateGameState(input, 'zh'), []);
  assert.ok(analyzeGame(input, 'zh').status !== 'invalid');
  assert.equal(analyzeGame({ ...input, hand: screenHand.slice(0, 13) }, 'zh').bestDiscard, undefined);
});

test('游戏连续截图：只有单次摸牌/打牌变化才允许明确标记，不推断跳帧', () => {
  const base = ['1m', '1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m', '1p', '2p', '3p'];
  const draw = compareHandSnapshots(base, [...base, '9p']);
  assert.deepEqual(draw, { added: ['9p'], removed: [], kind: 'draw' });
  const discard = compareHandSnapshots([...base, '9p'], base);
  assert.deepEqual(discard, { added: [], removed: ['9p'], kind: 'discard' });
  assert.equal(compareHandSnapshots(base, [...base].reverse()).kind, 'unchanged');
  const multi = compareHandSnapshots(base, [...base.slice(0, 11), '7s', '8s']);
  assert.equal(multi.kind, 'ambiguous', '跨多个动作不能推断为单次弃牌');
  assert.deepEqual(compareHandSnapshots(['1m', '1m'], ['1m']).removed, ['1m']);
});

// ============================================================
// 一、输入校验与牌张边界
// ============================================================

test('输入校验：五张同牌、越界牌值、非法副露都在分析前被拒', () => {
  assert.ok(validateGameState(state(tiles('11111', Suit.Man)), 'zh', false).length);
  assert.ok(validateGameState(state([], [{ id: 'bad', type: 'chi', tiles: tiles('124', Suit.Man) }]), 'zh', false).length);
  assert.ok(validateGameState(state([{ id: 'bad-honor', suit: Suit.Zihai, value: 8 }]), 'zh').length);
  assert.ok(validateGameState(state([{ id: 'bad-zero', suit: Suit.Man, value: 0 }]), 'zh').length);
  assert.ok(validateGameState(state([{ id: 'bad-ten', suit: Suit.Pin, value: 10 }]), 'zh').length);

  const illegal: Meld[] = [
    chi('124', Suit.Man),                                                   // 中间断档
    { id: 'span-suit', type: 'chi', tiles: [...tiles('89', Suit.Man), createTile(Suit.Pin, 1)] },
    chi('123', Suit.Zihai),                                                 // 字牌不能吃
    { id: 'mixed-pong', type: 'pong', tiles: [...tiles('55', Suit.Man), createTile(Suit.Pin, 5)] },
    { id: 'short-gang', type: 'gang', tiles: tiles('555', Suit.Pin) },       // 杠必须四张
    { id: 'long-chi', type: 'chi', tiles: tiles('1234', Suit.Man) },
  ];
  for (const meld of illegal) {
    assert.ok(validateGameState(state([], [meld]), 'zh').some(e => e.includes('副露')), `meld ${meld.id} 应被拒`);
  }
  assert.ok(validateGameState(state(tiles('12', Suit.Man), [pong(1), pong(2), pong(3), pong(4), pong(5)]), 'zh')
    .some(e => e.includes('最多4副面子')));
});

test('杠按 3 张等效但保留 4 张实体牌', () => {
  const five = gang(5);
  assert.deepEqual(validateGameState(state([...tiles('123456789', Suit.Man), createTile(Suit.Sou, 1)], [five]), 'zh'), []);
  assert.deepEqual(validateGameState(state([...tiles('123456789', Suit.Man), ...tiles('12', Suit.Sou)], [five]), 'zh'), []);
  assert.equal(effectiveTiles([...tiles('123456789', Suit.Man), ...tiles('12', Suit.Sou)], [five]), 14);
  const fifteen = state([...tiles('123456789', Suit.Man), ...tiles('123', Suit.Sou)], [five]);
  assert.ok(validateGameState(fifteen, 'zh').some(e => e.includes('等效牌数')));
  const fifthCopy = state([...tiles('12345678', Suit.Man), ...tiles('12', Suit.Sou), createTile(Suit.Pin, 5)], [five]);
  assert.ok(validateGameState(fifthCopy, 'zh').some(e => e.includes('每种牌最多4张')));
});

test('向听与待牌：单面听 0 向听、七对向听、第五张不成为待牌', () => {
  const hand = [...tiles('123456789', Suit.Man), ...tiles('1235', Suit.Pin)];
  assert.equal(calculateShanten(hand, []), 0);
  assert.deepEqual(calculateWaitingTiles(hand, []).map(t => `${t.value}${t.suit}`), ['5p']);
  assert.equal(calculateWaitingTiles(tiles('5', Suit.Pin), [pong(1), pong(2), pong(3), pong(5)]).length, 0);
  assert.equal(calculateQiDuiShanten(countsToArray(countTiles([...tiles('11223344', Suit.Man), ...tiles('12345', Suit.Pin)]))), 2);
  // 川麻待牌不包含字牌与定缺花色
  assert.deepEqual(
    calculateWaitingTiles([...tiles('123456789', Suit.Man), ...tiles('1235', Suit.Pin)], [], GameMode.Sichuan, Suit.Sou)
      .map(t => `${t.value}${t.suit}`),
    ['5p'],
  );
});

test('未成牌/听牌/多牌三种暗手形态各自给出正确结论', () => {
  const notReady = analyzeGame(state([...tiles('1234568', Suit.Man), ...tiles('77', Suit.Pin)], [pong(1), pong(9)]), 'zh');
  assert.equal(notReady.isWinning, false);
  assert.equal(notReady.suggestions.length, 0);
  assert.ok(notReady.warnings.length);

  const ready = analyzeGame(state([...tiles('123456', Suit.Man), ...tiles('7', Suit.Pin)], [pong(1), pong(9)]), 'zh');
  assert.equal(ready.isReady, true);
  assert.ok(ready.waitingTiles.some(w => w.tile.value === 7 && w.tile.suit === Suit.Pin));

  const discardable = analyzeGame(state([...tiles('1234568', Suit.Man), ...tiles('7', Suit.Pin)], [pong(1), pong(9)]), 'zh');
  assert.equal(discardable.isWinning, false);
  assert.ok(discardable.bestDiscard);
});

test('国标和四川：13张提示进张、14张推荐打哪张，维持模式分离', () => {
  const mcr13 = state([...tiles('123456', Suit.Man), ...tiles('7', Suit.Pin)], [pong(1), pong(9)]);
  const m13 = analyzeGame(mcr13, 'zh');
  assert.equal(m13.bestDiscard, undefined);
  assert.ok(m13.improvingDraws?.some(x => x.tile.suit === Suit.Pin && x.tile.value === 7 && x.remaining > 0));
  const m14 = analyzeGame(state([...tiles('1234568', Suit.Man), ...tiles('7', Suit.Pin)], [pong(1), pong(9)]), 'zh');
  assert.ok(m14.bestDiscard, '14张国标未和时必须推荐出牌');
  assert.equal(m14.improvingDraws, undefined);

  const sc13 = sichuan([...tiles('123456789', Suit.Man), ...tiles('1235', Suit.Pin)], Suit.Sou);
  const s13 = analyzeGame(sc13, 'zh');
  assert.equal(s13.bestDiscard, undefined);
  assert.ok(s13.improvingDraws?.some(x => x.tile.suit === Suit.Pin && x.tile.value === 5));
  const sc14 = sichuan([...tiles('123456789', Suit.Man), ...tiles('12345', Suit.Pin)], Suit.Sou);
  const s14 = analyzeGame(sc14, 'zh');
  assert.ok(s14.bestDiscard, '14张四川未和时必须推荐出牌');
  assert.equal(s14.improvingDraws, undefined);

  const needsVoid = analyzeGame(sichuan([...tiles('123456789', Suit.Man), ...tiles('1235', Suit.Pin)], Suit.Man), 'zh');
  // 定缺牌仍在手：只给非定缺进张方向，并标注是去除定缺后的计算口径，不冒充可和牌路线。
  assert.ok(needsVoid.improvingDraws?.every(x => x.tile.suit !== Suit.Man), '定缺花色绝不作为进张方向');
  assert.ok(needsVoid.improvingDraws?.some(x => x.tile.suit === Suit.Pin), '仍有定缺牌时也给出非定缺进张方向');
  assert.ok(needsVoid.improvingDrawsNote?.includes('定缺'), '需说明进张按去除定缺后的牌形计算');
});
test('13张已听牌：待牌标记 completesHand 并排最前，未听牌时不冒充待牌', () => {
  // 111m222m333m444m5m 是五面听：2m/3m/4m/5m/6m 都能构成4副+将。
  const tenpai = analyzeGame(state([...tiles('111', Suit.Man), ...tiles('222', Suit.Man), ...tiles('333', Suit.Man), ...tiles('444', Suit.Man), ...tiles('5', Suit.Man)]), 'zh');
  assert.equal(tenpai.isReady, true);
  assert.ok(tenpai.improvingDraws?.length, '听牌时必须列出待牌');
  assert.deepEqual(tenpai.improvingDraws!.filter(x => x.completesHand).map(x => `${x.tile.value}${x.tile.suit}`).sort(), ['2m', '3m', '4m', '5m', '6m'], '待牌必须是真正能成和的牌');
  assert.ok(tenpai.improvingDraws!.every(x => x.completesHand), '该例进张全部是待牌');
  assert.equal(tenpai.improvingDraws![0].completesHand, true, '待牌必须排在最前');

  // 两面听 123m456m789m 55p 67p：待 5p/8p，按未见张数排序。
  const ryanmen = analyzeGame(state([...tiles('123456789', Suit.Man), ...tiles('55', Suit.Pin), ...tiles('67', Suit.Pin)]), 'zh');
  assert.deepEqual(ryanmen.improvingDraws?.map(x => `${x.tile.value}${x.tile.suit}`), ['8p', '5p']);
  assert.ok(ryanmen.improvingDraws?.every(x => x.completesHand === true));

  const thirteenOrphans = analyzeGame(state([
    ...tiles('19', Suit.Man), ...tiles('19', Suit.Pin), ...tiles('19', Suit.Sou), ...tiles('1234567', Suit.Zihai),
  ]), 'zh');
  assert.equal(thirteenOrphans.improvingDraws?.length, 13, '十三幺十三面待牌不能被8条展示上限截断');
  assert.ok(thirteenOrphans.improvingDraws?.every(x => x.completesHand === true));

  // 未听牌：只是改善向听，不得标成待牌。
  const notReady = analyzeGame(state([...tiles('1479', Suit.Man), ...tiles('258', Suit.Pin), ...tiles('369', Suit.Sou), ...tiles('11', Suit.Pin), ...tiles('2', Suit.Sou)]), 'zh');
  assert.equal(notReady.isReady, false);
  assert.ok(notReady.improvingDraws?.every(x => !x.completesHand), '未听牌时不得标记待牌');
});


test('国标：结构已和但8番待核时显示续打备选，不代替8番核验', () => {
  const hand = [...tiles('123456', Suit.Man), ...tiles('123789', Suit.Pin), ...tiles('55', Suit.Sou)];
  const r = analyzeGame(state(hand), 'zh');
  assert.equal(r.isWinning, true);
  assert.equal(r.contextPending, true);
  assert.ok(r.bestDiscard, '结构已和但无法确认起和时需保留继续打的建议：'+JSON.stringify({suggestions:r.suggestions.map(x=>x.patternDetails),warnings:r.warnings}));
  assert.ok(r.warnings.some(w => w.includes('8番未确认')));
});

test('死叫：牌河已见完的待牌不算听牌', () => {
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

test('空局面与非法局面只给警告，不给和牌结论', () => {
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
// 二、录入门槛：文本解析、原子替换、张数上限与局面恢复
// ============================================================

test('文本录入：两种写法等价、坏串给出原因、替换是原子的', () => {
  const expected = [...'33344466699977'].map(d => `${d}s`);
  const letter = parseTileText('33344466699977s', GameMode.Sichuan);
  const chinese = parseTileText('33344466699977条', GameMode.Sichuan);
  assert.equal(letter.outcome, 'parsed');
  assert.equal(chinese.outcome, 'parsed');
  if (letter.outcome !== 'parsed' || chinese.outcome !== 'parsed') return;
  assert.deepEqual(keys(letter.tiles), expected);
  assert.deepEqual(keys(chinese.tiles), expected);

  const mixed = parseTileText('123m456p789s11z', GameMode.MCR);
  assert.equal(mixed.outcome === 'parsed' ? keys(mixed.tiles).join(',') : '', '1m,2m,3m,4p,5p,6p,7s,8s,9s,1z,1z');
  const separated = parseTileText('123m 456p / 789s', GameMode.MCR);
  assert.equal(separated.outcome === 'parsed' ? separated.tiles.length : 0, 9);
  const traditional = parseTileText('123萬456條', GameMode.MCR);
  assert.deepEqual(traditional.outcome === 'parsed' ? keys(traditional.tiles) : [], ['1m', '2m', '3m', '4s', '5s', '6s']);

  for (const text of ['33344466699977x', '123', '0m', '10m', '8z', '11111m', '123456789123456m', '', 'm123']) {
    const parsed = parseTileText(text, GameMode.MCR);
    assert.equal(parsed.outcome, 'rejected', `“${text}” 应被拒绝`);
    assert.ok(parsed.outcome === 'rejected' && parsed.message.zh.length > 0 && parsed.message.en.length > 0);
  }
  assert.equal(parseTileText('11z', GameMode.Sichuan).outcome, 'rejected');
  assert.equal(parseTileText('123m456p789s', GameMode.Sichuan).outcome, 'parsed');

  // 替换失败时不改旧局面；成功时也不改写旧对象，保证一步撤销可信
  const before = state([...tiles('123', Suit.Man)], [], { discards: tiles('9', Suit.Sou) });
  assert.equal(planTextHand(before, '99999p').outcome, 'rejected');
  assert.deepEqual(keys(before.hand), ['1m', '2m', '3m']);
  const applied = planTextHand(before, '33344466699977s');
  assert.equal(applied.outcome, 'applied');
  if (applied.outcome !== 'applied') return;
  assert.deepEqual(keys(applied.state.discards), ['9s']);
  assert.deepEqual(keys(before.hand), ['1m', '2m', '3m']);
  assert.notStrictEqual(applied.state, before);

  // 替换时的四张上限要算上副露与牌河
  const withMeld = state(tiles('12', Suit.Man), [pong(1, Suit.Pin)], { discards: tiles('9', Suit.Sou) });
  assert.equal(planTextHand(withMeld, '1111p').outcome, 'rejected');
  assert.equal(planTextHand(withMeld, '11p').outcome, 'rejected');
  assert.equal(planTextHand(withMeld, '99s').outcome, 'applied');
});

test('加牌：四张上限、14 张等效、四副面子与吃牌跨度', () => {
  const twoCopies = state(tiles('11', Suit.Pin));
  const extraPong = planTileAdd(twoCopies, { zone: 'melds', meldType: 'pong', tile: createTile(Suit.Pin, 1) });
  assert.equal(extraPong.outcome, 'rejected');
  assert.ok(extraPong.outcome === 'rejected' && extraPong.message.zh.includes('已见 2 张'));

  const fourEights = state([...tiles('8888', Suit.Man), ...tiles('123', Suit.Pin)]);
  assert.equal(planTileAdd(fourEights, { zone: 'hand', meldType: 'pong', tile: createTile(Suit.Man, 8) }).outcome, 'rejected');
  assert.equal(planTileAdd(fourEights, { zone: 'melds', meldType: 'chi', tile: createTile(Suit.Man, 7) }).outcome, 'rejected');
  const riverHeld = state(tiles('11', Suit.Pin), [], { discards: tiles('11', Suit.Pin) });
  assert.equal(planTileAdd(riverHeld, { zone: 'hand', meldType: 'pong', tile: createTile(Suit.Pin, 1) }).outcome, 'rejected');

  const full = state([...tiles('123456789', Suit.Man), ...tiles('12345', Suit.Pin)]);
  const handFull = planTileAdd(full, { zone: 'hand', meldType: 'pong', tile: createTile(Suit.Sou, 5) });
  assert.equal(handFull.outcome, 'rejected');
  assert.ok(handFull.outcome === 'rejected' && handFull.message.zh.includes('手牌已满'));

  const withMelds = state(tiles('12', Suit.Man), [chi('123', Suit.Man), chi('234', Suit.Pin), chi('345', Suit.Sou)]);
  assert.equal(effectiveTiles(withMelds.hand, withMelds.melds), 11);
  const fourth = planTileAdd(withMelds, { zone: 'melds', meldType: 'pong', tile: createTile(Suit.Pin, 9) });
  assert.equal(fourth.outcome, 'applied');
  const fourMelds = fourth.outcome === 'applied' ? fourth.state : withMelds;
  assert.equal(effectiveTiles(fourMelds.hand, fourMelds.melds), 14);
  assert.equal(planTileAdd(fourMelds, { zone: 'melds', meldType: 'pong', tile: createTile(Suit.Sou, 9) }).outcome, 'rejected');

  const short = state(tiles('12', Suit.Man));
  assert.equal(planTileAdd(short, { zone: 'melds', meldType: 'chi', tile: createTile(Suit.Man, 8) }).outcome, 'rejected');
  assert.equal(planTileAdd(short, { zone: 'melds', meldType: 'chi', tile: createTile(Suit.Man, 7) }).outcome, 'applied');

  // 杠类型默认「未记录」：不传 kongKind 就不写类型，用户主动选了才记录
  const gangHand = state(tiles('123', Suit.Man));
  const defaultGang = planTileAdd(gangHand, { zone: 'melds', meldType: 'gang', tile: createTile(Suit.Man, 9) });
  assert.equal(defaultGang.outcome, 'applied');
  assert.equal(defaultGang.outcome === 'applied' ? defaultGang.state.melds[0].kongKind : 'x', undefined);
  const typedGang = planTileAdd(gangHand, { zone: 'melds', meldType: 'gang', tile: createTile(Suit.Man, 9), kongKind: 'concealed' });
  assert.equal(typedGang.outcome === 'applied' ? typedGang.state.melds[0].kongKind : 'x', 'concealed');
  // 未记录类型的杠仍然参与结构，但会作为缺口提示，不自动计明杠/暗杠
  const gangWin = [...tiles('123456789', Suit.Man), ...tiles('55', Suit.Sou)];
  const gangCtx = { seatWind: 1 as const, roundWind: 1 as const, lastTile: false, afterKong: false };
  const unknownGang = calculateMCRTotalFan(gangWin, [gang(1)], 'claim', gangCtx);
  assert.ok(unknownGang.structuralWin);
  assert.ok(unknownGang.missingContext.includes('kongType'));
  assert.ok(!unknownGang.patterns.some(p => p.id === 'mingGang' || p.id === 'anGang'));
  assert.ok(!calculateMCRTotalFan(gangWin, [gang(1, Suit.Pin, 'concealed')], 'claim', gangCtx).missingContext.includes('kongType'));
});

test('川麻录入拒绝字牌与吃，三门花色可录入但不能和牌', () => {
  const hand = sichuan(tiles('123', Suit.Man), Suit.Sou);
  assert.equal(planTileAdd(hand, { zone: 'hand', meldType: 'pong', tile: createTile(Suit.Zihai, 1) }).outcome, 'rejected');
  assert.equal(planTileAdd(hand, { zone: 'melds', meldType: 'chi', tile: createTile(Suit.Man, 1) }).outcome, 'rejected');
  assert.equal(planTileAdd(hand, { zone: 'hand', meldType: 'pong', tile: createTile(Suit.Man, 4) }).outcome, 'applied');

  const result = planTextHand(sichuan([], Suit.Sou), '123789m12355p123s');
  assert.equal(result.outcome, 'applied');
  if (result.outcome !== 'applied') return;
  assert.deepEqual(validateGameState(result.state, 'zh'), []);
  assert.equal(checkWinning(countsToArray(countTiles(result.state.hand)), 0, GameMode.Sichuan), true);
  const analysis = analyzeGame(result.state, 'zh');
  assert.equal(analysis.isWinning, false);
  assert.ok(analysis.warnings.some(w => w.includes('定缺')));
});

test('局面恢复：按玩法往返，含墙数/定缺/和牌方式；损坏数据整局丢弃', () => {
  const saved = state([...tiles('123', Suit.Man)], [pong(5, Suit.Pin)], {
    discards: tiles('9', Suit.Sou), wallCount: 61, winSource: 'selfDraw',
  });
  const restored = decodeEntryState(encodeEntryState(saved), GameMode.MCR);
  assert.ok(restored);
  assert.deepEqual(keys(restored.hand), ['1m', '2m', '3m']);
  assert.deepEqual(keys(restored.discards), ['9s']);
  assert.equal(restored.wallCount, 61);
  assert.equal(restored.melds.length, 1);
  assert.equal(restored.winSource, 'selfDraw');
  // 恢复出的副露 id 不得与新增副露冲突（删除新增副露时必须保留恢复的副露）
  const added = planTileAdd(restored, { zone: 'melds', meldType: 'pong', tile: createTile(Suit.Pin, 2) });
  assert.equal(added.outcome, 'applied');
  if (added.outcome !== 'applied') return;
  assert.equal(new Set(added.state.melds.map(m => m.id)).size, 2);
  assert.equal(added.state.melds.some(m => m.id === restored.melds[0].id), true);

  // 11 张的录入中间态也要能恢复；川麻定缺与墙数一并恢复
  const partial = state([...tiles('123', Suit.Man), ...tiles('456', Suit.Pin), ...tiles('789', Suit.Sou), ...tiles('11', Suit.Zihai)]);
  assert.equal(decodeEntryState(encodeEntryState(partial), GameMode.MCR)?.hand.length, 11);
  const sichuanRestored = decodeEntryState(encodeEntryState(sichuan(tiles('123456', Suit.Man), Suit.Pin, [], { wallCount: 40 })), GameMode.Sichuan);
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
  assert.equal(decodeEntryState(wrap({ ...saved, winSource: 'tianHu' }), GameMode.MCR), null, '和牌方式只接受三个合法值');
  assert.equal(decodeEntryState(wrap({ ...saved, hand: [
    { ...createTile(Suit.Man, 1), id: 'same' }, { ...createTile(Suit.Man, 2), id: 'same' },
  ] }), GameMode.MCR), null);
  assert.equal(decodeEntryState(wrap({ ...saved, melds: [
    { ...pong(1), id: 'meld-same' }, { ...pong(2), id: 'meld-same' },
  ] }), GameMode.MCR), null);

  // 和牌上下文一并往返；和牌张必须真的在暗手里，否则只丢和牌张，其余局面保留
  const context = state([...tiles('123456789', Suit.Man), ...tiles('456', Suit.Pin), ...tiles('55', Suit.Sou)], [], {
    discards: tiles('9', Suit.Sou), winSource: 'selfDraw', seatWind: 1, roundWind: 4, lastTile: true,
  });
  const winning = context.hand[context.hand.length - 1];
  assert.ok(winning);
  const contextRestored = decodeEntryState(encodeEntryState({ ...context, winningTile: winning }), GameMode.MCR);
  assert.equal(contextRestored?.winningTile?.value, winning.value);
  assert.equal(contextRestored?.seatWind, 1);
  assert.equal(contextRestored?.roundWind, 4);
  assert.equal(contextRestored?.lastTile, true);
  const stale = decodeEntryState(encodeEntryState({ ...context, winningTile: createTile(Suit.Sou, 9) }), GameMode.MCR);
  assert.equal(stale?.winningTile, null, '和牌张不在暗手里时按未记录处理');
  assert.equal(stale?.hand.length, 14);
  for (const bad of [{ seatWind: 9 }, { roundWind: 0 }, { lastTile: 'yes' }, { winningTile: { id: 'x', suit: Suit.Man, value: 10 } }]) {
    assert.equal(decodeEntryState(wrap({ ...context, ...bad }), GameMode.MCR), null, `${JSON.stringify(bad)} 必须整局丢弃`);
  }
  // 杠类型只接受明/暗/补三种
  assert.equal(decodeEntryState(wrap({ ...saved, melds: [{ ...gang(1), kongKind: 'exposed' }] }), GameMode.MCR)?.melds[0].kongKind, 'exposed');
  assert.equal(decodeEntryState(wrap({ ...saved, melds: [{ ...gang(1), kongKind: 'mixed' }] }), GameMode.MCR), null);
  assert.equal(decodeEntryState(wrap({ ...saved, melds: [{ ...pong(1), kongKind: 'exposed' }] }), GameMode.MCR), null);
});

// ============================================================
// 三、四川血战计番（P2）：指数番与封顶倍数，不回退
// ============================================================

test('川麻：清一色对对胡=3 指数番=8 倍，根在封顶前加', () => {
  const flushPungs = sichuan(tiles('33344466699977', Suit.Sou), Suit.Man);
  assert.deepEqual(validateGameState(flushPungs, 'zh'), []);
  const score = recognizeSichuanPatterns(flushPungs.hand, flushPungs.melds, 'zh');
  assert.deepEqual(score.patterns, [{ id: 'qingYiSe', exponent: 2 }, { id: 'duiDuiHu', exponent: 1 }]);
  assert.equal(score.label, '清对');
  assert.equal(score.roots, 0);
  assert.equal(score.cappedExponent, 3);
  assert.equal(score.multiplier, 8);
  const result = analyzeGame(flushPungs, 'zh');
  assert.equal(result.isWinning, true);
  assert.equal(result.suggestions[0]?.scoreText, '3 指数番 · 8 倍');
  assert.ok(!result.suggestions[0]?.patternDetails.some(d => d.includes('6番') || d.includes('64')), '清对不得再报 6 番/64 倍');

  // 杠 9m 本身算一根：3+1=4 仍到封顶，倍率随根增大
  const withRoot = sichuan([...tiles('111222333', Suit.Man), ...tiles('55', Suit.Man)], Suit.Sou, [gang(9, Suit.Man)]);
  assert.deepEqual(validateGameState(withRoot, 'zh'), []);
  const rooted = recognizeSichuanPatterns(withRoot.hand, withRoot.melds, 'zh');
  assert.deepEqual(rooted.patterns, [{ id: 'qingYiSe', exponent: 2 }, { id: 'duiDuiHu', exponent: 1 }]);
  assert.equal(rooted.roots, 1);
  assert.equal(rooted.uncappedExponent, 4);
  assert.equal(rooted.multiplier, 16);
});

test('川麻：明碰不当暗刻，带幺九要在自己的拆分里成立', () => {
  // 碰 111p、碰 999p + 暗手 123456m + 77p：两顺两刻，只有基本和
  const exposedHand = [...tiles('123456', Suit.Man), ...tiles('77', Suit.Pin)];
  const exposed = sichuan(exposedHand, Suit.Sou, [pong(1), pong(9)]);
  assert.deepEqual(validateGameState(exposed, 'zh'), []);
  const score = recognizeSichuanPatterns(exposedHand, [pong(1), pong(9)], 'zh');
  assert.deepEqual(score.patterns, [{ id: 'pingHu', exponent: 0 }]);
  assert.equal(score.multiplier, 1);
  assert.equal(analyzeGame(exposed, 'zh').suggestions[0]?.name, '成牌（基本和，参考计番）');
  // 对照：暗手两刻 + 将才是对对胡
  const tripletHand = [...tiles('555', Suit.Man), ...tiles('777', Suit.Man), ...tiles('33', Suit.Man)];
  assert.deepEqual(recognizeSichuanPatterns(tripletHand, [pong(1), pong(9)], 'zh').patterns, [{ id: 'duiDuiHu', exponent: 1 }]);
  // 副露已占的牌不得在暗手重复出现
  assert.ok(validateGameState(sichuan([...tiles('111', Suit.Pin), ...tiles('123456', Suit.Man)], Suit.Sou, [pong(1)]), 'zh').length > 0);

  // 带幺九：四副顺子与将都含幺九才成立
  const terminals = [...tiles('12378911', Suit.Man), ...tiles('123789', Suit.Pin)];
  assert.deepEqual(validateGameState(sichuan(terminals, Suit.Sou), 'zh'), []);
  const terminalsScore = recognizeSichuanPatterns(terminals, [], 'zh');
  assert.deepEqual(terminalsScore.patterns, [{ id: 'daiYaoJiu', exponent: 2 }]);
  assert.equal(analyzeGame(sichuan(terminals, Suit.Sou), 'zh').suggestions[0]?.scoreText, '2 指数番 · 4 倍');
  // 将牌 55m 不含幺九 → 只有基本和
  const middlePair = [...tiles('12378955', Suit.Man), ...tiles('123789', Suit.Pin)];
  assert.deepEqual(recognizeSichuanPatterns(middlePair, [], 'zh').patterns, [{ id: 'pingHu', exponent: 0 }]);
  // 牌面有 9 不等于能拆出带幺九
  const middleChows = [...tiles('23456799', Suit.Man), ...tiles('234567', Suit.Pin)];
  assert.equal(checkWinning(countsToArray(countTiles(middleChows)), 0, GameMode.Sichuan), true);
  assert.deepEqual(recognizeSichuanPatterns(middleChows, [], 'zh').patterns, [{ id: 'pingHu', exponent: 0 }]);
});

test('川麻七对：四张同牌按两对计、根单算，且不与别的拆分混用', () => {
  const hand = tiles('11114444777799', Suit.Sou);
  assert.deepEqual(validateGameState(sichuan(hand, Suit.Man), 'zh'), []);
  const score = recognizeSichuanPatterns(hand, [], 'zh');
  assert.deepEqual(score.patterns, [{ id: 'qingYiSe', exponent: 2 }, { id: 'qiDui', exponent: 2 }]);
  assert.equal(score.label, '清龙七对');
  assert.equal(score.roots, 3);
  assert.equal(score.uncappedExponent, 7);
  assert.equal(score.cappedExponent, 4);
  assert.equal(score.multiplier, 16);
  const plain = recognizeSichuanPatterns(tiles('11223344556677', Suit.Sou), [], 'zh');
  assert.equal(plain.label, '清七对');
  assert.equal(plain.roots, 0);
  assert.equal(plain.multiplier, 16);
  // 顺刻混合时不算七对，根仍单算
  const mixed = [...tiles('111123', Suit.Sou), ...tiles('45678999', Suit.Man)];
  assert.equal(checkWinning(countsToArray(countTiles(mixed)), 0, GameMode.Sichuan), true);
  const mixedScore = recognizeSichuanPatterns(mixed, [], 'zh');
  assert.deepEqual(mixedScore.patterns, [{ id: 'pingHu', exponent: 0 }]);
  assert.equal(mixedScore.roots, 1);

  // 11112233778899s 可拆七对也可拆 123/123/789/789/11：只能择一，不得相加
  const either = tiles('11112233778899', Suit.Sou);
  const eitherScore = recognizeSichuanPatterns(either, [], 'zh');
  assert.deepEqual(eitherScore.patterns, [{ id: 'qingYiSe', exponent: 2 }, { id: 'qiDui', exponent: 2 }]);
  assert.equal(eitherScore.roots, 1);
  assert.equal(eitherScore.uncappedExponent, 5);
  // 111222333m99911p：刻子拆分是对对胡 1，顺子拆分是带幺九 2 → 取较高者 2，不是 1+2
  const twoSplits = [...tiles('111222333', Suit.Man), ...tiles('99911', Suit.Pin)];
  const twoSplitsScore = recognizeSichuanPatterns(twoSplits, [], 'zh');
  assert.deepEqual(twoSplitsScore.patterns, [{ id: 'daiYaoJiu', exponent: 2 }]);
  assert.equal(twoSplitsScore.baseExponent, 2);
  assert.equal(twoSplitsScore.multiplier, 4);
  assert.ok(!twoSplitsScore.details.some(d => d.includes('对对胡') || d.includes('待核')));
  // 七对的七个对子全为幺九时，带幺九与七对同时成立
  const terminalPairs = [...tiles('11119999', Suit.Man), ...tiles('111199', Suit.Pin)];
  const terminalScore = recognizeSichuanPatterns(terminalPairs, [], 'zh');
  assert.deepEqual(terminalScore.patterns, [{ id: 'qiDui', exponent: 2 }, { id: 'daiYaoJiu', exponent: 2 }]);
  assert.equal(terminalScore.uncappedExponent, 7);
});

test('川麻：边界读法与封顶，未建模事件不加番', () => {
  // 四副幺九刻但将 55m 不含幺九 → 对对胡 1，不补带幺九
  const pongHand = [...tiles('11199955', Suit.Man), ...tiles('111999', Suit.Pin)];
  assert.deepEqual(validateGameState(sichuan(pongHand, Suit.Sou), 'zh'), []);
  assert.equal(checkWinning(countsToArray(countTiles(pongHand)), 0, GameMode.Sichuan), true);
  const pongScore = recognizeSichuanPatterns(pongHand, [], 'zh');
  assert.deepEqual(pongScore.patterns, [{ id: 'duiDuiHu', exponent: 1 }]);
  assert.equal(pongScore.multiplier, 2);
  // 111222333m99977p：刻子拆分是对对胡，顺子拆分无番型 → 取刻子拆分
  const mixedScore = recognizeSichuanPatterns([...tiles('111222333', Suit.Man), ...tiles('99977', Suit.Pin)], [], 'zh');
  assert.deepEqual(mixedScore.patterns, [{ id: 'duiDuiHu', exponent: 1 }]);
  // 金钩钓（四副明碰 + 单钓将）含对对胡但不双计
  const jinGou = recognizeSichuanPatterns(tiles('55', Suit.Pin), [pong(1, Suit.Man), pong(2, Suit.Man), pong(3, Suit.Man), pong(9)], 'zh');
  assert.deepEqual(jinGou.patterns, [{ id: 'jinGouDiao', exponent: 2 }]);
  assert.equal(jinGou.multiplier, 4);
  // 七对与对对胡互斥
  const qiDuiScore = recognizeSichuanPatterns(tiles('11114444777799', Suit.Sou), [], 'zh');
  assert.ok(qiDuiScore.patterns.some(hit => hit.id === 'qiDui'));
  assert.ok(!qiDuiScore.patterns.some(hit => hit.id === 'duiDuiHu'));

  // 清一色 2 + 带幺九 2 + 根 ×2 = 6 → 封顶 4 = 16 倍（不是 2^6 = 64）
  const cappedHand = tiles('11112377889999', Suit.Sou);
  assert.deepEqual(validateGameState(sichuan(cappedHand, Suit.Man), 'zh'), []);
  const capped = recognizeSichuanPatterns(cappedHand, [], 'zh');
  assert.deepEqual(capped.patterns, [{ id: 'qingYiSe', exponent: 2 }, { id: 'daiYaoJiu', exponent: 2 }]);
  assert.equal(capped.roots, 2);
  assert.equal(capped.uncappedExponent, 6);
  assert.equal(capped.cappedExponent, 4);
  assert.equal(capped.multiplier, 16);
  assert.equal(capped.ruleId, 'hi8-blood-battle');
  assert.equal(capped.ruleSource, 'https://hi8.com/g/sichuanmajiang');
  assert.equal(capped.uncappedExponent, capped.patterns.reduce((sum, p) => sum + p.exponent, 0) + capped.roots);
  assert.deepEqual(capped.pendingContext, TEXT.zh.pendingEvents);
  // 四川同一 Hi8 口径：普通自摸不是额外番；明确特殊事件+1指数番，再封顶。
  const ordinary = recognizeSichuanPatterns(pongHand, [], 'zh', { winSource: 'selfDraw', winEvent: 'ordinary' });
  const lastDraw = recognizeSichuanPatterns(pongHand, [], 'zh', { winSource: 'selfDraw', winEvent: 'lastDraw' });
  const lastDiscard = recognizeSichuanPatterns(pongHand, [], 'zh', { winSource: 'claim', winEvent: 'lastDiscard' });
  const kongDiscard = recognizeSichuanPatterns(pongHand, [], 'zh', { winSource: 'claim', winEvent: 'kongDiscard' });
  const robbing = recognizeSichuanPatterns(pongHand, [], 'zh', { winSource: 'claim', winEvent: 'robbingKong' });
  assert.equal(ordinary.multiplier, 2);
  for (const score of [lastDraw, lastDiscard, kongDiscard, robbing]) {
    assert.equal(score.eventExponent, 1);
    assert.equal(score.multiplier, 4);
  }
  assert.equal(recognizeSichuanPatterns(pongHand, [], 'zh', { winSource: 'claim', winEvent: 'lastDraw' }).eventExponent, 0);
  assert.equal(recognizeSichuanPatterns(pongHand, [], 'zh', { winSource: 'selfDraw', winEvent: 'kongBloom' }).eventExponent, 0);
  // 海底事件必须有「最后一张」这个事实：牌墙还有牌时不加事件番，牌墙见底才加。
  const lastDrawWallLeft = recognizeSichuanPatterns(pongHand, [], 'zh', { winSource: 'selfDraw', winEvent: 'lastDraw', wallCount: 50 });
  assert.equal(lastDrawWallLeft.eventExponent, 0);
  assert.equal(lastDrawWallLeft.cappedExponent, 1);
  assert.ok(lastDrawWallLeft.details.some(d => d.includes('不是最后一张')));
  assert.equal(recognizeSichuanPatterns(pongHand, [], 'zh', { winSource: 'selfDraw', winEvent: 'lastDraw', wallCount: 1 }).eventExponent, 1);
  assert.equal(recognizeSichuanPatterns(pongHand, [], 'zh', { winSource: 'claim', winEvent: 'lastDiscard', wallCount: 0 }).eventExponent, 1);
  const wallLeftState = sichuan(pongHand, Suit.Sou, [], { winSource: 'selfDraw', sichuanWinEvent: 'lastDraw', wallCount: 50 });
  assert.equal(analyzeGame(wallLeftState, 'zh').suggestions[0]?.scoreText, '1 指数番 · 2 倍');
  const wallLastState = sichuan(pongHand, Suit.Sou, [], { winSource: 'selfDraw', sichuanWinEvent: 'lastDraw', wallCount: 1 });
  assert.equal(analyzeGame(wallLastState, 'zh').suggestions[0]?.scoreText, '2 指数番 · 4 倍');
  const withOwnKong = recognizeSichuanPatterns(
    [...tiles('11122233355', Suit.Man)], [gang(9, Suit.Man)], 'zh',
    { winSource: 'selfDraw', winEvent: 'kongBloom' },
  );
  assert.equal(withOwnKong.eventExponent, 1);
  assert.equal(withOwnKong.cappedExponent, 4);
  const ownKongState = sichuan([...tiles('11122233355', Suit.Man)], Suit.Sou,
    [gang(9, Suit.Man)], { winSource: 'selfDraw', sichuanWinEvent: 'kongBloom' });
  assert.equal(withConsistentContext({ ...ownKongState, melds: [] }).sichuanWinEvent, null);
  const eventState = sichuan(pongHand, Suit.Sou, [], { winSource: 'claim', sichuanWinEvent: 'robbingKong' });
  assert.deepEqual(validateGameState(eventState, 'zh'), []);
  assert.equal(decodeEntryState(encodeEntryState(eventState), GameMode.Sichuan)?.sichuanWinEvent, 'robbingKong');
  assert.equal(analyzeGame(eventState, 'zh').suggestions[0]?.scoreText, '2 指数番 · 4 倍');
  // 番型明细不泄露缺失上下文或结算诊断；内部限制仍保留。
  for (const lang of ['zh', 'en'] as const) {
    const details = analyzeGame(eventState, lang).suggestions[0]?.patternDetails ?? [];
    assert.ok(details.includes(lang === 'zh' ? '点炮' : 'Claim'));
    assert.ok(!details.some(d => /未记录|未结算|还需要|unknown|excluded|would need/i.test(d)));
    assert.ok(recognizeSichuanPatterns(pongHand, [], lang, { winSource: 'claim', winEvent: 'robbingKong' }).pendingContext);
  }
  assert.ok(validateGameState({ ...eventState, winSource: 'selfDraw' }, 'zh').length > 0);
  assert.ok(validateGameState({ ...eventState, sichuanWinEvent: 'kongBloom' }, 'zh').length > 0);
  // 国标路径不受影响：仍按番数显示，不出现指数番文本
  const mcr = analyzeGame(state([...tiles('111123', Suit.Sou), ...tiles('45678999', Suit.Man)]), 'zh');
  assert.equal(mcr.isWinning, true);
  assert.equal(mcr.suggestions[0]?.scoreText, undefined);
});

test('川麻建议：只报缺牌与番型，不给臆造概率', () => {
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
  const flowerPig = analyzeGame(sichuan(tiles('33344466699977', Suit.Sou), Suit.Sou), 'zh');
  assert.equal(flowerPig.isWinning, false);
  assert.equal(flowerPig.suggestions[0]?.name, '花猪');
  assert.equal(flowerPig.suggestions[0]?.probability, 0);
  assert.equal(flowerPig.suggestions[0]?.scoreText, '无法和牌');
});

// ============================================================
// 四、国标：结构成牌、8 番起和与和牌来源
// ============================================================

test('定缺未清或三门花色时川麻不能和牌', () => {
  const hand = [...tiles('123789', Suit.Man), ...tiles('12355', Suit.Pin), ...tiles('123', Suit.Sou)];
  assert.deepEqual(validateGameState(sichuan(hand, Suit.Sou), 'zh'), []);
  assert.equal(checkWinning(countsToArray(countTiles(hand)), 0, GameMode.Sichuan), true);
  const threeSuits = analyzeGame(sichuan(hand, Suit.Sou), 'zh');
  assert.equal(threeSuits.isWinning, false);
  assert.ok(threeSuits.warnings.some(w => w.includes('定缺')));
  const noVoid = analyzeGame(sichuan(tiles('33344466699977', Suit.Sou), null), 'zh');
  assert.equal(noVoid.isWinning, false);
  assert.ok(noVoid.warnings.some(w => w.includes('定缺')));
});

test('国标：结构成牌与 8 番起和分开，空输入不得声明起和', () => {
  for (const hand of [[], tiles('2', Suit.Sou)]) {
    const result = calculateMCRTotalFan(hand, []);
    assert.equal(result.totalFan, 0);
    assert.equal(result.isValid, false);
    assert.equal(result.structuralWin, false);
  }
  // 明吃234m/345m/567p + 暗手789s55m：非门清，且没有三色三步高，已知番不足8。
  const hand = [...tiles('789', Suit.Sou), ...tiles('55', Suit.Man)];
  const melds = [chi('234', Suit.Man), chi('345', Suit.Man), chi('567', Suit.Pin)];
  assert.deepEqual(validateGameState(state(hand, melds), 'zh'), []);
  assert.equal(checkWinning(countsToArray(countTiles(hand)), melds.length), true);
  const api = calculateMCRTotalFan(hand, melds);
  assert.equal(api.structuralWin, true);
  assert.ok(api.totalFan < 8);
  assert.equal(api.isValid, false);
  const result = analyzeGame(state(hand, melds), 'zh');
  assert.equal(result.isWinning, true);
  assert.equal(result.isReady, false);

  // 无番和8：明吃789m + 234m 345p 678s 中中，点和 4m（两面听）。
  // 除花牌外确实没有任何番种时才能计；来源未记录时可能还有自摸/门前清，不能判定无番。
  const noFanHand = [...tiles('234', Suit.Man), ...tiles('345', Suit.Pin), ...tiles('678', Suit.Sou), ...tiles('77', Suit.Zihai)];
  const noFanMelds = [chi('789', Suit.Man)];
  const full = { winningTile: createTile(Suit.Man, 4), seatWind: 1 as const, roundWind: 1 as const, lastTile: false, afterKong: false };
  const noFan = calculateMCRTotalFan(noFanHand, noFanMelds, 'claim', full);
  assert.deepEqual(noFan.patterns.map(p => p.id), ['wuFanHu']);
  assert.equal(noFan.confirmedFan, 8);
  assert.equal(noFan.eligibility, 'met');
  const incompleteContext = calculateMCRTotalFan(noFanHand, noFanMelds, 'claim', { ...full, winningTile: null });
  assert.ok(!incompleteContext.patterns.some(p => p.id === 'wuFanHu'));
  assert.equal(incompleteContext.isValid, false);
  const noFanUnknown = calculateMCRTotalFan(noFanHand, noFanMelds, 'unknown', full);
  assert.equal(noFanUnknown.patterns.some(p => p.id === 'wuFanHu'), false);
  assert.equal(noFanUnknown.confirmedFan, 0);
  assert.equal(noFanUnknown.eligibility, 'unverified');
  // 自摸本身是番种，同一手牌不能既是自摸又是无番和
  const noFanDraw = calculateMCRTotalFan(noFanHand, noFanMelds, 'selfDraw', full);
  assert.equal(noFanDraw.patterns.some(p => p.id === 'wuFanHu'), false);
  assert.equal(noFanDraw.confirmedFan, 1);
});

test('国标：和牌来源未记录时不计 不求人/门前清/自摸', () => {
  // 234m/345m/567p/456s/55m：还成立 345m/456s/567p 三色三步高6，
  // 本测试只确认自摸/点和分别额外计4/2，不能锁定旧错误总番。
  const hand = [...tiles('234', Suit.Man), ...tiles('345', Suit.Man), ...tiles('567', Suit.Pin), ...tiles('456', Suit.Sou), ...tiles('55', Suit.Man)];
  assert.equal(checkWinning(countsToArray(countTiles(hand)), 0), true);
  const unknown = calculateMCRTotalFan(hand, []);
  assert.ok(unknown.patterns.some(p => p.id === 'sanSeSanBuGao'));
  assert.equal(unknown.eligibility, 'met');
  assert.equal(unknown.isValid, true);
  assert.equal(unknown.maxPossibleFan, unknown.confirmedFan + 4);
  assert.ok(unknown.missingContext.includes('winSource'));
  assert.deepEqual(patternCounts(hand, [], 'unknown').buQiuRen, undefined);
  assert.deepEqual(patternCounts(hand, [], 'unknown').menQianQing, undefined);
  assert.deepEqual(patternCounts(hand, [], 'unknown').ziMo, undefined);

  const selfDraw = calculateMCRTotalFan(hand, [], 'selfDraw');
  assert.equal(selfDraw.confirmedFan, unknown.confirmedFan + 4);
  assert.equal(selfDraw.eligibility, 'met');
  assert.equal(selfDraw.isValid, true);
  assert.equal(patternCounts(hand, [], 'selfDraw').buQiuRen, 1);
  assert.equal(patternCounts(hand, [], 'selfDraw').ziMo, 1);
  assert.equal(patternCounts(hand, [], 'selfDraw').menQianQing, undefined);

  const claim = calculateMCRTotalFan(hand, [], 'claim');
  assert.equal(claim.confirmedFan, unknown.confirmedFan + 2);
  assert.equal(claim.eligibility, 'met');
  assert.equal(patternCounts(hand, [], 'claim').menQianQing, 1);
  assert.equal(patternCounts(hand, [], 'claim').buQiuRen, undefined);

  // 有副露时同样只在记录来源后计自摸
  const melds = [pong(1), pong(2), pong(3), pong(4)];
  const openHand = [...tiles('11', Suit.Man)];
  assert.equal(checkWinning(countsToArray(countTiles(openHand)), melds.length), true);
  assert.equal(patternCounts(openHand, melds, 'unknown').ziMo, undefined);
  assert.equal(patternCounts(openHand, melds, 'selfDraw').ziMo, 1);
  assert.equal(patternCounts(openHand, melds, 'selfDraw').buQiuRen, undefined);
});

test('国标：事件上下文缺失时只报「仍缺什么」，可确认番不足 8 即不足', () => {
  // 123m456m789p234s55z：连六 1 番；自摸最多 5 番，点和最多 3 番，都不足 8
  const hand = [...tiles('123', Suit.Man), ...tiles('456', Suit.Man), ...tiles('789', Suit.Pin), ...tiles('234', Suit.Sou), ...tiles('55', Suit.Zihai)];
  const unknown = calculateMCRTotalFan(hand, []);
  assert.equal(unknown.confirmedFan, 1);
  assert.equal(unknown.maxPossibleFan, 5);
  assert.equal(unknown.eligibility, 'unverified');
  assert.deepEqual(unknown.missingContext, ['winSource', 'winningTile', 'lastTile', 'afterKong', 'seatWind']);
  const result = analyzeGame(state(hand), 'zh');
  assert.equal(result.isWinning, true);
  const details = result.suggestions[0]?.patternDetails.join('\n') ?? '';
  assert.ok(details.includes('8 番起和待核'));
  assert.ok(details.includes('和牌张'));
  assert.ok(result.warnings.some(w => w.includes('和牌来源未知')));
  // 仍有未记录事实时界面标「待核」
  assert.equal(result.contextPending, true);

  // 记录全部上下文后不再有「待核」，不足 8 番才敢判 unmet
  const full = calculateMCRTotalFan(hand, [], 'selfDraw', {
    winningTile: hand[hand.length - 1], seatWind: 1, roundWind: 1, lastTile: false, afterKong: false,
  });
  assert.deepEqual(full.missingContext, []);
  assert.equal(full.eligibility, 'unmet');
  // 普通和牌（杠后=否）+ 全部上下文：不再待核，标参考计番
  const recorded = analyzeGame(state(hand, [], {
    winSource: 'selfDraw', winningTile: hand[hand.length - 1], seatWind: 1, roundWind: 1, lastTile: false, afterKong: false,
  }), 'zh');
  assert.equal(recorded.contextPending, false);
  assert.ok((recorded.suggestions[0]?.patternDetails.join('\n') ?? '').includes('不足 8 番起和'));
});

// ============================================================
// 五、国标：特殊结构（不可回退）
// ============================================================

test('国标特殊结构：七星不靠/全不靠/组合龙都能成牌', () => {
  // 七星不靠：七种字牌 + 三种花色各一张
  const sevenStars = [...tiles('147', Suit.Man), ...tiles('258', Suit.Pin), createTile(Suit.Sou, 3), ...tiles('1234567', Suit.Zihai)];
  assert.equal(sevenStars.length, 14);
  assert.equal(checkWinning(countsToArray(countTiles(sevenStars)), 0), true);
  const sevenStarsApi = calculateMCRTotalFan(sevenStars, []);
  assert.equal(sevenStarsApi.totalFan, 24);
  assert.deepEqual(sevenStarsApi.patterns.map(p => p.id), ['qiXingBuKao']);
  assert.equal(sevenStarsApi.isValid, true);
  // 特殊结构已听牌时必须报0向听，不能用标准型公式报6向听。
  const sevenStarsReady = sevenStars.filter(t => !(t.suit === Suit.Zihai && t.value === 7));
  assert.equal(calculateShanten(sevenStarsReady, [], GameMode.MCR), 0);
  assert.ok(calculateWaitingTiles(sevenStarsReady, [], GameMode.MCR).some(t => t.suit === Suit.Zihai && t.value === 7));

  // 全不靠 + 组合龙：12 + 12 = 24（组合龙声明另计的组合龙；全不靠不计五门齐）
  const lesser = [...tiles('147', Suit.Man), ...tiles('258', Suit.Pin), ...tiles('369', Suit.Sou), ...tiles('12345', Suit.Zihai)];
  assert.equal(checkWinning(countsToArray(countTiles(lesser)), 0), true);
  const lesserApi = calculateMCRTotalFan(lesser, []);
  const lesserIds = lesserApi.patterns.map(p => p.id);
  assert.ok(lesserIds.includes('quanBuKao'));
  assert.ok(lesserIds.includes('zuHeLong'));
  assert.ok(!lesserIds.includes('qiXingBuKao'));
  assert.ok(!lesserIds.includes('quanDaiYao'));
  assert.equal(lesserApi.totalFan, 24);
  assert.equal(calculateShanten(lesser.filter(t => !(t.suit === Suit.Zihai && t.value === 5)), [], GameMode.MCR), 0);

  // 组合龙 + 明碰：111m 补一副面子、22p 作将，无字 1 番另计
  const knitted = [...tiles('147', Suit.Man), ...tiles('258', Suit.Pin), ...tiles('369', Suit.Sou), ...tiles('111', Suit.Man), ...tiles('22', Suit.Pin)];
  assert.equal(checkWinning(countsToArray(countTiles(knitted)), 0), true);
  const knittedApi = calculateMCRTotalFan(knitted, []);
  assert.deepEqual(knittedApi.patterns.map(p => p.id).sort(), ['wuZi', 'zuHeLong']);
  assert.equal(knittedApi.totalFan, 13);
  // 组合龙作为合法结构，去掉一张后也应识别为听牌。
  const knittedReady = knitted.filter((t, i) => i !== knitted.length - 1);
  assert.equal(calculateShanten(knittedReady, [], GameMode.MCR), 0);

  // 特殊结构同样不计不求人，但自摸仍照记；未知来源时两者都不计
  const draw = calculateMCRTotalFan(sevenStars, [], 'selfDraw');
  const claim = calculateMCRTotalFan(sevenStars, [], 'claim');
  assert.equal(draw.totalFan, claim.totalFan + 1);
  assert.equal(draw.patterns.find(p => p.id === 'ziMo')?.fan, 1);
  assert.equal(draw.patterns.some(p => p.id === 'buQiuRen'), false);
  assert.equal(claim.patterns.some(p => p.id === 'menQianQing'), false);

  // 全部由组合龙的三组牌构成（9 张）+ 一副暗刻 + 将
  const openKnitted = [...tiles('147', Suit.Man), ...tiles('258', Suit.Pin), ...tiles('369', Suit.Sou), ...tiles('111', Suit.Man), ...tiles('22', Suit.Pin)];
  assert.equal(checkWinning(countsToArray(countTiles(openKnitted)), 0), true);

  // 超过一步的特殊型距离也要按固定牌张数算，不能退回常规向听近似。
  // 不靠差一张：147m 258p 3s + 五种字牌，再补一种字牌即可听牌。
  const knittedOneAway = [...tiles('147', Suit.Man), ...tiles('258', Suit.Pin), createTile(Suit.Sou, 3), ...tiles('12345', Suit.Zihai), createTile(Suit.Zihai, 1)];
  assert.equal(calculateShanten(knittedOneAway, [], GameMode.MCR), 1);
  // 组合龙差一张：九张龙 + 55z 将 + 单张 2m，摸 2m 的刻子位仍差两张（换掉 8p 后听牌）
  const knittedTwoAway = [...tiles('147', Suit.Man), ...tiles('258', Suit.Pin), ...tiles('369', Suit.Sou), ...tiles('55', Suit.Zihai), createTile(Suit.Man, 2), createTile(Suit.Pin, 8)];
  assert.equal(calculateShanten(knittedTwoAway, [], GameMode.MCR), 1);
  const starsReady = [...tiles('147', Suit.Man), ...tiles('258', Suit.Pin), createTile(Suit.Sou, 3), ...tiles('123456', Suit.Zihai)];
  assert.equal(calculateShanten([...starsReady, createTile(Suit.Zihai, 1)], []), 0); // 14张先弃重张仍是听牌
  assert.equal(calculateShanten(starsReady.slice(0, -1), []), 1); // 12张尚缺两次补张
  const dragonReady = [...tiles('147111', Suit.Man), ...tiles('2582', Suit.Pin), ...tiles('369', Suit.Sou)];
  assert.equal(calculateShanten([...dragonReady, createTile(Suit.Pin, 8)], []), 0);
  // 常规 13 张牌不受特殊型公式影响
  assert.equal(calculateShanten([...tiles('123456789', Suit.Man), ...tiles('123', Suit.Pin), ...tiles('5', Suit.Sou)], [], GameMode.MCR), 0);
});

test('国标特殊结构：重复牌、缺张、错位与带副露的假结构都被拒', () => {
  const nine = [...tiles('147', Suit.Man), ...tiles('258', Suit.Pin), ...tiles('369', Suit.Sou)];
  // 正常九张 + 一副面子 + 将
  assert.equal(checkWinning(countsToArray(countTiles([...nine, ...tiles('111', Suit.Man), ...tiles('22', Suit.Pin)])), 0), true);
  // 重复牌：两种花色取到同一张
  assert.equal(checkWinning(countsToArray(countTiles([...tiles('147', Suit.Man), ...tiles('147', Suit.Pin), ...tiles('369', Suit.Sou), ...tiles('111', Suit.Man), ...tiles('22', Suit.Pin)])), 0), false);
  // 错位：不是 1/4/7 的排列
  assert.equal(checkWinning(countsToArray(countTiles([...tiles('123', Suit.Man), ...tiles('258', Suit.Pin), ...tiles('369', Suit.Sou), ...tiles('111', Suit.Man), ...tiles('22', Suit.Pin)])), 0), false);
  // 张数不足
  assert.equal(checkWinning(countsToArray(countTiles([...nine, ...tiles('11', Suit.Man)])), 0), false);
  // 组合龙的九张不能来自副露（副露只补面子）
  assert.equal(
    checkWinning(countsToArray(countTiles([...tiles('147', Suit.Man), ...tiles('258', Suit.Pin), ...tiles('22', Suit.Pin)])), 2),
    false,
  );
});

// ============================================================
// 六、国标番种：同一合法拆分内计番
// ============================================================

test('全带幺要求每副面子和将牌都含幺九或字牌，且在同一拆分内成立', () => {
  // 123789m + 111p + 999s + 11z：全带幺4 + 双暗刻2 + 幺九刻2 + 老少副1 = 9
  const outside = [...tiles('123789', Suit.Man), ...tiles('111', Suit.Pin), ...tiles('999', Suit.Sou), ...tiles('11', Suit.Zihai)];
  assert.equal(checkWinning(countsToArray(countTiles(outside)), 0), true);
  const api = calculateMCRTotalFan(outside, []);
  assert.ok(mcrPatternIds(outside).includes('quanDaiYao'));
  assert.equal(api.totalFan, 9);

  // 123m234p345s678s99s 没有全带幺：平和2 + 连六1 + 三色三步高6 = 9，本身确实达到 8 番
  const allChows = [...tiles('123', Suit.Man), ...tiles('234', Suit.Pin), ...tiles('345', Suit.Sou), ...tiles('678', Suit.Sou), ...tiles('99', Suit.Sou)];
  const allChowsIds = mcrPatternIds(allChows);
  assert.ok(!allChowsIds.includes('quanDaiYao'));
  assert.ok(allChowsIds.includes('pingHu'));
  assert.ok(allChowsIds.includes('sanSeSanBuGao'));
  assert.ok(allChowsIds.includes('lianLiu'));
  assert.equal(calculateMCRTotalFan(allChows, []).totalFan, 9);

  // 无副露的暗手也不能凭「牌面里出现过幺九」判全带幺
  const noTerminalPair = [...tiles('12378955', Suit.Man), ...tiles('123789', Suit.Pin)];
  assert.ok(!mcrPatternIds(noTerminalPair).includes('quanDaiYao'));
});

test('平和与清龙都在同一合法拆分内判定', () => {
  // 平和：四副顺子 + 序数将；连六 1 番另计
  const allChows = [...tiles('123', Suit.Man), ...tiles('456', Suit.Man), ...tiles('789', Suit.Pin), ...tiles('234', Suit.Sou), ...tiles('55', Suit.Sou)];
  const allChowsIds = mcrPatternIds(allChows);
  assert.ok(allChowsIds.includes('pingHu'));
  assert.ok(!allChowsIds.includes('quanDaiYao'));
  assert.equal(calculateMCRTotalFan(allChows, []).totalFan, 3);

  // 字牌将不算平和；牌面含字牌也不计无字
  const honorPair = [...tiles('123', Suit.Man), ...tiles('456', Suit.Man), ...tiles('789', Suit.Pin), ...tiles('234', Suit.Sou), ...tiles('55', Suit.Zihai)];
  const honorIds = mcrPatternIds(honorPair);
  assert.ok(!honorIds.includes('pingHu'));
  assert.ok(!honorIds.includes('wuZi'));
  assert.equal(calculateMCRTotalFan(honorPair, []).totalFan, 1);

  // 有刻子就不算平和
  const pongHand = [...tiles('123', Suit.Man), ...tiles('456', Suit.Man), ...tiles('789', Suit.Pin), ...tiles('234', Suit.Sou), ...tiles('555', Suit.Man)];
  assert.ok(!mcrPatternIds(pongHand).includes('pingHu'));

  // 清龙：同花色 123/456/789；喜相逢、缺一门另计，连六/老少副/无字不再计
  const pureStraight = [...tiles('123456789', Suit.Man), ...tiles('12355', Suit.Pin)];
  const straightIds = mcrPatternIds(pureStraight);
  assert.ok(straightIds.includes('qingLong'));
  assert.ok(straightIds.includes('xiXiangFeng'));
  assert.ok(straightIds.includes('queYiMen'));
  assert.ok(!straightIds.includes('lianLiu'));
  assert.ok(!straightIds.includes('laoShaoFu'));
  assert.ok(!straightIds.includes('wuZi'));
  assert.equal(calculateMCRTotalFan(pureStraight, []).totalFan, 20);
});

test('明碰不当暗刻：碰碰和与暗刻番只看暗手', () => {
  // 碰 111p、碰 999p + 暗手 123456m + 77p：两顺两刻，不是碰碰和，也没有双暗刻
  const hand = [...tiles('123456', Suit.Man), ...tiles('77', Suit.Pin)];
  const counts = patternCounts(hand, [pong(1), pong(9)]);
  assert.equal(counts.pengPengHu ?? 0, 0);
  assert.equal(counts.shuangAnKe ?? 0, 0);
  assert.equal(counts.yaoJiuKe ?? 0, 2); // 明碰也算幺九刻，但不算暗刻

  // 三风刻需要三副风刻；只有两副风碰时，第三种风作将不算
  const winds = [...tiles('123456', Suit.Man), ...tiles('33', Suit.Zihai)];
  const windMelds = [pong(1, Suit.Zihai), pong(2, Suit.Zihai)];
  assert.deepEqual(validateGameState(state(winds, windMelds), 'zh'), []);
  assert.equal(checkWinning(countsToArray(countTiles(winds)), windMelds.length), true);
  const windCounts = patternCounts(winds, windMelds);
  assert.equal(windCounts.sanFengKe ?? 0, 0);
  assert.equal(windCounts.shuangAnKe ?? 0, 0);
  assert.equal(windCounts.hunYiSe ?? 0, 1);
  assert.equal(mcrFan(winds, windMelds), 9); // 混一色6 + 幺九刻2 + 连六1
});

test('杠：记录杠类型后才计明暗杠；不把杠算成四归一；七对保留四张同牌', () => {
  // 123456m + 55s + 杠1p + 杠2p：不推断明杠/暗杠/双杠，杠也不算四归一
  const hand = [...tiles('123456', Suit.Man), ...tiles('55', Suit.Sou)];
  const melds = [gang(1), gang(2)];
  assert.deepEqual(validateGameState(state(hand, melds), 'zh'), []);
  const counts = patternCounts(hand, melds);
  for (const id of ['mingGang', 'anGang', 'shuangMingGang', 'shuangAnGang', 'mingAnGang', 'siGuiYi', 'pengPengHu', 'shuangAnKe']) {
    assert.equal(counts[id] ?? 0, 0, `${id} 不得由未记录的杠类型推出`);
  }
  assert.equal(counts.yaoJiuKe, 1);
  assert.equal(mcrFan(hand, melds), 3); // 幺九刻1 + 连六1 + 无字1

  // 记录后按真实类型计：双明杠4 / 明暗杠5 / 双暗杠6，且不重复算单杠
  assert.equal(mcrFan(hand, [gang(1, Suit.Pin, 'exposed'), gang(2, Suit.Pin, 'exposed')]), 7);
  assert.equal(patternCounts(hand, [gang(1, Suit.Pin, 'exposed'), gang(2, Suit.Pin, 'exposed')]).shuangMingGang, 1);
  assert.equal(mcrFan(hand, [gang(1, Suit.Pin, 'concealed'), gang(2, Suit.Pin, 'added')]), 8);
  assert.equal(patternCounts(hand, [gang(1, Suit.Pin, 'concealed'), gang(2, Suit.Pin, 'added')]).mingAnGang, 1);
  assert.equal(mcrFan(hand, [gang(1, Suit.Pin, 'concealed'), gang(2, Suit.Pin, 'concealed')]), 11); // 双暗杠6 + 双暗刻2 + 原有3番
  // 只记录了一半时，未记录的那副不算单杠人数
  assert.equal(patternCounts(hand, [gang(1, Suit.Pin, 'exposed'), gang(2)]).mingGang, 1);
  assert.equal(patternCounts(hand, [gang(1, Suit.Pin, 'exposed'), gang(2)]).shuangMingGang, undefined);

  // 七对：四张同牌分作两对，仍计四归一（不属于杠）
  const qiDui = [...tiles('1111223344', Suit.Man), ...tiles('5566', Suit.Pin)];
  assert.equal(checkWinning(countsToArray(countTiles(qiDui)), 0), true);
  const qiDuiApi = calculateMCRTotalFan(qiDui, []);
  assert.ok(qiDuiApi.patterns.some(p => p.id === 'qiDui'));
  assert.equal(qiDuiApi.patterns.find(p => p.id === 'siGuiYi')?.count, 1);
  assert.equal(qiDuiApi.totalFan, 28); // 七对24 + 四归一2 + 无字1 + 缺一门1

  // 七对的牌面全为偶数 ≠ 全双刻；真四副偶数刻子才计全双刻。
  const evenPairs = [...tiles('22224444', Suit.Man), ...tiles('666688', Suit.Pin)];
  assert.equal(checkWinning(countsToArray(countTiles(evenPairs)), 0), true);
  assert.ok(!mcrPatternIds(evenPairs).includes('quanShuangKe'));
  const evenPungs = [...tiles('222444', Suit.Man), ...tiles('66622', Suit.Pin), ...tiles('888', Suit.Sou)];
  assert.equal(checkWinning(countsToArray(countTiles(evenPungs)), 0), true);
  assert.ok(mcrPatternIds(evenPungs).includes('quanShuangKe'));
});

test('高价值番种：大三元与三色三同顺都要识别且不重复计低番', () => {
  // 555666777z + 12355m：大三元88 + 混一色6 + 三暗刻16 + 幺九刻3 = 113，箭刻不再另计
  const bigThree = [...tiles('555666777', Suit.Zihai), ...tiles('12355', Suit.Man)];
  const bigIds = mcrPatternIds(bigThree);
  assert.ok(bigIds.includes('daSanYuan'));
  assert.ok(!bigIds.includes('jianKe'));
  assert.ok(!bigIds.includes('shuangJianKe'));
  assert.ok(!bigIds.includes('xiaoSanYuan'));
  assert.equal(calculateMCRTotalFan(bigThree, []).totalFan, 113);

  // 234m234p234s + 567m + 55s：三色三同顺8 + 断幺2 + 平和2 + 连六1 = 13，合法达到起和线
  const tripleChow = [...tiles('234', Suit.Man), ...tiles('234', Suit.Pin), ...tiles('234', Suit.Sou), ...tiles('567', Suit.Man), ...tiles('55', Suit.Sou)];
  const tripleApi = calculateMCRTotalFan(tripleChow, []);
  assert.ok(tripleApi.patterns.some(p => p.id === 'sanSeSanTongShun'));
  assert.equal(tripleApi.totalFan, 13);
  assert.equal(tripleApi.isValid, true);

  // 三色三步高与三色三节高的起点不必是 1。
  const shiftedChows = [...tiles('234789', Suit.Man), ...tiles('34555', Suit.Pin), ...tiles('456', Suit.Sou)];
  assert.ok(mcrPatternIds(shiftedChows).includes('sanSeSanBuGao'));
  const shiftedPungs = [...tiles('222555', Suit.Man), ...tiles('33366', Suit.Pin), ...tiles('444', Suit.Sou)];
  assert.ok(mcrPatternIds(shiftedPungs).includes('sanSeSanJieGao'));
});

test('全求人：明杠也算求人，暗杠或未记录杠类型不算', () => {
  const pair = [...tiles('55', Suit.Sou)];
  const claimedPongs = [pong(1, Suit.Man), pong(2, Suit.Man), pong(3, Suit.Pin)];
  // 明杠 + 3 副明碰 + 点和：全求人 6 + 碰碰和 6 + 幺九刻/明杠等，可确认达到 8 番
  const withExposedKong = calculateMCRTotalFan(pair, [...claimedPongs, gang(9, Suit.Sou, 'exposed')], 'claim', {});
  assert.ok(withExposedKong.patterns.some(p => p.id === 'quanQiuRen'), '明杠应计入全求人');
  // 自摸不算求人；暗杠是自摸成刻，也不算；杠类型未记录时不确认明暗，宁漏不虚加。
  assert.ok(!calculateMCRTotalFan(pair, [...claimedPongs, gang(9, Suit.Sou, 'exposed')], 'selfDraw', {})
    .patterns.some(p => p.id === 'quanQiuRen'));
  assert.ok(!calculateMCRTotalFan(pair, [...claimedPongs, gang(9, Suit.Sou, 'concealed')], 'claim', {})
    .patterns.some(p => p.id === 'quanQiuRen'));
  assert.ok(!calculateMCRTotalFan(pair, [...claimedPongs, gang(9, Suit.Sou)], 'claim', {})
    .patterns.some(p => p.id === 'quanQiuRen'));
});

test('高番不计规则：清幺九/字一色/绿一色/双箭刻按参考口径过滤', () => {
  // 清幺九 64 + 四暗刻 64 = 128，全带幺/碰碰和/幺九刻/无字不再计
  const allTerminals = [...tiles('111999', Suit.Man), ...tiles('111999', Suit.Pin), ...tiles('11', Suit.Sou)];
  const terminalsApi = calculateMCRTotalFan(allTerminals, []);
  assert.equal(terminalsApi.totalFan, 128);
  for (const id of ['quanDaiYao', 'pengPengHu', 'yaoJiuKe', 'wuZi']) {
    assert.ok(!terminalsApi.patterns.some(p => p.id === id), `清幺九不得再计 ${id}`);
  }

  // 字一色 64 + 三风刻 12 + 箭刻 2 = 78（混幺九/碰碰和/全带幺/幺九刻/缺一门不计）
  const allHonors = [...tiles('66', Suit.Zihai)];
  const honorMelds = [pong(1, Suit.Zihai), pong(2, Suit.Zihai), pong(3, Suit.Zihai), pong(5, Suit.Zihai)];
  assert.equal(mcrFan(allHonors, honorMelds), 78);

  // 绿一色不计混一色与缺一门，但仍计清一色：88 + 四暗刻64 + 清一色24 + 一色三节高24 + 碰碰和6 + 断幺2
  const allGreen = [...tiles('222333444666', Suit.Sou), ...tiles('88', Suit.Sou)];
  assert.equal(mcrFan(allGreen, []), 208);
  // 双箭刻不计箭刻：6 + 双暗刻2 + 幺九刻2 + 缺一门1 + 连六1
  const twoDragons = [...tiles('555666', Suit.Zihai), ...tiles('123456', Suit.Man), ...tiles('22', Suit.Sou)];
  assert.equal(mcrFan(twoDragons, []), 12);
  // 全带五/全双刻不计无字
  const allFives = [...tiles('555', Suit.Man), ...tiles('456', Suit.Pin), ...tiles('345', Suit.Sou), ...tiles('567', Suit.Sou), ...tiles('55', Suit.Pin)];
  const fivesApi = calculateMCRTotalFan(allFives, []);
  assert.ok(fivesApi.patterns.some(p => p.id === 'quanDaiWu'));
  assert.ok(!fivesApi.patterns.some(p => p.id === 'wuZi'));
  const evenPungs = [...tiles('222444', Suit.Man), ...tiles('66622', Suit.Pin), ...tiles('888', Suit.Sou)];
  const evenApi = calculateMCRTotalFan(evenPungs, []);
  assert.ok(evenApi.patterns.some(p => p.id === 'quanShuangKe'));
  assert.ok(!evenApi.patterns.some(p => p.id === 'wuZi'));
});

test('七对/连七对择优，九莲宝灯要核对和牌前的 13 张', () => {
  const qiDui = [...tiles('1111223344', Suit.Man), ...tiles('5566', Suit.Pin)];
  assert.equal(checkWinning(countsToArray(countTiles(qiDui)), 0), true);
  assert.equal(mcrPatternIds(qiDui).includes('qiDui'), true);

  const lianQiDui = tiles('11223344556677', Suit.Man);
  assert.equal(checkWinning(countsToArray(countTiles(lianQiDui)), 0), true);
  const lianApi = calculateMCRTotalFan(lianQiDui, []);
  assert.ok(lianApi.patterns.some(p => p.id === 'lianQiDui'));
  assert.ok(!lianApi.patterns.some(p => p.id === 'qiDui'));
  assert.ok(!lianApi.patterns.some(p => p.id === 'qingYiSe'));
  // 连七对自身不计无字，不能因清一色被排除而加回来。
  assert.equal(lianApi.totalFan, 88);

  const jiuLian = [...tiles('1112345678999', Suit.Man), createTile(Suit.Man, 5)];
  assert.equal(checkWinning(countsToArray(countTiles(jiuLian)), 0), true);
  const jiuApi = calculateMCRTotalFan(jiuLian, []);
  assert.ok(!jiuApi.patterns.some(p => p.id === 'jiuLianBaoDeng'));
  assert.ok(jiuApi.patterns.some(p => p.id === 'qingYiSe'));
  assert.ok(jiuApi.missingContext.includes('winningTile'));

  // 记录和牌张后才确认九莲宝灯：和牌前 13 张正好是 1112345678999
  const jiuWin = calculateMCRTotalFan(jiuLian, [], 'selfDraw', { winningTile: createTile(Suit.Man, 5) });
  assert.ok(jiuWin.patterns.some(p => p.id === 'jiuLianBaoDeng'));
  assert.ok(!jiuWin.patterns.some(p => p.id === 'qingYiSe'));
  // 九莲宝灯88 + 双暗刻2 + 额外幺九刻1 + 自摸1；九面听不计单钓，无字直接不计。
  assert.equal(jiuWin.totalFan, 92);
  // 去掉和牌张后不是 1112345678999 时不得确认（123m×3 + 789m + 99m 是另一种清一色和牌）
  const notNine = tiles('12312312378999', Suit.Man);
  assert.equal(checkWinning(countsToArray(countTiles(notNine)), 0), true);
  const notNineIds = mcrPatternIds(notNine, [], 'selfDraw', { winningTile: createTile(Suit.Man, 9) });
  assert.ok(!notNineIds.includes('jiuLianBaoDeng'));
  assert.ok(notNineIds.includes('qingYiSe'));
});

test('国标和牌上下文：门风/圈风刻、和牌张听型、末张与绝张都要按记录计', () => {
  /** 已按不计规则过滤的番种（事件番种之间的排除关系只在过滤后可见）。 */
  const validated = (hand: Tile[], melds: Meld[], winSource: WinSource, ctx: MCRContext): string[] =>
    calculateMCRTotalFan(hand, melds, winSource, ctx).patterns.map(p => p.id);

  // 门风/圈风刻：同一副风刻可以同时是门风和圈风（各 2 番）
  const windHand = [...tiles('123456', Suit.Man), ...tiles('55', Suit.Sou)];
  const windMelds = [pong(1, Suit.Zihai), pong(2, Suit.Zihai)];
  assert.deepEqual(validateGameState(state(windHand, windMelds), 'zh'), []);
  assert.equal(patternCounts(windHand, windMelds, 'unknown', { seatWind: 1, roundWind: 2 }).menFengKe, 1);
  assert.equal(patternCounts(windHand, windMelds, 'unknown', { seatWind: 2, roundWind: 2 }).quanFengKe, 1);
  assert.equal(patternCounts(windHand, windMelds, 'unknown', { seatWind: 1, roundWind: 1 }).quanFengKe, 1);
  assert.equal(patternCounts(windHand, windMelds, 'unknown', { seatWind: 3, roundWind: 3 }).menFengKe, undefined);
  assert.equal(patternCounts(windHand, windMelds).menFengKe, undefined);
  // 门风/圈风刻会消化对应风刻的幺九刻：东为门风、南为圈风时两副都不再计幺九刻
  assert.equal(patternCounts(windHand, windMelds, 'unknown', { seatWind: 1, roundWind: 2 }).yaoJiuKe, undefined);
  assert.equal(patternCounts(windHand, windMelds, 'unknown', { seatWind: 2, roundWind: 2 }).yaoJiuKe, 1);
  assert.equal(patternCounts(windHand, windMelds).yaoJiuKe, 2);
  assert.equal(mcrFan(windHand, windMelds, 'unknown', { seatWind: 1, roundWind: 2 }), 6);
  // 三风刻扣三副风刻的幺九刻，剩余幺九刻照计
  const threeWinds = [...tiles('111', Suit.Man), ...tiles('55', Suit.Sou)];
  const threeWindMelds = [pong(1, Suit.Zihai), pong(2, Suit.Zihai), pong(3, Suit.Zihai)];
  assert.equal(patternCounts(threeWinds, threeWindMelds).yaoJiuKe, 1);
  assert.equal(mcrFan(threeWinds, threeWindMelds), 20);

  // 和牌张听型：单钓将 / 坎张 / 边张各 1 番，两面听不计
  const pairWait = [...tiles('123456789', Suit.Man), ...tiles('456', Suit.Pin), ...tiles('55', Suit.Sou)];
  assert.ok(validated(pairWait, [], 'unknown', { winningTile: createTile(Suit.Sou, 5) }).includes('danDiaoJiang'));
  assert.ok(validated(pairWait, [], 'unknown', { winningTile: createTile(Suit.Man, 5) }).includes('kanZhang'));
  assert.ok(!validated(pairWait, [], 'unknown', { winningTile: createTile(Suit.Man, 1) }).includes('bianZhang'));
  const edgeWait = [...tiles('123456789', Suit.Man), ...tiles('345', Suit.Pin), ...tiles('99', Suit.Sou)];
  assert.ok(validated(edgeWait, [], 'unknown', { winningTile: createTile(Suit.Man, 3) }).includes('bianZhang'));
  assert.ok(validated(edgeWait, [], 'unknown', { winningTile: createTile(Suit.Man, 2) }).includes('kanZhang'));
  assert.ok(!validated(edgeWait, [], 'unknown', {}).includes('bianZhang'));

  // 末张：自摸记妙手回春（不计自摸）、点和记海底捞月，都只在记录末张时成立
  const draw = validated(pairWait, [], 'selfDraw', { lastTile: true });
  assert.ok(draw.includes('miaoShouHuiChun'));
  assert.ok(!draw.includes('ziMo'));
  assert.ok(validated(pairWait, [], 'claim', { lastTile: true }).includes('haiDiLaoYue'));
  assert.ok(!validated(pairWait, [], 'selfDraw', { lastTile: false }).includes('miaoShouHuiChun'));
  assert.ok(!validated(pairWait, [], 'selfDraw', {}).includes('miaoShouHuiChun'));

  // 和绝张：和牌张在牌河/副露里已见三张才成立
  const winners = createTile(Suit.Pin, 1);
  const river = tiles('111', Suit.Pin);
  const lastCopyHand = [...tiles('111', Suit.Man), ...tiles('123', Suit.Pin), ...tiles('456789', Suit.Sou), ...tiles('22', Suit.Zihai)];
  assert.ok(validated(lastCopyHand, [], 'claim', { winningTile: winners, discards: river }).includes('heJueZhang'));
  assert.ok(!validated(lastCopyHand, [], 'claim', { winningTile: winners, discards: river.slice(0, 2) }).includes('heJueZhang'));
  assert.ok(!validated(lastCopyHand, [], 'claim', { discards: river }).includes('heJueZhang'));

  // 杠后和牌：自摸补张=杠上开花（不计自摸），点和加杠的牌=抢杠和（不计和绝张）
  const kongDraw = validated([...tiles('123456', Suit.Man), ...tiles('55', Suit.Sou)], [gang(1), pong(9)], 'selfDraw', { afterKong: true });
  assert.ok(kongDraw.includes('gangShangKaiHua'));
  assert.ok(!kongDraw.includes('ziMo'));
  assert.ok(validated(pairWait, [], 'claim', { afterKong: true }).includes('qiangGangHu'));
  assert.ok(!validated(pairWait, [], 'unknown', { afterKong: true }).some(id => id === 'gangShangKaiHua' || id === 'qiangGangHu'));
  assert.ok(!validated(pairWait, [], 'selfDraw', {}).includes('gangShangKaiHua'));
});

test('新增上下文不虚报待牌与暗刻，牌河参与API校验', () => {
  assert.equal(getPatternById('wuFanHu')?.fan, 8);
  const multi = [...tiles('123456789', Suit.Man), ...tiles('11122', Suit.Pin)];
  const multiIds = calculateMCRTotalFan(multi, [], 'claim', { winningTile: createTile(Suit.Pin, 2) }).patterns.map(p => p.id);
  assert.ok(!multiIds.includes('danDiaoJiang')); // 和2p或3p，不能计单钓
  const concealed = [gang(9, Suit.Pin, 'concealed')];
  const hand = [...tiles('111', Suit.Man), ...tiles('123456', Suit.Sou), ...tiles('55', Suit.Pin)];
  const draw = calculateMCRTotalFan(hand, concealed, 'selfDraw').patterns.map(p => p.id);
  assert.ok(draw.includes('buQiuRen') && draw.includes('shuangAnKe'));
  assert.ok(calculateMCRTotalFan(hand, concealed, 'claim').patterns.some(p => p.id === 'menQianQing'));
  const pungs = [...tiles('111222555', Suit.Man), ...tiles('999', Suit.Pin), ...tiles('66', Suit.Sou)];
  const claim = calculateMCRTotalFan(pungs, [], 'claim', { winningTile: createTile(Suit.Man, 2) });
  assert.ok(!claim.patterns.some(p => p.id === 'siAnKe'));
  assert.ok(claim.patterns.some(p => p.id === 'sanAnKe'));
  const full = { winningTile: createTile(Suit.Zihai, 5), seatWind: 1, roundWind: 1, lastTile: false } as const;
  const low = [...tiles('123456', Suit.Man), ...tiles('789', Suit.Pin), ...tiles('234', Suit.Sou), ...tiles('55', Suit.Zihai)];
  assert.ok(calculateMCRTotalFan(low, [], 'claim', full).missingContext.includes('afterKong'));
  assert.ok(calculateMCRTotalFan(low, [], 'claim', { ...full, winningTile: createTile(Suit.Sou, 9) }).missingContext.includes('winningTile'));
  assert.equal(calculateMCRTotalFan(multi, [], 'claim', { discards: tiles('222', Suit.Pin) }).structuralWin, false); // 合计5张2p
  const visiblePong = calculateMCRTotalFan([...tiles('123456', Suit.Man), ...tiles('789', Suit.Pin), ...tiles('55', Suit.Sou)], [pong(1, Suit.Man)], 'claim', { winningTile: createTile(Suit.Man, 1) });
  assert.ok(visiblePong.patterns.some(p => p.id === 'heJueZhang')); // 无牌河，但明碰已见3张
});

test('顺子小番不重复套算，全带五不得由字牌索引碰巧成立', () => {
  const low = calculateMCRTotalFan([...tiles('234567', Suit.Man), ...tiles('234567', Suit.Pin), ...tiles('99', Suit.Sou)], []);
  assert.equal(low.totalFan, 5); // 平和2 + 喜相逢2 + 连六1，不能再套算第二个连六
  const high = calculateMCRTotalFan([...tiles('123456', Suit.Man), ...tiles('456', Suit.Pin), ...tiles('78955', Suit.Sou)], []);
  assert.equal(high.patterns.filter(p => ['yiBanGao', 'xiXiangFeng', 'lianLiu', 'laoShaoFu'].includes(p.id)).reduce((n, p) => n + p.count, 0), 1);
  const falseFive = [...tiles('555', Suit.Zihai), ...tiles('555', Suit.Man), ...tiles('34555', Suit.Pin), ...tiles('456', Suit.Sou)];
  assert.ok(!mcrPatternIds(falseFive).includes('quanDaiWu'));
  const realFive = [...tiles('555', Suit.Man), ...tiles('34555', Suit.Pin), ...tiles('345456', Suit.Sou)];
  assert.ok(mcrPatternIds(realFive).includes('quanDaiWu'));
});

// ============================================================
// 七、国标建议层：缺牌按实体牌算，不推断末张事件与胜率
// ============================================================

test('建议层：一色三步高按实体牌算缺张，不重复借用同一张', () => {
  const hand = [...tiles('123456789', Suit.Man), ...tiles('147', Suit.Pin), ...tiles('19', Suit.Sou)];
  assert.equal(calculateShanten(hand, []), 2);
  const suggestion = analyzeMCR(hand, [], 'zh', 50).find(s => s.name.includes('一色三步高'));
  assert.ok(suggestion, '一色三步高仍是潜在番型');
  // 123+234+345 需要 1/5 各一张、2/4 各两张、3 三张：只有 123456789m 时缺 4 张
  assert.equal(suggestion.missingTiles.length, 4);
  for (const s of analyzeMCR(hand, [], 'zh', 50)) assert.equal(s.probability, 0);

  // 三副已碰的牌不能被拆开凑123；只余一副面子时不能推荐需三副顺子的清龙。
  const fixedPongs = [pong(1, Suit.Man), pong(2, Suit.Man), pong(3, Suit.Man)];
  const residual = [...tiles('789', Suit.Man), createTile(Suit.Pin, 5)];
  assert.ok(!analyzeMCR(residual, fixedPongs, 'zh', 50).some(s => s.name === TEXT.zh.pureStraight));
  // 已明吃的顺子可以计入目标顺子，但仍只能使用一次。
  const fixedChow = [chi('123', Suit.Man)];
  const chowHand = [...tiles('456789', Suit.Man), ...tiles('22', Suit.Pin), ...tiles('333', Suit.Sou)];
  assert.ok(analyzeMCR(chowHand, fixedChow, 'zh', 50).some(s => s.name === TEXT.zh.pureStraight));
});

test('建议层：明碰/明杠不能拆成顺子，也不能被重复计入刻子', () => {
  const partialTriple = analyzeMCR([...tiles('11222333', Suit.Man), ...tiles('456', Suit.Pin), ...tiles('77', Suit.Sou)], [], 'zh', 50)
    .find(s => s.name.includes('一色三同顺'));
  assert.deepEqual(partialTriple?.missingTiles.map(t => `${t.value}${t.suit}`), ['1m']);
  const partialQuad = analyzeMCR([...tiles('11122223333', Suit.Man), ...tiles('55', Suit.Pin)], [], 'zh', 50)
    .find(s => s.name.includes('一色四同顺'));
  assert.deepEqual(partialQuad?.missingTiles.map(t => `${t.value}${t.suit}`), ['1m']);
  // 两副已碰只余两个面子槽，绝不能推荐需要三副顺子的24番一色三同顺。
  const impossible = analyzeMCR([...tiles('112233', Suit.Man), createTile(Suit.Pin, 5)],
    [pong(9, Suit.Pin), pong(8, Suit.Sou)], 'zh', 50);
  assert.ok(!impossible.some(s => s.name.includes('一色三同顺')));
  // 明碰 1m + 三组 23m：碰牌不能改当 123m 的三副顺子。
  const openPong = analyzeMCR([...tiles('23', Suit.Man), ...tiles('23', Suit.Man), ...tiles('23', Suit.Man),
    ...tiles('55', Suit.Pin), ...tiles('55', Suit.Sou)], [pong(1, Suit.Man)], 'zh', 50);
  assert.ok(!openPong.some(s => s.name.includes('一色三同顺') || s.name.includes('一色四同顺')));
  // 碰碰和：两副碰只算两刻，不能与牌面统计重复相加。
  const allPungs = analyzeMCR([...tiles('333', Suit.Man), ...tiles('44', Suit.Sou), createTile(Suit.Zihai, 5)],
    [pong(1, Suit.Man), pong(2, Suit.Pin)], 'zh', 50).find(s => s.name.includes('碰碰和'));
  assert.ok(allPungs);
  assert.ok(allPungs.patternDetails.some(d => d.includes('已有3刻')));
  // 明杠不是暗刻；暗杠才是。
  const exposed = analyzeMCR([...tiles('222333444', Suit.Man), ...tiles('55', Suit.Pin)], [gang(1, Suit.Man)], 'zh', 50);
  assert.ok(!exposed.some(s => s.name.includes('四暗刻')));
  const concealed = analyzeMCR([...tiles('222333444', Suit.Man), ...tiles('55', Suit.Pin)],
    [gang(1, Suit.Man, 'concealed')], 'zh', 50);
  assert.ok(concealed.some(s => s.name.includes('四暗刻')));
});

test('建议层：五门齐报出的向听等于真实向听', () => {
  const hand = [...tiles('12345', Suit.Man), ...tiles('123', Suit.Pin), ...tiles('456', Suit.Sou), createTile(Suit.Zihai, 1), createTile(Suit.Zihai, 5)];
  const realShanten = calculateShanten(hand, []);
  assert.equal(realShanten, 1);
  const suggestion = analyzeMCR(hand, [], 'zh', 50).find(s => s.name.includes('五门齐'));
  assert.ok(suggestion);
  assert.ok(suggestion.patternDetails.some(d => d === `向听${realShanten}`));
  assert.equal(suggestion.fan, 6);
});

test('建议层：末张提示只在牌墙剩 1 张且是 13 张等效听牌形态时出现', () => {
  const openTenpai = analyzeGame(state([...tiles('1234567', Suit.Man)], [pong(1), pong(9)], { wallCount: 1 }), 'zh');
  assert.ok(openTenpai.suggestions.some(s => s.name.includes('妙手回春') || s.name.includes('海底')));
  const closedNotTenpai = analyzeGame(state([
    ...tiles('159', Suit.Man), ...tiles('159', Suit.Pin), ...tiles('159', Suit.Sou), ...tiles('12345', Suit.Zihai),
  ], [], { wallCount: 1 }), 'zh');
  assert.ok(!closedNotTenpai.suggestions.some(s => s.name.includes('妙手回春') || s.name.includes('海底')));
  const twoLeft = analyzeGame(state([...tiles('1234567', Suit.Man)], [pong(1), pong(9)], { wallCount: 2 }), 'zh');
  assert.ok(!twoLeft.suggestions.some(s => s.name.includes('妙手回春') || s.name.includes('海底')));
});

test('导入落盘：四川新局面保留定缺与四川牌墙，国标清空定缺，续局只加用户确认的那张', () => {
  const imported = [...tiles('123', Suit.Man), ...tiles('456', Suit.Pin), ...tiles('789', Suit.Sou), createTile(Suit.Sou, 9)];
  const riverOne = [createTile(Suit.Pin, 1)];

  // 新局面：按玩法重建牌墙；四川已声明的定缺保留（既不推断也不清空）
  const sichuanNew = planImportedState(sichuan([], Suit.Man), GameMode.Sichuan, imported, { visibleRiver: riverOne });
  assert.equal(sichuanNew.mode, GameMode.Sichuan);
  assert.equal(sichuanNew.voidSuit, Suit.Man);
  assert.equal(sichuanNew.wallCount, INITIAL_WALL_SICHUAN);
  assert.equal(sichuanNew.hand.length, 10);
  assert.equal(keys(sichuanNew.discards)[0], keys(riverOne)[0]);
  assert.equal(sichuanNew.melds.length, 0);

  // 国标新局面：定缺必须为空，牌墙用国标初始值
  const mcrNew = planImportedState(state([...tiles('111', Suit.Man)]), GameMode.MCR, imported, { visibleRiver: [] });
  assert.equal(mcrNew.voidSuit, null);
  assert.equal(mcrNew.wallCount, INITIAL_WALL_MCR);
  assert.equal(mcrNew.hand.length, 10);

  // 续局：只有用户确认打过的那张进已见牌河，未确认时不动牌河
  const confirmed = planImportedState(sichuan([createTile(Suit.Pin, 3)], Suit.Pin), GameMode.Sichuan, imported,
    { importMode: 'continue', confirmedDiscard: createTile(Suit.Pin, 3) });
  assert.equal(confirmed.discards.length, 1);
  assert.equal(keys(confirmed.discards)[0], keys([createTile(Suit.Pin, 3)])[0]);
  assert.equal(confirmed.voidSuit, Suit.Pin);
  const unconfirmed = planImportedState(sichuan([createTile(Suit.Pin, 3)], Suit.Pin), GameMode.Sichuan, imported,
    { importMode: 'continue' });
  assert.equal(unconfirmed.discards.length, 0);
  assert.equal(keys(unconfirmed.hand).length, 10);
});

test('空局面：牌墙按玩法取初始值，且与存储解码的空局面一致', () => {
  assert.equal(emptyEntryState(GameMode.MCR).wallCount, INITIAL_WALL_MCR);
  assert.equal(emptyEntryState(GameMode.Sichuan).wallCount, INITIAL_WALL_SICHUAN);
  assert.equal(emptyEntryState(GameMode.Sichuan).voidSuit, null);
  assert.equal(decodeEntryState(null, GameMode.Sichuan), null);
});

/**
 * 端侧检测契约：导出脚本、Android 原生推理和 PC 评测分属三种语言，无法互相 import，
 * 只能按源码文本对账。三处任一侧单独改动（输入尺寸、原始输出通道数、类别数、置信度、
 * IoU、letterbox 灰边、fp32/外部NMS 声明）都会在这里失败——真机上「框数与 PC 不一致」
 * 正是靠这组参数对齐才能排查。模型二进制本身不入 Git，因此这里守卫的是契约而不是权重。
 */
test('端侧检测契约：导出脚本、原生推理与PC评测参数逐项对齐', () => {
  const read = (relative: string): string => {
    const file = path.join(process.cwd(), relative);
    assert.ok(fs.existsSync(file), `缺少来源文件 ${relative}`);
    return fs.readFileSync(file, 'utf8');
  };
  const num = (source: string, pattern: RegExp, label: string): number => {
    const matched = source.match(pattern);
    assert.ok(matched, `未能从源码解析${label}，该侧契约写法已变`);
    return Number(matched![1]);
  };
  const has = (source: string, needle: string, label: string) =>
    assert.ok(source.includes(needle), `${label} 缺少 ${needle}`);

  const exporter = read('scripts/export_android_yolo.py');
  const plugin = read('android/app/src/main/java/com/karislin/mahjong/RealTableDetectorPlugin.java');
  const evaluator = read('scripts/evaluate_real_table.py');

  // 输入边长：导出 / 原生 letterbox / PC 评测
  const exportSize = num(exporter, /"imgsz": (\d+)/, '导出脚本 imgsz');
  const pluginSize = num(plugin, /final int imageSize = (\d+)/, '原生输入边长');
  const evalSize = num(evaluator, /--imgsz", type=int, default=(\d+)/, 'PC 评测 imgsz');
  assert.equal(pluginSize, exportSize);
  assert.equal(evalSize, exportSize);
  assert.equal(exportSize, 640);

  // 类别数与原始输出通道数：4 个坐标 + 37 个类别 = 41
  const exportClasses = num(exporter, /len\(classes\) != (\d+)/, '导出脚本类别数');
  const pluginClasses = num(plugin, /for \(int c = 0; c < (\d+); c\+\+\)/, '原生类别循环上界');
  const pluginLabels = num(plugin, /labels\.length\(\) != (\d+)/, '原生清单类别校验');
  const exportChannels = num(exporter, /(\d+) not in output_dims/, '导出脚本原始通道数');
  const pluginChannels = num(plugin, /raw\.length == (\d+)/, '原生原始输出通道数');
  assert.equal(pluginClasses, exportClasses);
  assert.equal(pluginLabels, exportClasses);
  assert.equal(exportClasses, 37);
  assert.equal(exportChannels, exportClasses + 4);
  assert.equal(pluginChannels, exportChannels);

  // 置信度与 IoU 阈值
  const exportConf = num(exporter, /"confidence": ([0-9.]+)/, '导出脚本置信度');
  const pluginConf = num(plugin, /float best = ([0-9.]+)f/, '原生置信度下限');
  const evalConf = num(evaluator, /--conf", type=float, default=([0-9.]+)/, 'PC 评测 conf');
  assert.equal(pluginConf, exportConf);
  assert.equal(evalConf, exportConf);
  const exportIou = num(exporter, /"iou": ([0-9.]+)/, '导出脚本 IoU');
  const pluginIou = num(plugin, /iou\(candidate, previous\) > ([0-9.]+)f/, '原生 IoU');
  const evalIou = num(evaluator, /--iou", type=float, default=([0-9.]+)/, 'PC 评测 iou');
  assert.equal(pluginIou, exportIou);
  assert.equal(evalIou, exportIou);

  // 预处理与清单口径：灰边 114、RGB 三平面 /255、fp32、NMS 在端侧外部执行
  has(plugin, 'Color.rgb(114, 114, 114)', '原生 letterbox');
  has(plugin, 'input[plane * 2 + i] = Color.blue(argb) / 255f', '原生 NCHW 归一化');
  has(plugin, 'new long[]{1, 3, 640, 640}', '原生张量形状');
  has(exporter, '"precision": "fp32"', '导出脚本精度声明');
  has(plugin, '"fp32".equals', '原生精度校验');
  has(exporter, '"nms": "external"', '导出脚本 NMS 归属');
  has(plugin, '"external".equals', '原生 NMS 归属校验');
  has(plugin, 'Model checksum does not match manifest', '原生 SHA-256 校验');
  has(exporter, 'Output model already exists', '导出脚本不得静默覆盖已有模型');

  // 手动兜底：模型缺失时原生只报不可用，不猜牌面
  has(plugin, 'Model unavailable or invalid', '原生缺失兜底');
  has(evaluator, 'Unreviewed object detection only', 'PC 评测不越权声明');
});

console.log(`\n${passed} 项守卫通过，${failed} 项失败。`);
if (failed > 0) process.exitCode = 1;
