import React, { useState } from 'react';
import { Suit, Tile, GameMode, Language } from '../types';
import { createTile, SUIT_LABELS } from '../constants';
import TileUI from './TileUI';

interface TileSelectorProps {
  mode: GameMode;
  lang: Language;
  onSelect: (tile: Tile) => void;
  disabled?: boolean;
}

const TileSelector: React.FC<TileSelectorProps> = ({ mode, lang, onSelect, disabled }) => {
  const [activeTab, setActiveTab] = useState<Suit>(Suit.Man);

  // Filter tabs based on mode
  const tabs = [Suit.Man, Suit.Pin, Suit.Sou];
  if (mode === GameMode.MCR) {
    tabs.push(Suit.Zihai);
  }

  if (mode === GameMode.Sichuan && activeTab === Suit.Zihai) {
    setActiveTab(Suit.Man);
  }

  const renderTiles = () => {
    const tiles: { suit: Suit; value: number }[] = [];
    const max = activeTab === Suit.Zihai ? 7 : 9;
    
    for (let i = 1; i <= max; i++) {
      tiles.push({ suit: activeTab, value: i });
    }

    return (
      <div className="grid grid-cols-5 sm:grid-cols-9 gap-1 px-1 py-4 w-full h-full place-items-center">
        {tiles.map((t) => (
          <div key={`${t.suit}${t.value}`} className="active:scale-95 transition-transform w-full h-full">
             <TileUI 
                tile={t} 
                size="responsive"
                className="shadow-[0_2px_0_0_rgba(0,0,0,0.1)] active:shadow-none active:translate-y-0.5"
                onClick={() => !disabled && onSelect(createTile(t.suit, t.value))} 
             />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-blue-50 overflow-hidden mt-2">
      {/* Tabs */}
      <div className="flex bg-blue-50/50 p-1 gap-1">
        {tabs.map((suit) => (
          <button
            key={suit}
            onClick={() => setActiveTab(suit)}
            className={`flex-1 py-3 text-sm font-black rounded-xl transition-all
              ${activeTab === suit 
                ? 'bg-white text-[#1A237E] shadow-sm ring-1 ring-black/5' 
                : 'text-gray-400 hover:text-[#1A237E] hover:bg-white/50'
              }
            `}
          >
            {SUIT_LABELS[lang][suit]}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="h-48 overflow-y-auto no-scrollbar bg-white p-2">
        {renderTiles()}
      </div>
    </div>
  );
};

export default TileSelector;