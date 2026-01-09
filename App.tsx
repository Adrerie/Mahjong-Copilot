import React, { useState } from 'react';
import { GameMode, Language } from './types';
import ModeSelection from './components/ModeSelection';
import InputScreen from './components/InputScreen';

const App: React.FC = () => {
  const [currentMode, setCurrentMode] = useState<GameMode | null>(null);
  const [lang, setLang] = useState<Language>('zh'); // Default to Chinese

  const handleModeSelect = (mode: GameMode) => {
    setCurrentMode(mode);
  };

  const handleBack = () => {
    setCurrentMode(null);
  };

  return (
    <div className="min-h-screen bg-[#F0F8FF] text-[#37474F] antialiased">
      {!currentMode ? (
        <ModeSelection onSelect={handleModeSelect} lang={lang} />
      ) : (
        <InputScreen mode={currentMode} lang={lang} setLang={setLang} onBack={handleBack} />
      )}
    </div>
  );
};

export default App;