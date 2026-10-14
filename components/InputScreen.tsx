import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnalysisResult, GameMode, GameState, KongKind, Language, Meld, SichuanWinEvent, Suit, Tile, WinSource, Wind } from '../types';
import {
  INITIAL_WALL_MCR, INITIAL_WALL_SICHUAN, MAX_WALL_MCR, MAX_WALL_SICHUAN,
  SUIT_LABELS, TEXT, THEME, WIND_LABELS,
} from '../constants';
import { analyzeGame, sortTiles } from '../utils/mahjongLogic';
import { sichuanEventSource } from '../utils/inputValidation';
import {
  EntryMessage, decodeEntryState, emptyEntryState, encodeEntryState, entryStorageKey, planImportedState,
  planTextHand, planTileAdd, withConsistentContext,
} from '../utils/entryEditing';
import TileSelector from './TileSelector';
import TileUI from './TileUI';
import AnalysisResultModal from './AnalysisResultModal';
import McrScreenshotImport from './McrScreenshotImport';
import RealTableImport from './RealTableImport';
import { validateGameState } from '../utils/inputValidation';

interface Props {
  mode: GameMode;
  lang: Language;
  setLang: (l: Language) => void;
  onBack: () => void;
}

const wallLimit = (mode: GameMode): number => mode === GameMode.Sichuan ? MAX_WALL_SICHUAN : MAX_WALL_MCR;

const clampWall = (mode: GameMode, value: number): number =>
  Number.isFinite(value) ? Math.min(wallLimit(mode), Math.max(0, Math.floor(value))) : 0;

const emptyEntry = (mode: GameMode): GameState => emptyEntryState(mode);

/** 录入目标区域：国标多一个「和牌张」区域，点牌即选中手上已有的那张。 */
type EntryZone = 'hand' | 'melds' | 'discards' | 'winningTile';

const WINDS: Wind[] = [1, 2, 3, 4];

/** 杠类型三选：默认「未记录」，只有用户主动选择后才计明杠/暗杠/双明杠/双暗杠。 */
const KONG_KINDS: { value: KongKind; labelKey: 'kongExposed' | 'kongConcealed' | 'kongAdded' }[] = [
  { value: 'exposed', labelKey: 'kongExposed' },
  { value: 'concealed', labelKey: 'kongConcealed' },
  { value: 'added', labelKey: 'kongAdded' },
];

/** 副露角标：吃/碰用首字母，杠再标出已记录的明/暗/补。 */
const meldBadge = (meld: Meld, lang: Language): string => {
  if (meld.type !== 'gang') return meld.type.charAt(0).toUpperCase();
  const kind = KONG_KINDS.find(item => item.value === meld.kongKind);
  const labels = TEXT[lang];
  return kind ? `${TEXT.en.kongKind.charAt(0)}·${labels[kind.labelKey]}` : TEXT.en.kongKind.charAt(0);
};

/** 国标和牌方式的三个可选值：未记录时按「未知」处理，不计自摸/不求人/门前清。 */
const WIN_SOURCES: { value: WinSource; labelKey: 'winUnknown' | 'winSelfDraw' | 'winClaim' }[] = [
  { value: 'unknown', labelKey: 'winUnknown' },
  { value: 'selfDraw', labelKey: 'winSelfDraw' },
  { value: 'claim', labelKey: 'winClaim' },
];

/** Hi8 血战事件：只记录明确的事实，不把普通自摸自动算作加番。 */
const SICHUAN_EVENTS: { value: SichuanWinEvent; zh: string; en: string }[] = [
  { value: 'ordinary', zh: '普通和牌', en: 'Ordinary' },
  { value: 'kongBloom', zh: '杠上开花', en: 'Kong bloom' },
  { value: 'kongDiscard', zh: '杠上炮', en: 'Kong discard' },
  { value: 'robbingKong', zh: '抢杠胡', en: 'Robbing kong' },
  { value: 'lastDraw', zh: '海底捞月', en: 'Last draw' },
  { value: 'lastDiscard', zh: '海底炮', en: 'Last discard' },
];

/** 读取上次局面；损坏或旧格式返回 null，绝不用半截数据覆盖空局面。 */
const loadEntry = (mode: GameMode): GameState => {
  try {
    return decodeEntryState(window.localStorage.getItem(entryStorageKey(mode)), mode) ?? emptyEntry(mode);
  } catch {
    return emptyEntry(mode);
  }
};

