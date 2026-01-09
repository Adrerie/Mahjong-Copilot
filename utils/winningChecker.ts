/**
 * 和牌判断模块
 * - 标准型和牌检查
 * - 七对检查
 * - 国士无双检查
 */

// 检查是否和牌 (标准型: 4面子+1雀头, 或 七对, 或 国士)
export const checkWinning = (inputTiles: number[], existingMelds: number): boolean => {
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
