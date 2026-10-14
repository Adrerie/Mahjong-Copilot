import React, { useMemo, useState } from 'react';
import { GameMode, Tile, Language } from '../types';
import { createTile } from '../constants';
import { compareHandSnapshots } from '../utils/gameSnapshot';
import {
  recognizeMcrScreenshot, ScreenshotTile, TILE_OPTIONS, storeVerifiedGlyphs,
} from '../utils/mcrScreenshot';

interface Props {
  mode: GameMode;
  lang: Language;
  currentHand: Tile[];
  canContinue: boolean;
  onApply: (hand: Tile[], mode: 'replace' | 'continue', confirmedDiscard?: string) => boolean;
}

/** Preview and repair a single 13+drawn screenshot. Never alter the game state before confirmation. */
const McrScreenshotImport: React.FC<Props> = ({ mode, lang, onApply, currentHand, canContinue }) => {
  const [slots, setSlots] = useState<ScreenshotTile[]>([]);
  const [busy, setBusy] = useState(false);
  const [recordDiscard, setRecordDiscard] = useState(false);
  const [error, setError] = useState('');
  const zh = lang === 'zh';
  const sichuan = mode === GameMode.Sichuan;
  const known = slots.filter(s => s.key !== null).length;
  const duplicates = useMemo(() => {
    const count = new Map<string, number>();
    for (const slot of slots) if (slot.key) count.set(slot.key, (count.get(slot.key) ?? 0) + 1);
    return [...count.entries()].filter(([, n]) => n > 4).map(([k]) => TILE_OPTIONS.find(o => o.key === k)?.name ?? k);
  }, [slots]);
  const ready = (slots.length === 13 || slots.length === 14) && known === slots.length && duplicates.length === 0;
  const delta = useMemo(() => ready && canContinue && [13, 14].includes(currentHand.length)
    ? compareHandSnapshots(currentHand.map(t => `${t.suit}${t.value}`), slots.map(s => s.key!))
    : null, [ready, canContinue, currentHand, slots]);

  const readFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setSlots([]); setError(''); setRecordDiscard(false);
    try {
      setSlots(await recognizeMcrScreenshot(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const select = (index: number, key: string) => {
    setRecordDiscard(false);
    setSlots(previous => previous.map(slot => slot.index === index ? { ...slot, key: key || null } : slot));
  };

  const apply = (mode: 'replace' | 'continue') => {
    if (!ready) return;
    const tiles: Tile[] = slots.map(slot => {
      const info = TILE_OPTIONS.find(option => option.key === slot.key)!;
      return createTile(info.suit, info.value);
    });
    const committed = onApply(tiles, mode, mode === 'continue' && recordDiscard && delta?.kind === 'discard'
      ? delta.removed[0] : undefined);
    if (committed) storeVerifiedGlyphs(slots);
  };

  return (
    <details className="bg-white rounded-2xl border-2 border-blue-100 shadow-sm p-3">
      <summary className="cursor-pointer font-black text-sm text-[#1A237E]">
        {zh
          ? (sichuan ? '从四川血战截图导入手牌（实验功能）' : '从国标麻将截图导入手牌（实验功能）')
          : (sichuan ? 'Import hand from Sichuan screenshot (experimental)' : 'Import hand from MCR screenshot (experimental)')}
      </summary>
      <p className="text-xs text-gray-500 mt-2 mb-3">
        {zh
          ? (sichuan
            ? '仍按 16:10 横屏布局找底部13张及右侧单独摸入牌；四川截图若布局不同，槽位要逐张修正或改用手动录入。现有样本只覆盖11种牌面，不认识的牌必须逐张修正。定缺不会被推断，导入后请在下方核验缺门。截图仅在本机处理，导入可撤销。'
            : '仅适配所提供的 16:10 横屏布局：底部13张及右侧单独摸入牌。现有样本只覆盖11种牌面；不认识的牌必须逐张修正。截图仅在本机处理；确认后的牌面可作为少量本地识别样本（非训练），导入可撤销。')
          : (sichuan
            ? 'Still assumes the 16:10 landscape layout: 13 bottom tiles plus an optional separate draw. If a Sichuan screenshot differs, correct every slot or enter tiles manually. Only 11 faces have samples. The void suit is never inferred; verify it below after importing.'
            : 'For the supplied 16:10 landscape layout only: 13 hand tiles and optional separate draw. Reference samples cover only 11 faces; correct unknown tiles manually. Images stay on-device.')}
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
          {delta && (
            <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-2 text-xs">
              {zh ? '与当前手牌对比：' : 'Compared with current hand: '}
              {delta.kind === 'draw' ? (zh ? '多一张摸入牌' : 'one drawn tile') :
                delta.kind === 'discard' ? (zh ? '少一张牌（需确认是否打出）' : 'one missing tile (confirm discard)') :
                delta.kind === 'unchanged' ? (zh ? '手牌未改变' : 'hand unchanged') :
                (zh ? '变化不明确：可能跨过多个操作' : 'ambiguous change: actions may be missing')}
              {delta.kind === 'discard' && (
                <label className="block mt-2">
                  <input type="checkbox" checked={recordDiscard} onChange={e => setRecordDiscard(e.target.checked)} />
                  {' '}{zh ? '我确认减少的这一张是本次打出的牌，加入已见牌河' : 'I confirm the removed tile was discarded; add to visible river'}
                </label>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            <button type="button" onClick={() => apply('replace')} disabled={!ready}
              className="rounded-lg bg-[#CCFF00] border-2 border-black text-black font-black px-3 py-2 text-sm disabled:opacity-40">
              {zh
                ? (sichuan ? '作为新局面导入（需另行核验定缺）' : '作为新局面导入（重置旧记录）')
                : (sichuan ? 'Start new snapshot (verify void suit after)' : 'Start new snapshot (reset context)')}
            </button>
            {canContinue && (
              <button type="button" onClick={() => apply('continue')} disabled={!ready || !delta}
                className="rounded-lg border-2 border-[#1A237E] px-3 py-2 text-sm font-bold disabled:opacity-40">
                {zh ? '继续本局（保留牌河）' : 'Continue this round (keep river)'}
              </button>
            )}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            {zh ? '核对牌面后直接点击导入。继续本局不推断他人操作；新局面重置牌墙和牌河，可撤销。'
              : 'Review tile faces, then import. Continue does not infer other player actions. New snapshot resets wall and river. Undo is available.'}
          </p>
        </>
      )}
    </details>
  );
};

export default McrScreenshotImport;
