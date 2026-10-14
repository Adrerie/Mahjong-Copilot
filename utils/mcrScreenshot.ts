/**
 * One fixed-layout MCR Android tablet screenshot (16:10, reference 2048×1280).
 * The fingerprints are small luminance descriptors extracted from one provided
 * screenshot, NOT a 34-tile classifier or a calibrated probability model.
 * Unknown faces are left empty for manual correction; no image leaves the device.
 */
import { Suit } from '../types';

export interface ScreenshotTile {
  index: number;
  key: string | null;
  suggested: string | null;
  distance: number | null;
  preview: string;
  /** Local quantized descriptor retained only after user explicitly verifies the imported hand. */
  glyph: string;
}

export const REFERENCE_SIZE = { width: 2048, height: 1280 };
export const HAND_CENTERS = [173, 300, 427, 554, 681, 808, 934, 1061, 1188, 1315, 1442, 1569, 1700, 1870] as const;
export const TILE_OPTIONS: Array<{ key: string; suit: Suit; value: number; name: string }> = [
  ...[Suit.Man, Suit.Pin, Suit.Sou].flatMap(suit =>
    Array.from({ length: 9 }, (_, i) => ({ key: `${suit}${i + 1}`, suit, value: i + 1,
      name: `${i + 1}${suit === Suit.Man ? '万' : suit === Suit.Pin ? '筒' : '条'}` }))),
  ...['东', '南', '西', '北', '白', '发', '中'].map((name, i) =>
    ({ key: `z${i + 1}`, suit: Suit.Zihai, value: i + 1, name })),
];

// Small quantized grayscale glyph samples, not full screenshot assets.
// Only tile faces visible in the example screenshot are represented.
export const REFERENCE_GLYPHS: Record<string, string[]> = {
  m1: ['eeeeeeeeeeeeddddddddddddccccccccccccccccccccbbcccca98766546bcb7579a999abcccbccccccccccccccccccccccccabbabccccccb8897abccbbbb9988abbbbbba88787abbbbba78787abbbbba9868888aa98889788967aaa97a98988a'],
  m3: ['eeeeeeeeeeeedddddcaacdddccccc8449cccccccc98bcccccccc9656bccccccca67abccccccb988876accb85689aa99cccbbabbabccccccb8897abccbbbb9988abbbbbba88787abbbbba78787abbbbba9868888aa98879788a67aaa97a98988a'],
  m5: ['eeeeeeeeeeeedddddcaaddddccccb634bcccccccc938cccccccc95347ccccccb63757ccccccb546488accb865678877bcc9aabbbccbccccb8897abccbbbb9988abbbbbba88787abbbbba78787abbbbba9868899aa98889788a67aaa97998987a'],
  m8: ['eeeeeeeeeeeeddddddddddddcccca89cccccccccba77ccccccc89cb68ccccca48cca47bcca57bccc8458cbbccccccba9ccccaababccccccb8897abccbbbba9889bbbbbba88787abbbbbb78787abbbbaa9868888aa99879788a67aaa97aa8988a',
       'eeeeeeeeeeeeddddddddddddcccc98acccccccccba69ccccccb7aca59ccccc849cc848bcc958cccb7459cbbcccccba9accccabbacccccccb7987acccbbbb9988abbbbbba88787abbbbba78788abbbbaa9868888a999788789968aaa97a98978a'],
  m9: ['eeeeeeeeeeeedddddbcdddddccccc948bcccccccb7344acccca653676bccccba75a5abbcccb95a86cb7bcc96ac957647ccbbbbb9aaabcccb8897abccbbbba9989bbbbbbb88787abbbbbb78787abbbbba9868898aa98879788a67aaa97998987a'],
  s2: ['eeeeeeeeeeeeddddddcdddddcccccaa9ccccccccc9b9ccccccccc9b9ccccccccc9b9ccccccccc9a9ccccccccc9b9bcccccccc9a9bcccbbbbcbbbcbbba999bbbbbaa9a9a9bbbbb9a9a99abbbbba99a9a9bbbbb9a9a99abbbbba989999aaaaa9a9'],
  p1: ['eeeeeeeeeeeeddddddddddddccccccccccccccccbaaabccccca899a9989bb89aababaa9889abba9aaba98aba99999abaabb9979789abaaa9989899aa9bb9979799ab8aba99999aba88aaaa9aaba9b989aaaa9988bba88898889baaabaa9aaaaa'],
  p4: ['eeeeeeeeeeeeddddddddddddb999bcccb98879998bcb7888999989ca789889998aca689898889ccc9777cbbbcccccbbbccccccccccccccccccccccccbbbbbbbbbbbbbaaabbbbbaaa77877bbb8888788878ba7898788878ba889867876aaa8888'],
  p6: ['eeeeeeeeeeeecaacdddddddd9999bccccccc99998999accc999879998baaba9b99997899ccccb9888989cccccbbbb999cccccccccb99ca989bcb989ab89998b89998a88988b88988b98889ba8888ba767abb8679a78887a88887978987a78887'],
  z1: ['eeeeeeeeeeeeddddddddddddccccccccccccccccb79cccccccccc66accccccca8446acccccb865799bccca98746974acc969745966bccb6974785accbb8643689bbbbbb67657abbbbb86a69857aba87aa59b9656aaba749bbaa9aaaaa89aaaaa'],
  z4: ['fffffefeeeeeddddddddddddcccccccccccccccccccccccccccccc97accccccccca45bcccb77bcb45bcccc837cb45857a9637c9334684344897479bb78747a84abbb8b64ab849a998645bba544334599bbba88889abbbbbbbbbbaaaaaaaaaaaa'],
};

