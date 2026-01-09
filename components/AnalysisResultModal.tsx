
import React from 'react';
import { AnalysisResult, Language } from '../types';
import { TEXT } from '../constants';
import TileUI from './TileUI';

interface Props {
  result: AnalysisResult | null;
  lang: Language;
  onClose: () => void;
}

const AnalysisResultModal: React.FC<Props> = ({ result, lang, onClose }) => {
  if (!result) return null;
  const t = TEXT[lang];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#1A237E]/40 backdrop-blur-md p-2 sm:p-4 animate-fade-in">
      <div className="bg-white w-full max-w-2xl rounded-3xl border-2 border-black shadow-neu overflow-hidden max-h-[95vh] flex flex-col animate-pop">
        
        {/* Header */}
        <div className="p-4 sm:p-5 bg-white border-b-2 border-gray-100 flex justify-between items-center shrink-0">
          <div>
              <h2 className="text-2xl font-black text-[#1A237E]">{t.analysisTitle}</h2>
              <div className="flex gap-2 mt-1">
                 <span className={`px-2 py-0.5 rounded text-xs font-black border border-black shadow-[1px_1px_0_0_#000]
                    ${result.isReady ? 'bg-[#CCFF00] text-black' : 'bg-gray-100 text-gray-500'}
                `}>
                  {result.isReady ? t.ready : `${result.shanten} ${t.shanten}`}
                </span>
                {result.warnings.map((w, idx) => (
                   <span key={idx} className="bg-[#FF006E] text-white text-xs font-bold px-2 py-0.5 rounded transform -rotate-1">
                     {w}
                   </span>
                ))}
              </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-xl leading-none flex items-center justify-center pb-1">&times;</button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 no-scrollbar bg-gray-50/50">
          
          {/* 1. Best Discard Section */}
          {result.bestDiscard && (
            <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-2xl border border-blue-100 shadow-sm relative overflow-hidden">
               <div className="absolute right-0 top-0 w-32 h-32 bg-blue-50 rounded-full blur-2xl opacity-50 -translate-y-1/2 translate-x-1/3"></div>
               
               <div className="flex flex-col items-center sm:items-start min-w-[100px] gap-2 z-10">
                   <span className="text-xs font-black text-[#1A237E] uppercase tracking-wider bg-blue-50 px-2 py-1 rounded">{t.recDiscard}</span>
                   <div className="w-16 sm:w-20">
                      <TileUI tile={result.bestDiscard.tile} size="responsive" highlight />
                   </div>
               </div>
               
               <div className="flex-1 flex flex-col justify-center text-center sm:text-left z-10">
                   <p className="text-[#37474F] font-bold text-sm sm:text-base leading-relaxed mb-1">{t.discardHint}</p>
                   <p className="text-xs text-gray-400 font-mono">{result.bestDiscard.reason}</p>
                   <div className="mt-2 inline-flex items-center gap-2 self-center sm:self-start bg-green-50 text-green-700 px-3 py-1 rounded-lg border border-green-100">
                       <span className="text-xs font-bold uppercase">{t.efficiency}</span>
                       <span className="font-mono font-black">+15%</span>
                   </div>
               </div>
            </div>
          )}

          {/* 2. Target Patterns (List View) */}
          <div className="space-y-3">
             <div className="flex justify-between items-end px-1">
                 <h3 className="text-gray-400 text-xs font-black uppercase tracking-wider">{t.targetPatterns}</h3>
                 <span className="text-[10px] text-gray-400 font-bold uppercase">{t.totalFan}</span>
             </div>
             
             {result.suggestions.length === 0 && (
                <div className="text-center py-8 text-gray-400 text-sm italic bg-white rounded-xl border border-dashed border-gray-200">
                    No clear patterns detected yet.
                </div>
             )}

             {result.suggestions.map((sug, idx) => (
                 <div key={idx} className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-3">
                     
                     {/* Top Row: Name and Score */}
                     <div className="flex justify-between items-start border-b border-gray-50 pb-2">
                         <div className="flex items-start gap-2">
                            <div className="bg-[#1A237E] text-white w-5 h-5 mt-0.5 rounded flex items-center justify-center text-[10px] font-bold">
                                {idx + 1}
                            </div>
                            <div>
                                <span className="font-bold text-[#1A237E] block leading-tight">{sug.name}</span>
                                {/* Pattern Breakdown */}
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {sug.patternDetails.map((detail, dIdx) => (
                                        <span key={dIdx} className="text-[10px] bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded border border-blue-100">
                                            {detail}
                                        </span>
                                    ))}
                                </div>
                            </div>
                         </div>
                         <div className="text-right shrink-0 ml-2">
                             <span className="text-xl font-black text-[#FF006E]">{sug.fan}</span>
                             <span className="text-[10px] text-gray-400 font-bold uppercase ml-1">{t.fan}</span>
                         </div>
                     </div>

                     {/* Bottom Row: Missing Tiles + Probability */}
                     <div className="flex items-center justify-between gap-4">
                         
                         {/* Missing Tiles */}
                         <div className="flex-1">
                             <div className="text-[10px] text-gray-400 font-bold uppercase mb-1 flex items-center gap-1">
                                <span>{t.missing}</span>
                                <span className={`px-1 rounded text-white ${sug.missingTiles.length > 4 ? 'bg-red-300' : 'bg-green-400'}`}>
                                    {sug.missingTiles.length}
                                </span>
                             </div>
                             <div className="flex flex-wrap gap-1">
                                {sug.missingTiles.slice(0,6).map((tile, tIdx) => (
                                    <div key={tIdx} className="w-7 sm:w-8 opacity-90 hover:opacity-100 transition-opacity">
                                        <TileUI tile={tile} size="responsive" className="shadow-none border border-gray-200" />
                                    </div>
                                ))}
                                {sug.missingTiles.length > 6 && (
                                    <span className="text-xs text-gray-400 self-center">...</span>
                                )}
                             </div>
                         </div>

                         {/* Probability Bar */}
                         <div className="w-16 sm:w-24 text-right shrink-0">
                             <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">{t.prob}</div>
                             <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                 <div 
                                    className={`h-full rounded-full ${sug.probability > 60 ? 'bg-[#CCFF00]' : sug.probability > 30 ? 'bg-yellow-400' : 'bg-gray-300'}`} 
                                    style={{ width: `${Math.min(100, sug.probability)}%` }}
                                 ></div>
                             </div>
                             <span className="text-xs font-mono font-bold text-gray-600 mt-1 block">{sug.probability}%</span>
                         </div>
                     </div>
                 </div>
             ))}
          </div>

          {/* 3. Waiting Tiles (Only if Ready) */}
          {result.isReady && (
            <div>
              <h3 className="text-gray-400 text-xs font-black uppercase tracking-wider mb-3 ml-1">{t.waits}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {result.waitingTiles.map((wait, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white border-2 border-[#CCFF00] p-2 rounded-xl shadow-[2px_2px_0_0_#CCFF00]">
                    <div className="flex items-center gap-3">
                      <div className="w-9">
                         <TileUI tile={wait.tile} size="responsive" />
                      </div>
                      <div className="flex flex-col">
                          <span className="text-[10px] text-gray-400 font-bold uppercase">{t.left}</span>
                          <span className="text-[#1A237E] font-black text-lg">{wait.remaining}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="w-full bg-[#1A237E] text-white py-3 rounded-xl font-bold shadow-lg hover:shadow-xl active:scale-[0.98] transition-all">
            {t.backToGame}
          </button>
        </div>

      </div>
    </div>
  );
};

export default AnalysisResultModal;
