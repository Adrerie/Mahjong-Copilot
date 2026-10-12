/**
 * Real table photos are not game screenshots: users mark the four corners of
 * their own visible hand strip (top-left, top-right, bottom-right, bottom-left).
 * We only rectify and split the selection; no unverifiable tile guesses.
 * Nothing is uploaded or persisted. Future models can consume the same crops.
 */
export interface PhotoPoint { x: number; y: number } // normalized 0..1
export type HandCorners = [PhotoPoint, PhotoPoint, PhotoPoint, PhotoPoint];

export const quadArea = (points: readonly PhotoPoint[]): number => {
  if (points.length !== 4) return 0;
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const next = points[(i + 1) % 4];
    sum += points[i].x * next.y - next.x * points[i].y;
  }
  return Math.abs(sum) / 2;
};

export const validHandCorners = (points: readonly PhotoPoint[]): points is HandCorners =>
  points.length === 4 &&
  points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) &&
    p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1) &&
  quadArea(points) >= 0.001 &&
  // A closed, consistently wound, non-crossing quadrilateral.
  [0, 1, 2, 3].every(i => {
    const a = points[i], b = points[(i + 1) % 4], c = points[(i + 2) % 4];
    return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) > 0;
  });

/** Interpolate the strip to upright tiles, retaining strict left-to-right order. */
export const stripPoint = (points: HandCorners, u: number, v: number): PhotoPoint => {
  const top = { x: points[0].x * (1 - u) + points[1].x * u,
    y: points[0].y * (1 - u) + points[1].y * u };
  const bottom = { x: points[3].x * (1 - u) + points[2].x * u,
    y: points[3].y * (1 - u) + points[2].y * u };
  return { x: top.x * (1 - v) + bottom.x * v,
    y: top.y * (1 - v) + bottom.y * v };
};

/**
 * Bilinear quadrilateral rectification for visual, manually labelled thumbnails.
 * This is not a calibrated projective homography and has no classification accuracy claim.
 */
export const splitPhotoHand = async (
  file: File, corners: HandCorners, tileCount: 13 | 14,
): Promise<string[]> => {
  if (!validHandCorners(corners)) throw new Error('手牌四角无效，请按顺时针方向重新选择');
  if (file.size > 25 * 1024 * 1024) throw new Error('照片不能超过25 MB');
  const bitmap = await createImageBitmap(file);
  try {
    const cap = 2400;
    const ratio = Math.min(1, cap / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('无法读取照片');
    ctx.drawImage(bitmap, 0, 0, width, height);
    const input = ctx.getImageData(0, 0, width, height).data;
    const outWidth = 88, outHeight = 124;
    const out = document.createElement('canvas');
    out.width = outWidth; out.height = outHeight;
    const octx = out.getContext('2d');
    if (!octx) throw new Error('无法生成手牌预览');
    const thumbs: string[] = [];
    for (let index = 0; index < tileCount; index++) {
      const pixels = octx.createImageData(outWidth, outHeight);
      for (let y = 0; y < outHeight; y++) {
        for (let x = 0; x < outWidth; x++) {
          const u = (index + (x + 0.5) / outWidth) / tileCount;
          const v = (y + 0.5) / outHeight;
          const pt = stripPoint(corners, u, v);
          const sx = Math.max(0, Math.min(width - 1, Math.round(pt.x * (width - 1))));
          const sy = Math.max(0, Math.min(height - 1, Math.round(pt.y * (height - 1))));
          const si = (sy * width + sx) * 4;
          const di = (y * outWidth + x) * 4;
          pixels.data[di] = input[si];
          pixels.data[di + 1] = input[si + 1];
          pixels.data[di + 2] = input[si + 2];
          pixels.data[di + 3] = 255;
        }
      }
      octx.putImageData(pixels, 0, 0);
      thumbs.push(out.toDataURL('image/jpeg', 0.84));
    }
    return thumbs;
  } finally {
    bitmap.close();
  }
};
