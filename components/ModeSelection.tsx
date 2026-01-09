import React from 'react';
import { GameMode, Language } from '../types';
import { TEXT, THEME } from '../constants';

interface Props {
  onSelect: (mode: GameMode) => void;
  lang: Language;
}

const ModeSelection: React.FC<Props> = ({ onSelect, lang }) => {
  const t = TEXT[lang];

  return (
    <div className={`h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br ${THEME.bgGradient}`}>
      
      <div className="mb-12 text-center">
        <div className="inline-block bg-[#CCFF00] px-4 py-1 rounded-full border-2 border-black shadow-neu-sm mb-4 transform -rotate-2">
            <span className="font-black text-xs tracking-widest uppercase">AI Assistant</span>
        </div>
        <h1 className="text-5xl font-black text-[#1A237E] mb-2 tracking-tight">
          Mahjong<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">Copilot</span>
        </h1>
      </div>

      <div className="w-full max-w-md space-y-6">
        {/* Card 1: MCR */}
        <button
          onClick={() => onSelect(GameMode.MCR)}
          className="group w-full relative overflow-hidden bg-white border-2 border-blue-100 hover:border-[#1A237E] rounded-3xl p-6 shadow-sm hover:shadow-neu transition-all duration-200 transform hover:-translate-y-1"
        >
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
             <span className="text-9xl font-serif">萬</span>
          </div>
          <div className="relative z-10 text-left">
            <div className="flex items-center gap-2 mb-2">
                <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                <h2 className="text-xl font-black text-[#1A237E]">{t.mcr}</h2>
            </div>
            <p className="text-gray-500 font-bold text-sm pl-5">{t.mcrDesc}</p>
          </div>
        </button>

        {/* Card 2: Sichuan */}
        <button
          onClick={() => onSelect(GameMode.Sichuan)}
          className="group w-full relative overflow-hidden bg-white border-2 border-red-100 hover:border-[#FF006E] rounded-3xl p-6 shadow-sm hover:shadow-neu transition-all duration-200 transform hover:-translate-y-1"
        >
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <span className="text-9xl font-serif">🀄</span>
          </div>
          <div className="relative z-10 text-left">
             <div className="flex items-center gap-2 mb-2">
                <span className="w-3 h-3 rounded-full bg-[#FF006E]"></span>
                <h2 className="text-xl font-black text-[#1A237E]">{t.sichuan}</h2>
             </div>
             <p className="text-gray-500 font-bold text-sm pl-5">{t.sichuanDesc}</p>
          </div>
        </button>
      </div>

      <div className="mt-16 text-gray-400 font-mono text-xs text-center">
        <p>Fresh Dopamine UI</p>
        <p className="opacity-50">v2.0.0</p>
      </div>
    </div>
  );
};

export default ModeSelection;