/** Verified user corrections become a small on-device template cache, not a trained model. */
const CACHE_KEY = 'mahjong-game-glyphs-v1';
const validGlyph = (glyph: unknown): glyph is string =>
  typeof glyph === 'string' && /^[0-9a-f]{192}$/.test(glyph);
export const loadVerifiedGlyphs = (): Record<string, string[]> => {
  try {
    if (typeof window === 'undefined') return {};
    const data: unknown = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const result: Record<string, string[]> = {};
    for (const [key, raw] of Object.entries(data)) {
      if (!TILE_OPTIONS.some(t => t.key === key) || !Array.isArray(raw)) continue;
      result[key] = raw.filter(validGlyph).slice(-4);
    }
    return result;
  } catch {
    return {};
  }
};

export const storeVerifiedGlyphs = (slots: ScreenshotTile[]): void => {
  try {
    if (typeof window === 'undefined') return;
    const previous = loadVerifiedGlyphs();
    for (const slot of slots) {
      if (!slot.key || !TILE_OPTIONS.some(t => t.key === slot.key) || !validGlyph(slot.glyph)) continue;
      const samples = previous[slot.key] ?? [];
      if (!samples.includes(slot.glyph)) previous[slot.key] = [...samples, slot.glyph].slice(-4);
    }
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(previous));
  } catch {
    // Local storage may be disabled or full: the screenshot importer must remain usable.
  }
};

/** Mean absolute luminance-quantization mismatch (0..15). Strictly a distance, not model confidence. */
export const glyphDistance = (a: string, b: string): number => {
  if (a.length !== 192 || b.length !== 192) return Infinity;
  let total = 0;
  for (let i = 0; i < 192; i++) total += Math.abs(parseInt(a[i], 16) - parseInt(b[i], 16));
  return total / 192;
};

