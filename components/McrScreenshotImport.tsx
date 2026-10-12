import React, { useMemo, useState } from 'react';
import { Tile, Language } from '../types';
import { createTile } from '../constants';
import {
  recognizeMcrScreenshot, ScreenshotTile, TILE_OPTIONS,
} from '../utils/mcrScreenshot';

interface Props {
  lang: Language;
  onApply: (hand: Tile[]) => void;
}

/** Preview and repair a single 13+drawn screenshot. Never alter the game state before confirmation. */
const McrScreenshotImport: React.FC<Props> = ({ lang, onApply }) => {
  const [slots, setSlots] = useState<ScreenshotTile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const zh = lang === 'zh';
  const known = slots.filter(s => s.key !== null).length;
  const duplicates = useMemo(() => {
    const count = new Map<string, number>();
    for (const slot of slots) if (slot.key) count.set(slot.key, (count.get(slot.key) ?? 0) + 1);
    return [...count.entries()].filter(([, n]) => n > 4).map(([k]) => TILE_OPTIONS.find(o => o.key === k)?.name ?? k);
  }, [slots]);
  const ready = (slots.length === 13 || slots.length === 14) && known === slots.length && duplicates.length === 0;

  const readFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setSlots([]); setError('');
    try {
      setSlots(await recognizeMcrScreenshot(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const select = (index: number, key: string) => {
    setSlots(previous => previous.map(slot => slot.index === index ? { ...slot, key: key || null } : slot));
  };

  const apply = () => {
    if (!ready) return;
    const tiles: Tile[] = slots.map(slot => {
      const info = TILE_OPTIONS.find(option => option.key === slot.key)!;
      return createTile(info.suit, info.value);
    });
    onApply(tiles);
  };

  return (
    <details className="bg-white rounded-2xl border-2 border-blue-100 shadow-sm p-3">
      <summary className="cursor-pointer font-black text-sm text-[#1A237E]">
        {zh ? '从国标麻将截图导入手牌（实验功能）' : 'Import hand from MCR screenshot (experimental)'}
      </summary>
      <p className="text-xs text-gray-500 mt-2 mb-3">
        {zh
          ? '仅适配所提供的 16:10 横屏布局：底部13张及右侧单独摸入牌。现有样本只覆盖11种牌面；不认识的牌必须逐张修正。截图仅在本机处理，导入后可撤销。'
          : 'For the supplied 16:10 landscape layout only: 13 hand tiles and optional separate draw. Reference samples cover only 11 faces; correct unknown tiles manually. Images stay on-device.'}
      </p>
      <label className="inline-flex cursor-pointer rounded-lg bg-[#1A237E] text-white font-bold text-sm px-4 py-2">
        {busy ? (zh ? '识别中…' : 'Scanning…') : (zh ? '选择游戏截图' : 'Choose game screenshot')}
        <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
          disabled={busy} onChange={event => { void readFile(event.target.files?.[0]); event.target.value = ''; }} />
      </label>
      {error && <p role="alert" className="text-red-600 text-xs mt-2">{error}</p>}
      {!!slots.length && (
        <>
          <p className="text-xs text-gray-600 mt-3 mb-2">
            {zh ? `识别到 ${slots.length} 张，其中 ${known} 张已填写。请逐张核对后再导入。`
              : `Found ${slots.length} slots; ${known} assigned. Review all before importing.`}
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {slots.map(slot => (
              <div key={slot.index} className="border border-gray-200 rounded-lg p-1 text-center min-w-0">
                <div className="text-[10px] text-gray-500 font-bold">
                  {slot.index === 13 ? (zh ? '摸入' : 'Draw') : `#${slot.index + 1}`}
                </div>
                <img src={slot.preview} alt={`tile slot ${slot.index + 1}`}
                  className="w-full h-16 object-contain bg-green-900 rounded" />
                <select aria-label={`${zh ? '修正第' : 'Correct slot'} ${slot.index + 1}`}
                  value={slot.key ?? ''} onChange={event => select(slot.index, event.target.value)}
                  className={`w-full text-xs mt-1 px-0.5 py-1 border rounded ${slot.key ? 'border-gray-200 bg-white' : 'border-amber-500 bg-amber-50'}`}>
                  <option value="">{zh ? '待确认' : 'Unknown'}</option>
                  {TILE_OPTIONS.map(opt => <option key={opt.key} value={opt.key}>{opt.name}</option>)}
                </select>
              </div>
            ))}
          </div>
          {!!duplicates.length && <p role="alert" className="text-red-600 text-xs mt-2">
            {zh ? `同种牌超过4张：${duplicates.join('、')}` : `More than 4 of: ${duplicates.join(', ')}`}
          </p>}
          <button type="button" onClick={apply} disabled={!ready}
            className="mt-3 rounded-lg bg-[#CCFF00] border-2 border-black text-black font-black px-4 py-2 text-sm disabled:opacity-40">
            {zh ? `确认并替换暗手（${slots.length}张）` : `Import checked hand (${slots.length})`}
          </button>
          <p className="text-[11px] text-gray-500 mt-1">
            {zh
              ? '导入将清空旧副露和牌河，以免旧局面混入新截图；保留牌墙数，可点撤销返回原局面。'
              : 'Import clears previous melds/river to prevent mixing rounds; wall count is retained. Undo restores the prior state.'}
          </p>
        </>
      )}
    </details>
  );
};

export default McrScreenshotImport;
