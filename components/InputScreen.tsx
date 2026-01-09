import React, { useState, useMemo } from 'react';
import { GameMode, GameState, Suit, Tile, Meld, AnalysisResult, Language } from '../types';
import { createTile, SUIT_LABELS, INITIAL_WALL_MCR, INITIAL_WALL_SICHUAN, TEXT, THEME } from '../constants';
import { sortTiles, analyzeGame, countTiles } from '../utils/mahjongLogic';
import TileSelector from './TileSelector';
import TileUI from './TileUI';
import AnalysisResultModal from './AnalysisResultModal';

interface Props {
  mode: GameMode;
  lang: Language;
  setLang: (l: Language) => void;
  onBack: () => void;
}

const InputScreen: React.FC<Props> = ({ mode, lang, setLang, onBack }) => {
  const [wallCount, setWallCount] = useState(mode === GameMode.MCR ? INITIAL_WALL_MCR : INITIAL_WALL_SICHUAN);
  const [voidSuit, setVoidSuit] = useState<Suit | null>(null);
  const [hand, setHand] = useState<Tile[]>([]);
  const [melds, setMelds] = useState<Meld[]>([]);
  const [discards, setDiscards] = useState<Tile[]>([]);
  
  // Logic Control
  const [meldType, setMeldType] = useState<'chi' | 'pong' | 'gang'>('pong');
  const [activeZone, setActiveZone] = useState<'hand' | 'melds' | 'discards'>('hand');
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  const t = TEXT[lang];

  const sortedHand = useMemo(() => sortTiles(hand), [hand]);
  const sortedDiscards = useMemo(() => sortTiles(discards), [discards]);

  const tileCounts = useMemo(() => {
     return countTiles([...hand, ...discards, ...melds.flatMap(m => m.tiles)]);
  }, [hand, discards, melds]);

  const totalTiles = hand.length + melds.length * 3;

  // --- Handlers ---

  const activateZone = (zone: 'hand' | 'melds' | 'discards') => {
      setActiveZone(zone);
      setShowKeyboard(true);
  };

  const addTile = (tile: Tile) => {
    const key = `${tile.value}${tile.suit}`;
    const currentCount = tileCounts.get(key) || 0;
    
    if (activeZone === 'hand') {
      if (totalTiles >= 14) return; // Basic check
      setHand(prev => [...prev, tile]);
    } else if (activeZone === 'discards') {
      setDiscards(prev => [...prev, tile]);
    } else {
         // Adding to Melds
         let tilesToAdd: Tile[] = [];
         
         if (meldType === 'pong') {
            if (currentCount > 1) return;
            tilesToAdd = [tile, createTile(tile.suit, tile.value), createTile(tile.suit, tile.value)];
         } else if (meldType === 'gang') {
            if (currentCount > 0) return;
            tilesToAdd = [tile, createTile(tile.suit, tile.value), createTile(tile.suit, tile.value), createTile(tile.suit, tile.value)];
         } else if (meldType === 'chi') {
             if (tile.suit === Suit.Zihai || tile.value > 7) return;
             tilesToAdd = [
                 tile,
                 createTile(tile.suit, tile.value + 1),
                 createTile(tile.suit, tile.value + 2)
             ];
         }

         if (tilesToAdd.length > 0) {
            setMelds(prev => [...prev, { id: Math.random().toString(), type: meldType, tiles: tilesToAdd }]);
         }
    }
  };

  const removeTile = (id: string, zone: 'hand' | 'discards') => {
    if (zone === 'hand') setHand(prev => prev.filter(t => t.id !== id));
    if (zone === 'discards') setDiscards(prev => prev.filter(t => t.id !== id));
  };

  const removeMeld = (id: string) => {
    setMelds(prev => prev.filter(m => m.id !== id));
  };

  const handleReset = () => {
    if (confirm(t.resetConfirm)) {
      setHand([]);
      setMelds([]);
      setDiscards([]);
      setWallCount(mode === GameMode.MCR ? INITIAL_WALL_MCR : INITIAL_WALL_SICHUAN);
      setVoidSuit(null);
    }
  };

  const handleAnalyze = () => {
    const gameState: GameState = { mode, wallCount, voidSuit, hand, melds, discards };
    setAnalysis(analyzeGame(gameState, lang));
    setShowKeyboard(false);
  };

  return (
    <div className={`flex flex-col h-screen bg-gradient-to-b ${THEME.bgGradient}`}>
      
      {/* 1. Header */}
      <div className="bg-white border-b-2 border-blue-100 z-10 px-4 py-3 shadow-sm shrink-0">
        <div className="flex items-center justify-between mb-2">
          <button onClick={onBack} className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full hover:bg-gray-200">
             <span className="text-xl">←</span>
          </button>
          
          <div className="flex gap-2">
             <button onClick={() => setLang('en')} className={`text-xs font-bold px-2 py-1 rounded ${lang === 'en' ? 'bg-[#1A237E] text-white' : 'text-gray-400'}`}>EN</button>
             <button onClick={() => setLang('zh')} className={`text-xs font-bold px-2 py-1 rounded ${lang === 'zh' ? 'bg-[#1A237E] text-white' : 'text-gray-400'}`}>中文</button>
          </div>
        </div>
        
        <div className="flex justify-between items-end">
            <div>
                <h1 className="text-[#1A237E] font-black text-2xl leading-none">{t[mode === GameMode.MCR ? 'mcr' : 'sichuan']}</h1>
            </div>
            <button onClick={handleReset} className="text-xs font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors">
                {t.reset} 🗑️
            </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 mt-4 bg-blue-50 p-2 rounded-xl">
            <div className="flex-1">
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{t.wallTiles}</p>
                <div className="flex items-center gap-2">
                    <button onClick={() => setWallCount(c => Math.max(0, c-1))} className="w-6 h-6 bg-white rounded shadow text-[#1A237E] font-bold">-</button>
                    <span className="font-mono text-xl font-bold text-[#1A237E]">{wallCount}</span>
                    <button onClick={() => setWallCount(c => c+1)} className="w-6 h-6 bg-white rounded shadow text-[#1A237E] font-bold">+</button>
                </div>
            </div>
            {mode === GameMode.Sichuan && (
                <div className="flex flex-col items-end">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">{t.voidSuit}</p>
                    <div className="flex gap-1">
                        {[Suit.Man, Suit.Sou, Suit.Pin].map(s => (
                            <button key={s} onClick={() => setVoidSuit(s === voidSuit ? null : s)} className={`w-8 h-8 rounded-lg font-bold text-sm transition-all border-2 ${voidSuit === s ? 'bg-[#FF006E] border-[#FF006E] text-white shadow-neu-sm' : 'bg-white border-gray-200 text-gray-400'}`}>
                                {SUIT_LABELS[lang][s]}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* 2. Scrollable Canvas */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-32">
        
        {/* === COMBINED PLAYER AREA === */}
        <div className="bg-white rounded-3xl border-2 border-blue-100 shadow-sm transition-all duration-300 overflow-hidden">
            
            {/* Header: Label + Count */}
            <div className="flex justify-between items-center px-4 py-2 border-b border-gray-100 bg-gray-50/30">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#1A237E]"></span>
                    <span className="text-xs font-black text-gray-500 uppercase tracking-wider">{t.handArea}</span>
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
                            <div key={m.id} onClick={(e) => { e.stopPropagation(); removeMeld(m.id); }} className="relative bg-white/50 p-1 rounded-lg border border-blue-100/50 flex gap-[1px] active:scale-95 transition-transform">
                                {m.tiles.map((t, i) => (
                                    <div key={`${m.id}-${i}`} className="w-5 sm:w-6 lg:w-7">
                                        <TileUI tile={t} size="responsive" />
                                    </div>
                                ))}
                                <span className="absolute bottom-0 right-0 bg-white/90 text-[7px] font-bold px-1 rounded-tl text-[#1A237E] uppercase shadow-sm">{m.type.charAt(0)}</span>
                            </div>
                        ))}
                     </div>
                </div>

                {/* --- HAND ZONE --- */}
                <div 
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
                            <div key={tile.id} className="w-9 sm:w-11" onClick={(e) => { e.stopPropagation(); removeTile(tile.id, 'hand'); }}>
                                <TileUI tile={tile} size="responsive" className="active:opacity-50" />
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
            onClick={() => activateZone('discards')}
            className={`
                bg-white rounded-2xl p-4 transition-all duration-300 border-2 min-h-[120px] mt-4
                ${activeZone === 'discards' && showKeyboard ? 'border-[#1A237E] shadow-lg' : 'border-transparent shadow-sm opacity-80 scale-[0.99]'}
            `}
        >
            <h2 className="text-[#1A237E] font-bold text-lg mb-3">{t.discards}</h2>
            <div className="flex flex-wrap gap-1">
                {sortedDiscards.map((t) => (
                   <div key={t.id} className="w-8 sm:w-9" onClick={(e) => { e.stopPropagation(); removeTile(t.id, 'discards'); }}>
                        <TileUI tile={t} size="responsive" className="active:opacity-50" />
                   </div>
                ))}
                {discards.length === 0 && (!showKeyboard || activeZone !== 'discards') && <p className="text-gray-300 text-sm italic">{t.emptyRiver}</p>}
            </div>
        </div>
      </div>

      {/* 3. Floating Action Button (Analysis) - Always Visible */}
      <div className={`fixed bottom-6 right-6 z-30 transition-all duration-300 ${showKeyboard ? 'opacity-0 pointer-events-none translate-y-10' : 'opacity-100 translate-y-0'}`}>
            <button 
                onClick={handleAnalyze}
                className="bg-[#CCFF00] text-black font-black text-lg px-8 py-4 rounded-full border-2 border-black shadow-neu hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
            >
                <span>✨</span> {t.analyze}
            </button>
      </div>

      {/* 4. Slide-up Keyboard */}
      <div className={`
          fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-xl border-t border-blue-100 rounded-t-3xl shadow-[0_-4px_30px_rgba(0,0,0,0.1)] z-40 pb-6 pt-2 px-2
          transform transition-transform duration-300 ease-out
          ${showKeyboard ? 'translate-y-0' : 'translate-y-full'}
      `}>
         {/* Keyboard Header / Controls */}
         <div className="flex justify-between items-center px-4 py-2 border-b border-gray-100 mb-2">
             <div className="flex items-center gap-2">
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
                            <button onClick={() => setMeldType('chi')} className={`px-2 py-0.5 rounded text-xs font-bold ${meldType === 'chi' ? 'bg-white shadow text-[#1A237E]' : 'text-gray-400'}`}>Chi</button>
                        )}
                        <button onClick={() => setMeldType('pong')} className={`px-2 py-0.5 rounded text-xs font-bold ${meldType === 'pong' ? 'bg-white shadow text-[#1A237E]' : 'text-gray-400'}`}>Pong</button>
                        <button onClick={() => setMeldType('gang')} className={`px-2 py-0.5 rounded text-xs font-bold ${meldType === 'gang' ? 'bg-white shadow text-[#1A237E]' : 'text-gray-400'}`}>Gang</button>
                    </div>
                 )}
             </div>
             <button onClick={() => setShowKeyboard(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-1 rounded-full text-xs font-bold">Done</button>
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