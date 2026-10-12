/**
 * 和牌判断模块
 * - 标准型和牌检查
 * - 七对检查
 * - 国士无双检查
 * - 国标特殊结构：七星不靠 / 全不靠 / 组合龙
 */

// 检查是否和牌 (标准型: 4面子+1雀头, 或 七对, 或 国士, 或特殊结构)
import { GameMode } from '../types';

/** 三种花色的「不能错位」分组：147 / 258 / 369（花色内相对牌值索引）。 */
const KNITTED_GROUPS: number[][] = [[0, 3, 6], [1, 4, 7], [2, 5, 8]];

/** 分组与三种花色的对应关系，共 6 种排列。 */
const KNITTED_PERMUTATIONS: number[][] = [
  [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
];

export type KnittedHandKind = 'sevenStars' | 'lesser' | 'none';

/**
 * 七星不靠 / 全不靠：14 张互不相同的孤张，且三种花色分别只取 147、258、369 中的一组。
 * 七星不靠要求东南西北中发白七张全在；少于 7 张字牌时是全不靠。
 * 重复牌、少牌、把两组放在同一花色（错位）、带副露都由调用方排除。
 */
export const classifyKnittedHand = (tiles: number[]): KnittedHandKind => {
  if (tiles.length !== 34 || tiles.some(count => count > 1)) return 'none';
  if (tiles.reduce((total, count) => total + count, 0) !== 14) return 'none';
  const suitsKnitted = KNITTED_PERMUTATIONS.some(permutation => [0, 1, 2].every(suit => {
    const used: number[] = [];
    for (let value = 0; value < 9; value++) if (tiles[suit * 9 + value] > 0) used.push(value);
    return used.length > 0 && used.every(value => KNITTED_GROUPS[permutation[suit]].includes(value));
  }));
  if (!suitsKnitted) return 'none';
  const honors = tiles.slice(27).reduce((total, count) => total + count, 0);
  return honors === 7 ? 'sevenStars' : 'lesser';
};

/**
 * 组合龙：三种花色分别凑齐 147 / 258 / 369 中的一组（9 张）。
 * 返回去掉这 9 张后的剩余牌，每种成立的排列各一份；都不成立时返回空数组。
 */
export const knittedRemainders = (tiles: number[]): number[][] => {
  const remainders: number[][] = [];
  for (const permutation of KNITTED_PERMUTATIONS) {
    const complete = permutation.every((group, suit) =>
      KNITTED_GROUPS[group].every(offset => tiles[suit * 9 + offset] > 0));
    if (!complete) continue;
    const rest = [...tiles];
    permutation.forEach((group, suit) =>
      KNITTED_GROUPS[group].forEach(offset => { rest[suit * 9 + offset] -= 1; }));
    remainders.push(rest);
  }
  return remainders;
};

/** 暗手拆出的一副面子：刻子（含杠的张数不影响形状）或顺子。 */
export type SetShape =
  | { kind: 'pong'; tile: number }
  | { kind: 'chow'; start: number };

/** 一种合法拆分：暗手面子 + 将牌。已有副露由调用方单独锁定，不在此列。 */
export interface HandDecomposition {
  shapes: SetShape[];
  pair: number;
}

/** 拆分去重用的规范键，避免同一形状集合被不同递归顺序重复计入。 */
const decompositionKey = (decomposition: HandDecomposition): string => {
  const shapes = decomposition.shapes
    .map(shape => (shape.kind === 'pong' ? `p${shape.tile}` : `c${shape.start}`))
    .sort();
  return `${shapes.join(',')}|${decomposition.pair}`;
};

/**
 * 枚举暗手的全部合法拆分（needMelds 副面子 + 1 将）。
 * 用于「同一拆分内计番」：面子相关番种只在同一套拆分里成立，多套拆分按分值择优。
 */
export const decomposeHand = (tiles: number[], needMelds: number): HandDecomposition[] => {
  if (tiles.length !== 34 || !Number.isInteger(needMelds) || needMelds < 0) return [];
  const total = tiles.reduce((sum, count) => sum + count, 0);
  if (total !== needMelds * 3 + 2) return [];
  const found = new Map<string, HandDecomposition>();
  for (let pair = 0; pair < 34; pair++) {
    if (tiles[pair] < 2) continue;
    const rest = [...tiles];
    rest[pair] -= 2;
    for (const shapes of formMeldShapes(rest, needMelds)) {
      const decomposition: HandDecomposition = { shapes, pair };
      found.set(decompositionKey(decomposition), decomposition);
    }
  }
  return [...found.values()];
};

/** 递归拆出 need 副面子；每次都从最小的有牌张展开，保证不重复枚举同一形状集合。 */
const formMeldShapes = (tiles: number[], need: number): SetShape[][] => {
  if (need === 0) return tiles.every(count => count === 0) ? [[]] : [];
  let first = -1;
  for (let index = 0; index < tiles.length; index++) {
    if (tiles[index] > 0) { first = index; break; }
  }
  if (first === -1) return [];
  const results: SetShape[][] = [];
  if (tiles[first] >= 3) {
    tiles[first] -= 3;
    for (const rest of formMeldShapes(tiles, need - 1)) {
      results.push([{ kind: 'pong', tile: first }, ...rest]);
    }
    tiles[first] += 3;
  }
  if (first < 27 && first % 9 <= 6 && tiles[first + 1] > 0 && tiles[first + 2] > 0) {
    tiles[first]--;
    tiles[first + 1]--;
    tiles[first + 2]--;
    for (const rest of formMeldShapes(tiles, need - 1)) {
      results.push([{ kind: 'chow', start: first }, ...rest]);
    }
    tiles[first]++;
    tiles[first + 1]++;
    tiles[first + 2]++;
  }
  return results;
};

export const checkWinning = (inputTiles: number[], existingMelds: number, mode: GameMode = GameMode.MCR): boolean => {
  if (inputTiles.length !== 34 || inputTiles.some(c => !Number.isInteger(c) || c < 0 || c > 4) ||
    !Number.isInteger(existingMelds) || existingMelds < 0 || existingMelds > 4) return false;
  if (mode === GameMode.Sichuan && inputTiles.slice(27).some(c => c > 0)) return false;
  // 复制数组，避免修改原数组
  const tiles = [...inputTiles];
  const totalTiles = tiles.reduce((a, b) => a + b, 0);
  const needMelds = 4 - existingMelds;
  
  // 标准和牌需要: needMelds个面子 + 1个雀头
  // 牌数应该是: needMelds * 3 + 2
  const expectedTiles = needMelds * 3 + 2;
  if (totalTiles !== expectedTiles) {
    // 牌数不对，检查是否是特殊牌型
    if (existingMelds === 0 && totalTiles === 14) {
      // 可能是七对或国士
    } else {
      return false;
    }
  }
  
  // 1. 标准和牌检查: 选一个雀头，剩余牌必须能完全形成面子
  for (let head = 0; head < 34; head++) {
    if (tiles[head] >= 2) {
      const tempTiles = [...tiles];
      tempTiles[head] -= 2;
      if (canFormMeldsExactly(tempTiles, needMelds)) {
        return true;
      }
    }
  }
  
  // 2. 七对检查 (只有无副露时)
  if (existingMelds === 0 && totalTiles === 14) {
    let pairs = 0;
    let valid = true;
    for (let i = 0; i < 34; i++) {
      if (tiles[i] === 0) continue;
      if (tiles[i] === 2 || tiles[i] === 4) {
        pairs += tiles[i] / 2;
      } else {
        valid = false;
        break;
      }
    }
    if (valid && pairs === 7) return true;
  }
  
  // 3. 国士无双检查 (只有无副露时)
  if (existingMelds === 0 && totalTiles === 14) {
    if (mode !== GameMode.MCR) return false;
    const kokushiIndices = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
    let hasPair = false;
    let valid = true;
    
    for (let i = 0; i < 34; i++) {
      if (kokushiIndices.includes(i)) {
        if (tiles[i] === 1) continue;
        if (tiles[i] === 2 && !hasPair) {
          hasPair = true;
          continue;
        }
        valid = false;
        break;
      } else {
        if (tiles[i] > 0) {
          valid = false;
          break;
        }
      }
    }
    if (valid && hasPair) return true;
  }

  // 4. 七星不靠 / 全不靠 (国标: 无副露 14 张孤张)
  if (mode === GameMode.MCR && existingMelds === 0 && totalTiles === 14 &&
    classifyKnittedHand(tiles) !== 'none') {
    return true;
  }

  // 5. 组合龙: 147/258/369 三组龙各当一副面子，其余补足 4 副面子 + 1 将
  if (mode === GameMode.MCR && existingMelds <= 1 && totalTiles === expectedTiles) {
    const remaining = needMelds - 3;
    for (const rest of knittedRemainders(tiles)) {
      for (let head = 0; head < 34; head++) {
        if (rest[head] < 2) continue;
        rest[head] -= 2;
        const ok = canFormMeldsExactly(rest, remaining);
        rest[head] += 2;
        if (ok) return true;
      }
    }
  }

  return false;
};

// 检查能否**精确**形成指定数量的面子（所有牌必须用完）
const canFormMeldsExactly = (tiles: number[], need: number): boolean => {
  // 递归检查
  return tryFormMelds([...tiles], need);
};

// 递归尝试形成面子
const tryFormMelds = (tiles: number[], need: number): boolean => {
  if (need === 0) {
    // 所有面子已形成，检查是否还有剩余牌
    return tiles.every(t => t === 0);
  }
  
  // 找到第一个有牌的位置
  let firstIdx = -1;
  for (let i = 0; i < 34; i++) {
    if (tiles[i] > 0) {
      firstIdx = i;
      break;
    }
  }
  
  if (firstIdx === -1) {
    // 没有牌了但还需要面子
    return false;
  }
  
  // 尝试以这张牌开始形成面子
  
  // 1. 尝试刻子
  if (tiles[firstIdx] >= 3) {
    tiles[firstIdx] -= 3;
    if (tryFormMelds(tiles, need - 1)) {
      tiles[firstIdx] += 3;
      return true;
    }
    tiles[firstIdx] += 3;
  }
  
  // 2. 尝试顺子 (只对数牌有效)
  if (firstIdx < 27 && firstIdx % 9 <= 6) {
    if (tiles[firstIdx] >= 1 && tiles[firstIdx + 1] >= 1 && tiles[firstIdx + 2] >= 1) {
      tiles[firstIdx]--;
      tiles[firstIdx + 1]--;
      tiles[firstIdx + 2]--;
      if (tryFormMelds(tiles, need - 1)) {
        tiles[firstIdx]++;
        tiles[firstIdx + 1]++;
        tiles[firstIdx + 2]++;
        return true;
      }
      tiles[firstIdx]++;
      tiles[firstIdx + 1]++;
      tiles[firstIdx + 2]++;
    }
  }
  
  return false;
};