export const classifyGlyph = (glyph: string, verified: Record<string, string[]> = {}): { key: string | null; distance: number | null } => {
  const keys = new Set([...Object.keys(REFERENCE_GLYPHS), ...Object.keys(verified)]);
  const matches = [...keys].map(key => ({
    key,
    distance: Math.min(...[...(REFERENCE_GLYPHS[key] ?? []), ...(verified[key] ?? [])]
      .filter(validGlyph).map(e => glyphDistance(glyph, e))),
  }))
    .sort((a, b) => a.distance - b.distance);
  const best = matches[0], second = matches[1];
  // Reject unseen designs / incomplete tiles; no guesses on out-of-distribution images.
  return best && best.distance <= 0.42 && (!second || second.distance - best.distance >= 0.15)
    ? best : { key: null, distance: Number.isFinite(best?.distance) ? best.distance : null };
};

const isPale = (data: Uint8ClampedArray, x: number, y: number, width: number): boolean => {
  const i = (y * width + x) * 4;
  const r = data[i], g = data[i + 1], b = data[i + 2];
  return r > 145 && g > 140 && b > 115 && Math.max(r, g, b) - Math.min(r, g, b) < 70;
};

export const locateFaceTop = (pixels: Uint8ClampedArray, x: number, width = 2048): number | null => {
  for (let y = 1010; y < 1120; y++) {
    let ok = true;
    for (const dx of [-38, 35]) for (const dy of [0, 2, 4, 6]) {
      if (!isPale(pixels, x + dx, y + dy, width)) ok = false;
    }
    if (ok) return y;
  }
  return null;
};

export const isScreenshotRatio = (width: number, height: number): boolean =>
  width >= 1000 && height >= 600 && Math.abs(width / height - 1.6) < 0.04;

/** Screen/file snapshot -> 13 baseline hand slots + optional separated 14th tile. */
export const recognizeMcrScreenshot = async (file: File): Promise<ScreenshotTile[]> => {
  const bitmap = await createImageBitmap(file);
  try {
    if (!isScreenshotRatio(bitmap.width, bitmap.height)) {
      throw new Error('当前仅支持 16:10 横屏游戏截图（与示例相同布局）');
    }
    const canvas = document.createElement('canvas');
    canvas.width = REFERENCE_SIZE.width;
    canvas.height = REFERENCE_SIZE.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('无法读取截图像素');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const patch = document.createElement('canvas');
    patch.width = 12;
    patch.height = 16;
    const pctx = patch.getContext('2d', { willReadFrequently: true });
    if (!pctx) throw new Error('无法创建识别画布');
    const thumb = document.createElement('canvas');
    thumb.width = 96; thumb.height = 145;
    const tctx = thumb.getContext('2d');
    if (!tctx) throw new Error('无法创建预览');
    const results: ScreenshotTile[] = [];
    const verified = loadVerifiedGlyphs();
    for (const [index, x] of HAND_CENTERS.entries()) {
      const top = locateFaceTop(pixels, x);
      if (top === null) {
        // The separate 14th tile is optional (13-tile turn). The baseline 13 must exist.
        if (index < 13) throw new Error(`未找到第 ${index + 1} 张手牌，请使用相同游戏视角并确保手牌无遮挡`);
        break;
      }
      pctx.clearRect(0, 0, 12, 16);
      pctx.drawImage(canvas, x - 38, top + 27, 77, 127, 0, 0, 12, 16);
      const px = pctx.getImageData(0, 0, 12, 16).data;
      let glyph = '';
      for (let i = 0; i < px.length; i += 4) {
        const luma = .299 * px[i] + .587 * px[i + 1] + .114 * px[i + 2];
        glyph += Math.floor(luma / 16).toString(16);
      }
      const guess = classifyGlyph(glyph, verified);
      tctx.clearRect(0, 0, thumb.width, thumb.height);
      tctx.drawImage(canvas, x - 59, top - 6, 118, 175, 0, 0, thumb.width, thumb.height);
      results.push({ index, key: guess.key, suggested: guess.key, distance: guess.distance,
        preview: thumb.toDataURL('image/jpeg', .78), glyph });
    }
    return results;
  } finally {
    bitmap.close();
  }
};
