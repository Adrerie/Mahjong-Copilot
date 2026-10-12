import React, { useEffect, useMemo, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { createTile } from '../constants';
import { Language, Tile } from '../types';
import { TILE_OPTIONS } from '../utils/mcrScreenshot';

interface RawBox { label: string; confidence: number; x1: number; y1: number; x2: number; y2: number }
type Region = 'unassigned' | 'hand' | 'river' | 'ignore';
interface ReviewedBox extends RawBox { region: Region; key: string | null; id: number }
interface DetectorBridge {
  status(): Promise<{ available: boolean; reason?: string; classes?: number }>;
  detect(input: { image: string }): Promise<{ detections: RawBox[]; elapsedMs: number }>;
}
const detector = registerPlugin<DetectorBridge>('RealTableDetector');
const optionFor = (key: string | null) => TILE_OPTIONS.find(t => t.key === key);
const overlaps = (a: RawBox, b: RawBox): boolean => {
  const w = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const h = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1), areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  return areaA + areaB - w * h > 0 && w * h / (areaA + areaB - w * h) > 0.55;
};

interface Props {
  lang: Language;
  onApply: (hand: Tile[], visibleRiver: Tile[]) => void;
}

/** No automatically assigned region; all candidate tiles must be reviewed before committing. */
const RealTableImport: React.FC<Props> = ({ lang, onApply }) => {
  const zh = lang === 'zh';
  const [availability, setAvailability] = useState<'checking' | 'ready' | 'unavailable'>('checking');
  const [status, setStatus] = useState('');
  const [photo, setPhoto] = useState('');
  const [boxes, setBoxes] = useState<ReviewedBox[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') {
      setAvailability('unavailable');
      setStatus('Available in Android APK with a locally packaged ONNX model');
      return;
    }
    void detector.status().then(result => {
      setAvailability(result.available ? 'ready' : 'unavailable');
      setStatus(result.available ? `ONNX · ${result.classes} classes` : (result.reason ?? 'Model missing'));
    }).catch(e => {
      setAvailability('unavailable');
      setStatus(String(e));
    });
  }, []);

  const selected = boxes.filter(b => b.region === 'hand' || b.region === 'river');
  const hand = boxes.filter(b => b.region === 'hand').sort((a, b) => a.x1 - b.x1);
  const river = boxes.filter(b => b.region === 'river');
  const handKeys = [...hand.map(b => b.key), ...missing.filter(Boolean)];
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const key of [...selected.map(b => b.key), ...missing]) if (key) {
      result.set(key, (result.get(key) ?? 0) + 1);
    }
    return [...result.values()].some(v => v > 4);
  }, [boxes, missing]);
  const conflicts = selected.some((a, i) => selected.slice(i + 1).some(b => overlaps(a, b)));
  const ready = [13, 14].includes(handKeys.length) && handKeys.every(Boolean) &&
    river.every(b => !!b.key) && !counts && !conflicts;

  const read = async (file?: File) => {
    if (!file || availability !== 'ready') return;
    setError(''); setBoxes([]); setMissing([]); setBusy(true); setPhoto(''); setDuration(null);
    try {
      const bitmap = await createImageBitmap(file);
      const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Cannot create image canvas');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      const result = await detector.detect({ image: dataUrl });
      setPhoto(dataUrl);
      setDuration(result.elapsedMs);
      setBoxes(result.detections.map((b, id) => ({
        ...b, id, region: 'unassigned',
        key: optionFor(b.label)?.key ?? null,
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const update = (id: number, patch: Partial<ReviewedBox>) =>
    setBoxes(old => old.map(b => b.id === id ? { ...b, ...patch } : b));

  const apply = () => {
    if (!ready) return;
    const toTile = (key: string | null): Tile => {
      const entry = optionFor(key);
      if (!entry) throw new Error('Unknown tile');
      return createTile(entry.suit, entry.value);
    };
    onApply(handKeys.map(toTile), river.map(b => toTile(b.key)));
  };

  return (
    <details className="bg-white rounded-2xl border-2 border-blue-100 p-3">
      <summary className="cursor-pointer text-sm font-black text-[#1A237E]">
        {zh ? '真实牌桌照片 · 本机 YOLO（实验功能）' : 'Real-table photo · offline YOLO (experimental)'}
      </summary>
      <p className="mt-2 text-xs text-gray-600">
        {zh ? '只读本地相册。识别框、牌面及区域均须人工确认；默认不认定任何一张属于自己或牌河。漏识别牌可补录。此入口不推断时间顺序。'
          : 'On-device photos only. Review every box, tile, and region. Nothing is auto-assigned; add missed hand tiles manually. No chronology is inferred.'}
      </p>
      <p className="mt-1 text-xs text-gray-500">{availability === 'checking' ? 'Checking local model…' : status}</p>
      {availability === 'ready' && (
        <label className="inline-flex rounded-lg bg-[#1A237E] text-white text-sm font-bold px-4 py-2 mt-2 cursor-pointer">
          {busy ? (zh ? '识别中…' : 'Detecting…') : (zh ? '选择牌桌照片' : 'Choose photo')}
          <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp"
            disabled={busy} onChange={e => { void read(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      {photo && (
        <>
          <p className="mt-2 text-xs text-gray-500">
            {zh ? `检出 ${boxes.length} 个候选 · ${duration ?? '?'} ms（不代表准确率）` :
              `${boxes.length} candidates · ${duration ?? '?'} ms (not accuracy)`}
          </p>
          <div className="relative mt-2">
            <img src={photo} alt="locally selected mahjong table" className="w-full" />
            {boxes.map(box => (
              <div key={box.id} className="absolute border-2 border-amber-400 pointer-events-none"
                style={{ left: `${box.x1 * 100}%`, top: `${box.y1 * 100}%`,
                  width: `${(box.x2 - box.x1) * 100}%`, height: `${(box.y2 - box.y1) * 100}%` }}>
                <span className="absolute -top-3 left-0 text-[9px] bg-white text-black">{box.id + 1}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 max-h-72 overflow-y-auto space-y-1">
            {boxes.map(box => (
              <div className="flex gap-2 items-center text-xs" key={box.id}>
                <span className="w-9 shrink-0 text-gray-500">#{box.id + 1}</span>
                <span className="w-20 truncate" title={box.label}>{box.label} · {Math.round(box.confidence * 100)}%</span>
                <select aria-label={`Region ${box.id + 1}`} className="min-w-0 flex-1 border rounded p-1"
                  value={box.region} onChange={e => update(box.id, { region: e.target.value as Region })}>
                  <option value="unassigned">{zh ? '未分配' : 'Unassigned'}</option>
                  <option value="hand">{zh ? '本人手牌' : 'My hand'}</option>
                  <option value="river">{zh ? '已确认牌河' : 'Confirmed river'}</option>
                  <option value="ignore">{zh ? '忽略' : 'Ignore'}</option>
                </select>
                <select aria-label={`Tile ${box.id + 1}`} className="min-w-0 flex-1 border rounded p-1"
                  value={box.key ?? ''} onChange={e => update(box.id, { key: e.target.value || null })}>
                  <option value="">{zh ? '未知/红五' : 'Unknown/red five'}</option>
                  {TILE_OPTIONS.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1">
            <p className="text-xs font-bold">{zh ? '补录漏检的本人手牌' : 'Add missed hand tiles'}</p>
            {missing.map((key, index) => (
              <div className="flex gap-2" key={index}>
                <select className="flex-1 border rounded p-1 text-xs" value={key}
                  onChange={e => setMissing(old => old.map((x, i) => i === index ? e.target.value : x))}>
                  <option value="">{zh ? '选择牌面' : 'Choose face'}</option>
                  {TILE_OPTIONS.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
                </select>
                <button type="button" onClick={() => setMissing(old => old.filter((_, i) => i !== index))}
                  className="px-2 border rounded">{zh ? '删除' : 'Remove'}</button>
              </div>
            ))}
            <button type="button" disabled={handKeys.length >= 14}
              onClick={() => setMissing(old => [...old, ''])}
              className="text-xs underline disabled:opacity-40">{zh ? '+ 补一张手牌' : '+ Missing tile'}</button>
          </div>
          {(counts || conflicts) && (
            <p role="alert" className="text-xs text-red-700 mt-2">
              {zh ? '已分配候选存在重复框或同牌超过四张，请修正或忽略误检框。' : 'Assigned boxes overlap or exceed four copies. Review duplicates.'}
            </p>
          )}
          <button type="button" disabled={!ready} onClick={apply}
            className="mt-3 rounded-lg bg-[#CCFF00] border-2 border-black text-black font-black px-3 py-2 text-sm disabled:opacity-40">
            {zh ? `确认导入 ${handKeys.length} 张暗手 + ${river.length} 张已见牌` :
              `Confirm ${handKeys.length} hand + ${river.length} visible river tiles`}
          </button>
          <p className="mt-1 text-[11px] text-gray-500">
            {zh ? '仅使用已核对的牌。公共牌只作为可见数量，不能据此推断出牌先后；确认后替换当前局面，可撤销。'
              : 'Only reviewed tiles are recorded. River tile order is unknown. Replaces the current state; undo is available.'}
          </p>
        </>
      )}
    </details>
  );
};

export default RealTableImport;
