import React from 'react';
import { Tile, Suit } from '../types';

interface TileUIProps {
  tile: Tile | { suit: Suit; value: number };
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'responsive';
  selected?: boolean;
  highlight?: boolean;
  className?: string;
}

const TileUI: React.FC<TileUIProps> = ({ tile, onClick, size = 'md', selected = false, highlight = false, className = '' }) => {
  
  // Tailwind classes don't support dynamic aspect-ratio perfectly in all flex contexts without height, 
  // but 'aspect-[3/4]' is standard.
  const sizeClasses = {
    sm: 'w-8',
    md: 'w-11', 
    lg: 'w-14', 
    xl: 'w-20',
    responsive: 'w-full', 
  };

  const currentSizeClass = sizeClasses[size] || sizeClasses.md;

  // --- SVG Renderers for Precision ---
  
  const C = {
      R: '#D32F2F', // Red
      G: '#2E7D32', // Green
      B: '#1565C0', // Blue
  };

  const renderMan = (value: number) => {
    const chars = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
    // Use SVG Text to ensure perfect scaling ratio regardless of container size
    return (
      <svg viewBox="0 0 100 127" className="w-full h-full">
         {/* Number Character */}
         <text 
            x="50" y="55" 
            textAnchor="middle" 
            dominantBaseline="central"
            fill={C.R}
            fontFamily="'Noto Serif SC', serif"
            fontWeight="900"
            fontSize="65" 
            style={{ letterSpacing: '-5px' }}
         >
            {chars[value - 1]}
         </text>
         {/* Wan Character */}
         <text 
            x="50" y="100" 
            textAnchor="middle" 
            dominantBaseline="central"
            fill={C.R}
            fontFamily="'Noto Serif SC', serif"
            fontWeight="900"
            fontSize="32" 
            opacity="0.9"
         >
            萬
         </text>
      </svg>
    );
  };

  const renderPin = (value: number) => {
    const r = 12; 
    const circles: React.ReactElement[] = [];
    const add = (cx: number, cy: number, fill: string, stroke: boolean = false) => {
        circles.push(
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={fill} stroke={stroke ? "white" : "none"} strokeWidth={stroke ? 2 : 0} />
        );
    };

    if (value === 1) {
        return (
            <svg viewBox="0 0 100 127" className="w-full h-full p-2">
                <circle cx="50" cy="63.5" r="45" fill={C.G} />
                <circle cx="50" cy="63.5" r="25" fill={C.R} />
                <path d="M50 28.5 L56 50 L80 50 L60 68 L68 90 L50 78 L32 90 L40 68 L20 50 L44 50 Z" fill="white" opacity="0.8"/>
            </svg>
        );
    }
    // ... (Patterns same as before, condensed for brevity but preserved logic)
    if (value === 2) { add(50, 30, C.B); add(50, 97, C.G); }
    else if (value === 3) { add(20, 20, C.B); add(50, 63.5, C.R); add(80, 107, C.G); }
    else if (value === 4) { add(25, 30, C.B); add(75, 30, C.G); add(25, 97, C.G); add(75, 97, C.B); }
    else if (value === 5) { add(20, 25, C.B); add(80, 25, C.G); add(50, 63.5, C.R); add(20, 102, C.G); add(80, 102, C.B); }
    else if (value === 6) { add(25, 30, C.G); add(75, 30, C.G); add(25, 63.5, C.R); add(75, 63.5, C.R); add(25, 97, C.R); add(75, 97, C.R); }
    else if (value === 7) { add(20, 40, C.G); add(50, 25, C.G); add(80, 10, C.G); add(30, 75, C.R); add(70, 75, C.R); add(30, 105, C.R); add(70, 105, C.R); }
    else if (value === 8) { [30, 63.5, 97].forEach(y => { if (y !== 63.5) { add(25, y, C.B); add(75, y, C.B); } }); add(25, 55, C.B); add(75, 55, C.B); add(25, 80, C.B); add(75, 80, C.B); }
    else if (value === 9) { [30, 63.5, 97].forEach(y => { add(20, y, y===63.5 ? C.R : C.B); add(50, y, y===63.5 ? C.R : C.B); add(80, y, y===63.5 ? C.R : C.B); }); }

    return <svg viewBox="0 0 100 127" className="w-full h-full p-1">{circles}</svg>;
  };

  const renderSou = (value: number) => {
    if (value === 1) {
        return (
            <div className="flex items-center justify-center w-full h-full pb-2">
                 <div className="absolute inset-0 flex items-center justify-center pt-2">
                    <span className="text-4xl lg:text-5xl filter drop-shadow-md">🦚</span>
                 </div>
            </div>
        );
    }

    const sticks: React.ReactElement[] = [];
    const w = 8;
    const stick = (x: number, y: number, h: number, color: string, rotate: number = 0) => {
        const transform = rotate ? `rotate(${rotate}, ${x + w/2}, ${y + h/2})` : '';
        sticks.push(<rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx={2} fill={color} transform={transform} />);
    };

    if (value === 2) { stick(46, 20, 40, C.G); stick(46, 70, 40, C.B); }
    else if (value === 3) { stick(46, 20, 30, C.G); stick(26, 60, 30, C.B); stick(66, 60, 30, C.B); }
    else if (value === 4) { stick(26, 20, 40, C.G); stick(66, 20, 40, C.G); stick(26, 70, 40, C.B); stick(66, 70, 40, C.B); }
    else if (value === 5) { stick(20, 20, 35, C.G); stick(72, 20, 35, C.G); stick(46, 50, 30, C.R, 45); stick(20, 75, 35, C.B); stick(72, 75, 35, C.B); }
    else if (value === 6) { stick(20, 20, 35, C.G); stick(46, 20, 35, C.G); stick(72, 20, 35, C.G); stick(20, 70, 35, C.B); stick(46, 70, 35, C.B); stick(72, 70, 35, C.B); }
    else if (value === 7) { stick(20, 50, 30, C.R); stick(46, 50, 30, C.R); stick(72, 50, 30, C.R); stick(46, 85, 30, C.B); stick(20, 10, 35, C.G); stick(46, 10, 35, C.G); stick(72, 10, 35, C.G); }
    else if (value === 8) { stick(15, 20, 30, C.G, 30); stick(35, 20, 30, C.G); stick(55, 20, 30, C.G); stick(75, 20, 30, C.G, -30); stick(15, 70, 30, C.B, -30); stick(35, 70, 30, C.B); stick(55, 70, 30, C.B); stick(75, 70, 30, C.B, 30); }
    else if (value === 9) { stick(20, 10, 30, C.G); stick(46, 10, 30, C.G); stick(72, 10, 30, C.G); stick(20, 50, 30, C.R); stick(46, 50, 30, C.R); stick(72, 50, 30, C.R); stick(20, 90, 30, C.B); stick(46, 90, 30, C.B); stick(72, 90, 30, C.B); }

    return <svg viewBox="0 0 100 127" className="w-full h-full p-2">{sticks}</svg>;
  };

  const getIcon = () => {
      const { suit, value } = tile;
      let content;
      
      if (suit === Suit.Man) content = renderMan(value);
      else if (suit === Suit.Pin) content = renderPin(value);
      else if (suit === Suit.Sou) content = renderSou(value);
      else {
          const honors = ['', '東', '南', '西', '北', '白', '發', '中'];
          const color = value === 5 ? C.B : value === 6 ? C.G : value === 7 ? C.R : 'black';
          
          if (value === 5) {
               // White Dragon (Bai) - Blue Frame
               content = (
                 <div className="w-full h-full flex items-center justify-center">
                    <div className="w-[80%] h-[80%] border-4 border-[#1565C0] rounded-sm"></div>
                 </div>
               );
          } else {
               content = (
                 <svg viewBox="0 0 100 127" className="w-full h-full">
                     <text 
                        x="50" y="63.5" 
                        textAnchor="middle" 
                        dominantBaseline="central"
                        fill={color === 'black' ? '#000' : color}
                        fontFamily="'Noto Serif SC', serif"
                        fontWeight="900"
                        fontSize="75" 
                     >
                        {honors[value]}
                     </text>
                 </svg>
               );
          }
      }

      // Corner Number (Arabic) - Consistent for all non-honors
      const showCorner = suit !== Suit.Zihai;
      const cornerColor = suit === Suit.Man ? 'text-[#D32F2F]' : suit === Suit.Sou ? 'text-[#2E7D32]' : 'text-[#1565C0]';

      return (
        <div className="w-full h-full relative flex flex-col items-center justify-center p-0.5 overflow-hidden">
            {showCorner && (
                <span className={`absolute top-0.5 left-1 text-[10px] font-black ${cornerColor} font-mono leading-none z-10`}>
                    {value}
                </span>
            )}
            {content}
        </div>
      );
  };

  return (
    <div
      onClick={onClick}
      className={`
        relative aspect-[3/4] flex flex-col items-center justify-center 
        bg-white rounded-lg shadow-[1px_2px_4px_rgba(0,0,0,0.15)] 
        border border-gray-200
        select-none cursor-pointer transition-all duration-100 antialiased
        ${currentSizeClass}
        ${selected ? '-translate-y-1 ring-2 ring-[#CCFF00] shadow-[1px_4px_8px_rgba(0,0,0,0.2)]' : 'hover:-translate-y-0.5 active:translate-y-0'}
        ${highlight ? 'ring-4 ring-[#CCFF00] animate-pop' : ''}
        ${className}
      `}
    >
      {getIcon()}
      {/* 3D Bottom Edge */}
      <div className="absolute bottom-0 left-0 right-0 h-[6%] bg-gray-300 rounded-b-lg opacity-50 pointer-events-none"></div>
    </div>
  );
};

export default TileUI;