const InputScreen: React.FC<Props> = ({ mode, lang, setLang, onBack }) => {
  const [entry, setEntry] = useState<GameState>(() => loadEntry(mode));
  const [undoEntry, setUndoEntry] = useState<GameState | null>(null);
  const [entryError, setEntryError] = useState<EntryMessage | null>(null);
  const [textInput, setTextInput] = useState('');
  const [meldType, setMeldType] = useState<Meld['type']>('pong');
  const [meldKongKind, setMeldKongKind] = useState<KongKind | null>(null);
  const [activeZone, setActiveZone] = useState<EntryZone>('hand');
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  const t = TEXT[lang];
  const { hand, melds, discards, wallCount, voidSuit } = entry;

  const canvasRef = useRef<HTMLDivElement>(null);
  const keyboardRef = useRef<HTMLDivElement>(null);
  const meldsZoneRef = useRef<HTMLDivElement>(null);
  const handZoneRef = useRef<HTMLDivElement>(null);
  const discardsRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<HTMLDivElement>(null);

  const sortedHand = useMemo(() => sortTiles(hand), [hand]);
  const sortedDiscards = useMemo(() => sortTiles(discards), [discards]);
  const totalTiles = hand.length + melds.length * 3;

  // 局面按玩法存本地：初始值就来自存储，因此首次写入不会用空局面覆盖旧牌局。
  useEffect(() => {
    try {
      window.localStorage.setItem(entryStorageKey(mode), encodeEntryState(entry));
    } catch {
      // 无痕模式或配额不足时忽略，不影响录牌
    }
  }, [entry, mode]);

  // --- Handlers ---

  /** 唯一写入口：保留最近一次有效局面的一个快照，供一步撤销。 */
  const commit = (next: GameState) => {
    setUndoEntry(entry);
    // 和牌张随暗手失效；其余上下文保持不变
    setEntry(withConsistentContext(next));
    setEntryError(null);
  };

  const activateZone = (zone: EntryZone) => {
    setActiveZone(zone);
    setShowKeyboard(true);
    // 键盘是固定浮层，布局上不占空间；把当前区域滚到键盘上方，避免被挡住
    const target = zone === 'melds' ? meldsZoneRef.current
      : zone === 'hand' ? handZoneRef.current
      : zone === 'discards' ? discardsRef.current
      : contextRef.current;
    const canvas = canvasRef.current;
    if (!target || !canvas) return;
    requestAnimationFrame(() => {
      const panelHeight = keyboardRef.current?.getBoundingClientRect().height ?? 0;
      const visibleBottom = window.innerHeight - panelHeight - 8;
      const rect = target.getBoundingClientRect();
      if (rect.bottom > visibleBottom) canvas.scrollTop += rect.bottom - visibleBottom;
    });
  };

  const addTile = (tile: Tile) => {
    const plan = planTileAdd(entry, {
      zone: activeZone,
      meldType,
      tile,
      kongKind: meldType === 'gang' ? meldKongKind ?? undefined : undefined,
    });
    if (plan.outcome === 'rejected') {
      setEntryError(plan.message);
      return;
    }
    commit(plan.state);
  };

  const removeTile = (id: string, zone: 'hand' | 'discards') => {
    commit(zone === 'hand'
      ? { ...entry, hand: hand.filter(tile => tile.id !== id) }
      : { ...entry, discards: discards.filter(tile => tile.id !== id) });
  };

  const removeMeld = (id: string) => {
    commit({ ...entry, melds: melds.filter(meld => meld.id !== id) });
  };

  const handleUndo = () => {
    if (!undoEntry) return;
    setEntry(undoEntry);
    setUndoEntry(null);
    setEntryError(null);
  };

  const handleReset = () => {
    commit(emptyEntry(mode));
    setTextInput('');
    setAnalysis(null);
    setShowKeyboard(false);
  };

  const handleApplyText = () => {
    const plan = planTextHand(entry, textInput);
    if (plan.outcome === 'rejected') {
      setEntryError(plan.message);
      return;
    }
    commit(plan.state);
    setTextInput('');
  };

  const handleScreenshotHand = (hand: Tile[], importMode: 'replace' | 'continue', confirmedDiscard?: string) => {
    // Only verified snapshots update state; a single frame cannot supply a play timeline.
    const oldDiscard = confirmedDiscard && importMode === 'continue'
      ? entry.hand.find(t => `${t.suit}${t.value}` === confirmedDiscard)
      : undefined;
    const candidate = planImportedState(entry, mode, hand, { importMode, confirmedDiscard: oldDiscard });
    const errors = validateGameState(candidate, lang);
    if (errors.length) {
      setEntryError({ zh: validateGameState(candidate, 'zh')[0], en: validateGameState(candidate, 'en')[0] });
      return false;
    }
    commit(candidate);
    setTextInput('');
    setShowKeyboard(false);
    setAnalysis(analyzeGame(candidate, lang));
    return true;
  };

  const handleRealTable = (hand: Tile[], visibleRiver: Tile[]) => {
    // Only manually attributed boxes enter the engine. A still photo has no temporal order.
    const candidate = planImportedState(entry, mode, hand, { visibleRiver });
    const errors = validateGameState(candidate, lang);
    if (errors.length) {
      setEntryError({ zh: validateGameState(candidate, 'zh')[0], en: validateGameState(candidate, 'en')[0] });
      return;
    }
    commit(candidate);
    setShowKeyboard(false);
    setTextInput('');
    setAnalysis(analyzeGame(candidate, lang));
  };

  const handleAnalyze = () => {
    setAnalysis(analyzeGame(entry, lang));
    setShowKeyboard(false);
  };

  return (
    <div className={`mc-screen flex flex-col bg-gradient-to-b ${THEME.bgGradient}`}>

      {/* 1. Header */}
      <div className="mc-header bg-white border-b-2 border-blue-100 z-10 pb-3 shadow-sm shrink-0">
        <div className="flex items-center justify-between mb-2">
          <button onClick={onBack} aria-label={t.back} className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full hover:bg-gray-200">
             <span className="text-xl">←</span>
          </button>

          <div className="flex gap-2">
             <button onClick={() => setLang('en')} aria-pressed={lang === 'en'} className={`text-xs font-bold px-2 py-1 rounded ${lang === 'en' ? 'bg-[#1A237E] text-white' : 'text-gray-400'}`}>EN</button>
             <button onClick={() => setLang('zh')} aria-pressed={lang === 'zh'} className={`text-xs font-bold px-2 py-1 rounded ${lang === 'zh' ? 'bg-[#1A237E] text-white' : 'text-gray-400'}`}>中文</button>
          </div>
        </div>

        <div className="flex justify-between items-end">
            <div>
                <h1 className="text-[#1A237E] font-black text-2xl leading-none">{t[mode === GameMode.MCR ? 'mcr' : 'sichuan']}</h1>
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={handleUndo}
                    disabled={!undoEntry}
                    title={undoEntry ? undefined : t.undoEmpty}
                    className="text-xs font-bold text-[#1A237E] bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 disabled:opacity-40 disabled:hover:bg-blue-50 transition-colors"
                >
                    {t.undo} ↩︎
                </button>
                <button onClick={handleReset} className="text-xs font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors">
                    {t.reset} 🗑️
                </button>
            </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 mt-4 bg-blue-50 p-2 rounded-xl">
            <div className="flex-1">
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{t.wallTiles}</p>
                <div className="flex items-center gap-2">
                    <button onClick={() => commit({ ...entry, wallCount: clampWall(mode, wallCount - 1) })} disabled={wallCount <= 0} aria-label={`${t.wallTiles} -1`} className="w-6 h-6 bg-white rounded shadow text-[#1A237E] font-bold disabled:opacity-40">-</button>
                    <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={wallLimit(mode)}
                        value={wallCount}
                        aria-label={t.wallTiles}
                        onChange={(e) => commit({ ...entry, wallCount: clampWall(mode, Number(e.target.value)) })}
                        className="w-14 text-center font-mono text-xl font-bold text-[#1A237E] bg-transparent outline-none border-b border-transparent focus:border-[#1A237E] focus:bg-white/50 rounded px-1 transition-all no-spinner"
                    />
                    <button onClick={() => commit({ ...entry, wallCount: clampWall(mode, wallCount + 1) })} disabled={wallCount >= wallLimit(mode)} aria-label={`${t.wallTiles} +1`} className="w-6 h-6 bg-white rounded shadow text-[#1A237E] font-bold disabled:opacity-40">+</button>
                </div>
            </div>
            {mode === GameMode.MCR && (
                <div className="flex flex-col items-end">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">{t.winSource}</p>
                    <div className="flex gap-1">
                        {WIN_SOURCES.map(({ value, labelKey }) => {
                            const current = entry.winSource ?? 'unknown';
                            return (
                            <button
                                key={value}
                                onClick={() => commit({
                                    ...entry,
                                    winSource: value,
                                    // 换和牌方式时，已记录的杠后事件不再成立：杠上开花对应自摸、抢杠和对应点和，
                                    // 不跟着改就会把杠后事件悄悄换一个含义，所以改为回到「未记录」由用户重选。
                                    afterKong: value !== current && entry.afterKong === true ? null : entry.afterKong,
                                })}
                                aria-pressed={current === value}
                                aria-label={`${t.winSource} ${t[labelKey]}`}
                                className={`px-2 h-8 rounded-lg font-bold text-xs transition-all border-2 ${current === value ? 'bg-[#1A237E] border-[#1A237E] text-white shadow-neu-sm' : 'bg-white border-gray-200 text-gray-400'}`}
                            >
                                {t[labelKey]}
                            </button>
                            );
                        })}
                    </div>
                </div>
            )}
            {mode === GameMode.Sichuan && (
                <div className="flex flex-col items-end">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">{t.voidSuit}</p>
                    <div className="flex gap-1">
                        {[Suit.Man, Suit.Sou, Suit.Pin].map(s => (
                            <button key={s} onClick={() => commit({ ...entry, voidSuit: s === voidSuit ? null : s })} aria-pressed={voidSuit === s} aria-label={`${t.voidSuit} ${SUIT_LABELS[lang][s]}`} className={`w-8 h-8 rounded-lg font-bold text-sm transition-all border-2 ${voidSuit === s ? 'bg-[#FF006E] border-[#FF006E] text-white shadow-neu-sm' : 'bg-white border-gray-200 text-gray-400'}`}>
                                {SUIT_LABELS[lang][s]}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>

        {/* 录入失败原因：固定在顶部，避免键盘展开时被滚动带走 */}
        {entryError && (
            <div role="alert" className="mt-3 flex items-start gap-2 bg-red-50 border-2 border-red-200 rounded-xl px-3 py-2">
                <span className="flex-1 text-sm font-bold text-red-600 leading-snug">{entryError[lang]}</span>
                <button onClick={() => setEntryError(null)} aria-label={t.dismiss} className="shrink-0 w-5 h-5 rounded-full bg-white text-red-500 font-bold leading-none flex items-center justify-center border border-red-200">&times;</button>
            </div>
        )}
      </div>

      {/* 2. Scrollable Canvas：窄屏单列，平板/桌面（≥1000px）分两栏，不再整屏拉成一条 */}
      <div ref={canvasRef} className={`mc-canvas flex-1 overflow-y-auto no-scrollbar transition-[padding] duration-300 ${showKeyboard ? 'mc-canvas--keyboard' : ''}`}>
        <div className="mc-canvas-inner">
        <div className="mc-column">

        {/* === TEXT ENTRY === */}
        <div className="bg-white rounded-2xl border-2 border-blue-100 shadow-sm p-3">
            <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-[#CCFF00] border border-black"></span>
                <span className="text-xs font-black text-gray-500 uppercase tracking-wider">{t.textEntry}</span>
            </div>
            <p className="text-[10px] text-gray-400 font-bold mb-2">{t.textEntryHint}</p>
            <div className="flex gap-2">
                <input
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleApplyText(); }}
                    placeholder={t.textEntryPlaceholder}
                    aria-label={t.textEntry}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="flex-1 min-w-0 font-mono text-sm bg-blue-50/60 border-2 border-blue-100 rounded-xl px-3 py-2 outline-none focus:border-[#1A237E] focus:bg-white transition-colors"
                />
                <button type="button" onClick={handleApplyText} className="shrink-0 bg-[#1A237E] text-white font-bold text-sm px-4 py-2 rounded-xl border-2 border-black shadow-neu-sm active:scale-95 transition-transform">
                    {t.apply}
                </button>
            </div>
        </div>

        {(mode === GameMode.MCR || mode === GameMode.Sichuan) && (
          <McrScreenshotImport mode={mode} lang={lang} currentHand={hand} canContinue={melds.length === 0 && [13, 14].includes(hand.length)} onApply={handleScreenshotHand} />
        )}
        <RealTableImport lang={lang} onApply={handleRealTable} />

        {/* === SICHUAN WIN CONTEXT === */}
        {mode === GameMode.Sichuan && (
          <div className="bg-white rounded-2xl border-2 border-blue-100 shadow-sm p-3 space-y-3">
            <p className="text-xs font-black text-gray-500 uppercase tracking-wider">{t.winContext} · {lang === 'zh' ? '四川血战' : 'Sichuan'}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500 font-bold">{t.winSource}</span>
              {WIN_SOURCES.map(({ value, labelKey }) => (
                <button key={value} type="button" aria-pressed={(entry.winSource ?? 'unknown') === value}
                  onClick={() => commit({ ...entry, winSource: value,
                    sichuanWinEvent: entry.sichuanWinEvent && sichuanEventSource(entry.sichuanWinEvent) &&
                      sichuanEventSource(entry.sichuanWinEvent) !== value ? null : entry.sichuanWinEvent })}
                  className={`px-3 h-8 border-2 rounded-lg text-xs font-bold ${(entry.winSource ?? 'unknown') === value ? 'bg-[#1A237E] text-white border-[#1A237E]' : 'border-gray-200 text-gray-500'}`}>
                  {t[labelKey]}
                </button>
              ))}
            </div>
            <div>
              <p className="text-xs text-gray-500 font-bold mb-2">{lang === 'zh' ? '和牌事件（按 Hi8 规则）' : 'Win event (Hi8 rule)'}</p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" aria-pressed={!entry.sichuanWinEvent}
                  onClick={() => commit({ ...entry, sichuanWinEvent: null })}
                  className={`px-2.5 h-8 border-2 rounded-lg text-xs font-bold ${!entry.sichuanWinEvent ? 'bg-[#1A237E] text-white border-[#1A237E]' : 'border-gray-200 text-gray-500'}`}>
                  {t.notRecorded}
                </button>
                {SICHUAN_EVENTS.map(item => (
                  <button key={item.value} type="button" aria-pressed={entry.sichuanWinEvent === item.value}
                    disabled={item.value === 'kongBloom' && !entry.melds.some(m => m.type === 'gang')}
                    onClick={() => commit({ ...entry, sichuanWinEvent: item.value,
                      winSource: sichuanEventSource(item.value) ?? (entry.winSource ?? 'unknown') })}
                    className={`px-2.5 h-8 border-2 rounded-lg text-xs font-bold disabled:opacity-35 ${entry.sichuanWinEvent === item.value ? 'bg-[#FF006E] text-white border-[#FF006E]' : 'border-gray-200 text-gray-500'}`}>
                    {item[lang]}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[10px] text-gray-500">{lang === 'zh'
              ? '特殊事件各加1指数番；普通自摸不自动加番。海底捞月/海底炮只在牌墙剩最后一张时计入；杠分、包赔和多人结算暂不计。'
              : 'Special events add one exponent each; regular self-draw adds none. Last-tile events count only when the wall holds its final tile. Kong payments and settlement excluded.'}</p>
          </div>
        )}

        {/* === MCR WIN CONTEXT === */}
        {mode === GameMode.MCR && (
            <div
                ref={contextRef}
                onClick={() => activateZone('winningTile')}
                className={`bg-white rounded-2xl border-2 shadow-sm p-3 transition-colors ${activeZone === 'winningTile' && showKeyboard ? 'border-[#1A237E]' : 'border-blue-100'}`}
            >
                <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-[#FF006E] border border-black"></span>
                    <span className="text-xs font-black text-gray-500 uppercase tracking-wider">{t.winContext}</span>
                    <span className="text-[10px] text-gray-300 font-bold">{t.removeHint}</span>
                </div>

                {/* 和牌张：点本卡片后从下方键盘选一张已在暗手里的牌 */}
                <div className="flex items-center gap-2 mb-2" onClick={(e) => e.stopPropagation()}>
                    <span className="w-12 shrink-0 text-[10px] text-gray-500 font-bold uppercase tracking-wider">{t.winningTile}</span>
                    {entry.winningTile ? (
                        <div className="w-9 sm:w-10"><TileUI tile={entry.winningTile} size="responsive" /></div>
                    ) : (
                        <span className="text-[10px] text-gray-300 font-bold italic">{t.notRecorded}</span>
                    )}
                    <button
                        type="button"
                        onClick={() => activateZone('winningTile')}
                        aria-pressed={activeZone === 'winningTile' && showKeyboard}
                        aria-label={`${t.winningTile} ${t.pick}`}
                        className={`px-2 h-7 rounded-lg font-bold text-xs border-2 ${activeZone === 'winningTile' && showKeyboard ? 'bg-[#1A237E] border-[#1A237E] text-white shadow-neu-sm' : 'bg-white border-gray-200 text-gray-400'}`}
                    >{t.pick}</button>
                    <button
                        type="button"
                        onClick={() => commit({ ...entry, winningTile: null })}
                        disabled={!entry.winningTile}
                        aria-label={`${t.winningTile} ${t.clear}`}
                        className="px-2 h-7 rounded-lg font-bold text-xs border-2 bg-white border-gray-200 text-gray-400 disabled:opacity-40"
                    >{t.clear}</button>
                </div>

                {/* 门风 / 圈风 */}
                {([
                    { labelKey: 'seatWind' as const, value: entry.seatWind ?? null, apply: (wind: Wind | null) => ({ ...entry, seatWind: wind }) },
                    { labelKey: 'roundWind' as const, value: entry.roundWind ?? null, apply: (wind: Wind | null) => ({ ...entry, roundWind: wind }) },
                ]).map(({ labelKey, value, apply }) => (
                    <div key={labelKey} className="flex items-center gap-2 mb-2" onClick={(e) => e.stopPropagation()}>
                        <span className="w-12 shrink-0 text-[10px] text-gray-500 font-bold uppercase tracking-wider">{t[labelKey]}</span>
                        <div className="flex gap-1">
                            {WINDS.map(wind => (
                                <button
                                    key={wind}
                                    type="button"
                                    onClick={() => commit(apply(value === wind ? null : wind))}
                                    aria-pressed={value === wind}
                                    aria-label={`${t[labelKey]} ${WIND_LABELS[lang][wind - 1]}`}
                                    className={`w-8 h-8 rounded-lg font-bold text-sm border-2 transition-all ${value === wind ? 'bg-[#1A237E] border-[#1A237E] text-white shadow-neu-sm' : 'bg-white border-gray-200 text-gray-400'}`}
                                >{WIND_LABELS[lang][wind - 1]}</button>
                            ))}
                        </div>
                        {!value && <span className="text-[10px] text-gray-300 font-bold italic">{t.notRecorded}</span>}
                    </div>
                ))}

                {/* 末张：自摸最后一张记妙手回春，和最后一张点炮记海底捞月 */}
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <span className="w-12 shrink-0 text-[10px] text-gray-500 font-bold uppercase tracking-wider">{t.lastTile}</span>
                    <div className="flex gap-1">
                        <button type="button" onClick={() => commit({ ...entry, lastTile: null })} aria-pressed={entry.lastTile == null} className={`px-2 h-7 rounded-lg font-bold text-xs border-2 ${entry.lastTile == null ? 'bg-[#1A237E] border-[#1A237E] text-white shadow-neu-sm' : 'bg-white border-gray-200 text-gray-400'}`}>{t.notRecorded}</button>
                        <button type="button" onClick={() => commit({ ...entry, lastTile: true })} aria-pressed={entry.lastTile === true} className={`px-2 h-7 rounded-lg font-bold text-xs border-2 ${entry.lastTile === true ? 'bg-[#1A237E] border-[#1A237E] text-white shadow-neu-sm' : 'bg-white border-gray-200 text-gray-400'}`}>{t.yes}</button>
                        <button type="button" onClick={() => commit({ ...entry, lastTile: false })} aria-pressed={entry.lastTile === false} className={`px-2 h-7 rounded-lg font-bold text-xs border-2 ${entry.lastTile === false ? 'bg-[#1A237E] border-[#1A237E] text-white shadow-neu-sm' : 'bg-white border-gray-200 text-gray-400'}`}>{t.no}</button>
                    </div>
                </div>

                {/* 杠后和牌：先明确是/否，选「是」时自摸补张记杠上开花、点和加杠记抢杠和 */}
                <div className="flex items-center gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                    <span className="w-12 shrink-0 text-[10px] text-gray-500 font-bold uppercase tracking-wider">{t.afterKong}</span>
                    <div className="flex gap-1 flex-wrap">
                        <button type="button" onClick={() => commit({ ...entry, afterKong: null })} aria-pressed={entry.afterKong == null} className={`px-2 h-7 rounded-lg font-bold text-xs border-2 ${entry.afterKong == null ? 'bg-[#1A237E] border-[#1A237E] text-white shadow-neu-sm' : 'bg-white border-gray-200 text-gray-400'}`}>{t.notRecorded}</button>
                        <button type="button" onClick={() => commit({ ...entry, afterKong: false })} aria-pressed={entry.afterKong === false} className={`px-2 h-7 rounded-lg font-bold text-xs border-2 ${entry.afterKong === false ? 'bg-[#1A237E] border-[#1A237E] text-white shadow-neu-sm' : 'bg-white border-gray-200 text-gray-400'}`}>{t.no}</button>
                        <button type="button" onClick={() => commit({ ...entry, afterKong: true, winSource: 'selfDraw' })} aria-pressed={entry.afterKong === true && entry.winSource === 'selfDraw'} className={`px-2 h-7 rounded-lg font-bold text-xs border-2 ${entry.afterKong === true && entry.winSource === 'selfDraw' ? 'bg-[#1A237E] border-[#1A237E] text-white shadow-neu-sm' : 'bg-white border-gray-200 text-gray-400'}`}>{t.kongDrawWin}</button>
                        <button type="button" onClick={() => commit({ ...entry, afterKong: true, winSource: 'claim' })} aria-pressed={entry.afterKong === true && entry.winSource === 'claim'} className={`px-2 h-7 rounded-lg font-bold text-xs border-2 ${entry.afterKong === true && entry.winSource === 'claim' ? 'bg-[#1A237E] border-[#1A237E] text-white shadow-neu-sm' : 'bg-white border-gray-200 text-gray-400'}`}>{t.robKongWin}</button>
                    </div>
                </div>
            </div>
        )}
        </div>

        <div className="mc-column">

        {/* === COMBINED PLAYER AREA === */}
        <div className="bg-white rounded-3xl border-2 border-blue-100 shadow-sm transition-all duration-300 overflow-hidden">

            {/* Header: Label + Count */}
            <div className="flex justify-between items-center px-4 py-2 border-b border-gray-100 bg-gray-50/30">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#1A237E]"></span>
                    <span className="text-xs font-black text-gray-500 uppercase tracking-wider">{t.handArea}</span>
                    <span className="text-[10px] text-gray-300 font-bold">{t.removeHint}</span>
                </div>
                <div className="flex items-center gap-1">
                     <span className={`font-mono text-sm font-bold ${totalTiles > 14 ? 'text-red-500' : 'text-[#1A237E]'}`}>
                        {totalTiles}
                     </span>
                     <span className="text-xs text-gray-400 font-bold">/ 14</span>
                </div>
            </div>

            {/* Split Content Zone */}
            <div className="flex min-h-[160px]">

                {/* --- MELDS ZONE --- */}
                <div
                    ref={meldsZoneRef}
                    onClick={() => activateZone('melds')}
                    className={`
                        relative p-2 transition-all duration-200 cursor-pointer border-r-2 border-dashed flex flex-col justify-center
                        ${activeZone === 'melds' && showKeyboard
                            ? 'bg-purple-50/50 border-purple-200'
                            : 'hover:bg-gray-50 border-gray-100'
                        }
                        ${melds.length === 0 ? 'w-10' : 'min-w-fit max-w-[50%]'}
                    `}
                >
                     {/* Zone Label (only if empty or small) */}
                     {melds.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[10px] font-black text-gray-300 uppercase rotate-90 whitespace-nowrap tracking-widest">{t.melds}</span>
                        </div>
                     )}

                     <div className="flex flex-wrap gap-2 justify-center">
                        {melds.map((m) => (
                            /* 点整副只选中该区域，删除必须点右上角的 ×，避免误触丢一副 */
                            <div key={m.id} className="relative bg-white/50 p-1 rounded-lg border border-blue-100/50 flex gap-[1px]">
                                {m.tiles.map((tile, i) => (
                                    <div key={`${m.id}-${i}`} className="w-5 sm:w-6 lg:w-7">
                                        <TileUI tile={tile} size="responsive" />
                                    </div>
                                ))}
                                <span className="absolute bottom-0 right-0 bg-white/90 text-[7px] font-bold px-1 rounded-tl text-[#1A237E] uppercase shadow-sm">{meldBadge(m, lang)}</span>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); removeMeld(m.id); }}
                                    aria-label={`${t.removeMeld} (${m.type})`}
                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#FF006E] text-white text-xs font-black leading-none flex items-center justify-center border border-black shadow-neu-sm active:scale-90"
                                >&times;</button>
                            </div>
                        ))}
                     </div>
                </div>

                {/* --- HAND ZONE --- */}
                <div
                    ref={handZoneRef}
                    onClick={() => activateZone('hand')}
                    className={`
                        relative flex-1 p-3 transition-all duration-200 cursor-pointer
                        ${activeZone === 'hand' && showKeyboard
                            ? 'bg-blue-50/50'
                            : 'hover:bg-gray-50'
                        }
                    `}
                >
                    <div className="flex flex-wrap gap-1 content-start">
                        {sortedHand.map((tile) => (
                            <div key={tile.id} className="w-9 sm:w-11" onClick={(e) => e.stopPropagation()}>
                                <TileUI tile={tile} size="responsive" className="active:opacity-50"
                                    actionLabel={`${lang === 'zh' ? '删除手牌' : 'Remove from hand'} ${tile.value}${SUIT_LABELS[lang][tile.suit]}`}
                                    onClick={() => removeTile(tile.id, 'hand')} />
                            </div>
                        ))}
                        {hand.length === 0 && (
                            <div className="w-full h-full flex items-center justify-center">
                                <p className="text-gray-300 text-sm italic">{t.emptyHand}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>

        {/* Discards */}
        <div
            ref={discardsRef}
            onClick={() => activateZone('discards')}
            className={`
                bg-white rounded-2xl p-4 transition-all duration-300 border-2 min-h-[120px] mt-4
                ${activeZone === 'discards' && showKeyboard ? 'border-[#1A237E] shadow-lg' : 'border-transparent shadow-sm opacity-80 scale-[0.99]'}
            `}
        >
            <h2 className="text-[#1A237E] font-bold text-lg mb-3">{t.discards}</h2>
            <div className="flex flex-wrap gap-1">
                {sortedDiscards.map((tile) => (
                   <div key={tile.id} className="w-8 sm:w-9" onClick={(e) => e.stopPropagation()}>
                        <TileUI tile={tile} size="responsive" className="active:opacity-50"
                            actionLabel={`${lang === 'zh' ? '删除牌河' : 'Remove from river'} ${tile.value}${SUIT_LABELS[lang][tile.suit]}`}
                            onClick={() => removeTile(tile.id, 'discards')} />
                   </div>
                ))}
                {discards.length === 0 && (!showKeyboard || activeZone !== 'discards') && <p className="text-gray-300 text-sm italic">{t.emptyRiver}</p>}
            </div>
        </div>
        </div>
        </div>
      </div>

      {/* 3. Floating Action Button (Analysis) */}
      <div className={`mc-fab fixed z-30 transition-all duration-300 ${showKeyboard ? 'opacity-0 pointer-events-none translate-y-10' : 'opacity-100 translate-y-0'}`}>
            <button
                onClick={handleAnalyze}
                className="bg-[#CCFF00] text-black font-black text-lg px-8 py-4 rounded-full border-2 border-black shadow-neu hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
            >
                <span>✨</span> {t.analyze}
            </button>
      </div>

      {/* 4. Slide-up Keyboard */}
      <div ref={keyboardRef} className={`
          mc-keyboard fixed bottom-0 bg-white/95 backdrop-blur-xl border-t border-blue-100 rounded-t-3xl shadow-[0_-4px_30px_rgba(0,0,0,0.1)] z-40 pt-2
          transform transition-transform duration-300 ease-out
          ${showKeyboard ? 'translate-y-0' : 'translate-y-full'}
      `}>
         {/* Keyboard Header / Controls */}
         <div className="flex flex-wrap justify-between items-center gap-2 px-4 py-2 border-b border-gray-100 mb-2">
             <div className="flex items-center gap-2 flex-wrap">
                 <span className="text-[10px] uppercase font-bold text-gray-400">{t.addingTo}:</span>
                 <span className={`text-xs font-black uppercase px-2 py-0.5 rounded transition-colors ${
                     activeZone === 'melds' ? 'bg-purple-100 text-purple-700' :
                     activeZone === 'discards' ? 'bg-gray-100 text-gray-700' :
                     'bg-blue-100 text-[#1A237E]'
                 }`}>
                    {t[activeZone]}
                 </span>

                 {/* Meld Type Switcher within Keyboard */}
                 {activeZone === 'melds' && (
                    <div className="flex gap-1 ml-2 bg-gray-100 p-0.5 rounded-lg">
                        {mode === GameMode.MCR && (
                            <button onClick={() => setMeldType('chi')} aria-pressed={meldType === 'chi'} className={`px-2.5 py-1 rounded text-xs font-bold ${meldType === 'chi' ? 'bg-white shadow text-[#1A237E]' : 'text-gray-400'}`}>Chi</button>
                        )}
                        <button onClick={() => setMeldType('pong')} aria-pressed={meldType === 'pong'} className={`px-2.5 py-1 rounded text-xs font-bold ${meldType === 'pong' ? 'bg-white shadow text-[#1A237E]' : 'text-gray-400'}`}>Pong</button>
                        <button onClick={() => setMeldType('gang')} aria-pressed={meldType === 'gang'} className={`px-2.5 py-1 rounded text-xs font-bold ${meldType === 'gang' ? 'bg-white shadow text-[#1A237E]' : 'text-gray-400'}`}>Gang</button>
                    </div>
                 )}

                 {/* 杠类型：默认未记录，用户主动选明杠/暗杠/补杠后才计对应番种 */}
                 {activeZone === 'melds' && mode === GameMode.MCR && meldType === 'gang' && (
                    <div className="flex gap-1 ml-2 bg-gray-100 p-0.5 rounded-lg">
                        <button
                            onClick={() => setMeldKongKind(null)}
                            aria-pressed={meldKongKind === null}
                            aria-label={`${t.kongKind} ${t.notRecorded}`}
                            className={`px-2.5 py-1 rounded text-xs font-bold ${meldKongKind === null ? 'bg-white shadow text-[#1A237E]' : 'text-gray-400'}`}
                        >{t.notRecorded}</button>
                        {KONG_KINDS.map(({ value, labelKey }) => (
                            <button
                                key={value}
                                onClick={() => setMeldKongKind(value)}
                                aria-pressed={meldKongKind === value}
                                aria-label={`${t.kongKind} ${t[labelKey]}`}
                                className={`px-2.5 py-1 rounded text-xs font-bold ${meldKongKind === value ? 'bg-white shadow text-[#1A237E]' : 'text-gray-400'}`}
                            >{t[labelKey]}</button>
                        ))}
                    </div>
                 )}
             </div>
             <div className="flex items-center gap-2">
                 {/* 键盘展开时也能直接分析，不必先收起键盘 */}
                 <button type="button" onClick={handleAnalyze} className="bg-[#CCFF00] text-black font-black text-xs px-3 py-1.5 rounded-full border-2 border-black shadow-neu-sm active:scale-95 transition-transform">{t.analyze}</button>
                 <button onClick={() => setShowKeyboard(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-1 rounded-full text-xs font-bold">{t.done}</button>
             </div>
         </div>

         <div className="px-2">
             <TileSelector mode={mode} lang={lang} onSelect={addTile} />
         </div>
      </div>

      <AnalysisResultModal result={analysis} lang={lang} onClose={() => setAnalysis(null)} />
    </div>
  );
};

export default InputScreen;
