import assert from 'node:assert/strict';
import { GameMode, GameState, Meld, Suit, Tile } from '../types';
import { createTile } from '../constants';
import { analyzeGame, calculateMCRTotalFan, calculateShanten, calculateWaitingTiles, calculateQiDuiShanten, countTiles, countsToArray } from '../utils/mahjongLogic';
import { validateGameState } from '../utils/inputValidation';

const tiles = (digits: string, suit: Suit): Tile[] => [...digits].map(v => createTile(suit, Number(v)));
const pong = (value: number): Meld => ({ id: `pong-${value}`, type: 'pong', tiles: tiles(`${value}${value}${value}`, Suit.Pin) });
const state = (hand: Tile[], melds: Meld[] = []): GameState => ({ mode: GameMode.MCR, hand, melds, discards: [], wallCount: 50, voidSuit: null });
let passed = 0;
const test = (name: string, run: () => void) => { run(); passed++; console.log(`PASS ${name}`); };

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
console.log(`${passed} regression tests passed.`);
