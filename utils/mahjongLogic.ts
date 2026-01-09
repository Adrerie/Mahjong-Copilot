
import { GameMode, GameState, Suit, Tile, AnalysisResult, FanSuggestion, Language, Meld } from '../types';
import { createTile, getTileKey, TEXT } from '../constants';

// --- Helper Functions ---

const sortTiles = (tiles: Tile[]): Tile[] => {
  const suitOrder = { [Suit.Man]: 1, [Suit.Pin]: 2, [Suit.Sou]: 3, [Suit.Zihai]: 4 };
  return [...tiles].sort((a, b) => {
    if (a.suit !== b.suit) return suitOrder[a.suit] - suitOrder[b.suit];
    return a.value - b.value;
  });
};

const countTiles = (tiles: Tile[]): Map<string, number> => {
  const counts = new Map<string, number>();
  tiles.forEach(t => {
    const key = getTileKey(t.suit, t.value);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
};

const getSuitCount = (tiles: Tile[], suit: Suit) => tiles.filter(t => t.suit === suit).length;

const getUniqueTiles = (tiles: Tile[]) => {
    const seen = new Set<string>();
    const unique: Tile[] = [];
    tiles.forEach(t => {
        const k = getTileKey(t.suit, t.value);
        if(!seen.has(k)) { seen.add(k); unique.push(t); }
    });
    return unique;
};

// Check if we have specific tile or meld containing it
const hasTileOrSeq = (hand: Tile[], melds: Meld[], suit: Suit, val: number): boolean => {
    // Check hand
    if (hand.some(t => t.suit === suit && t.value === val)) return true;
    // Check melds
    for (const m of melds) {
        if (m.type === 'chi') {
            const min = Math.min(...m.tiles.map(t => t.value));
            if (m.tiles[0].suit === suit && val >= min && val <= min + 2) return true;
        }
        if (m.type === 'pong' || m.type === 'gang') {
            if (m.tiles[0].suit === suit && m.tiles[0].value === val) return true;
        }
    }
    return false;
};

// Simplified sequence checker: returns cost to make a sequence
const costToMakeSeq = (hand: Tile[], melds: Meld[], suit: Suit, startVal: number): number => {
    // 1. Check existing Melds (Chi)
    const existingMeld = melds.find(m => m.type === 'chi' && m.tiles[0].suit === suit && Math.min(...m.tiles.map(t=>t.value)) === startVal);
    if (existingMeld) return 0;

    // 2. Check Hand
    // We need startVal, startVal+1, startVal+2
    let missing = 3;
    const v1 = hand.some(t => t.suit === suit && t.value === startVal);
    const v2 = hand.some(t => t.suit === suit && t.value === startVal + 1);
    const v3 = hand.some(t => t.suit === suit && t.value === startVal + 2);
    
    if (v1) missing--;
    if (v2) missing--;
    if (v3) missing--;
    
    return missing;
};

// Helper to get missing tiles for a sequence
const getMissingForSeq = (hand: Tile[], suit: Suit, startVal: number): Tile[] => {
    const needed = [startVal, startVal+1, startVal+2];
    const missing: Tile[] = [];
    needed.forEach(v => {
        if (!hand.some(t => t.suit === suit && t.value === v)) {
            // Check if we already added this value to missing (to avoid duplicates in naive check)
             if(!missing.some(m => m.suit === suit && m.value === v)) {
                 missing.push(createTile(suit, v));
             }
        }
    });
    // This simple check might duplicate if we need 2 of same, but for sequence we usually need distinct
    // Refinement: Remove found tiles from a temp array to handle duplicates correctly if hand has pairs?
    // For suggestions, simplified unique missing is usually okay.
    return missing;
};


// --- SICHUAN LOGIC ENGINE ---
// (Kept largely the same, just ensuring interface matches)

const analyzeSichuan = (hand: Tile[], melds: Meld[], voidSuit: Suit | null, lang: Language): FanSuggestion[] => {
    const t = TEXT[lang];
    const suggestions: FanSuggestion[] = [];
    const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
    const counts = countTiles(allTiles);

    if (voidSuit) {
        const hasVoid = allTiles.some(t => t.suit === voidSuit);
        if (hasVoid) {
            return [{
                name: t.huaZhu,
                fan: 0,
                baseFan: 0,
                probability: 0,
                missingTiles: [],
                patternDetails: [t.illegal],
                description: t.illegal
            }];
        }
    }

    let roots = 0;
    counts.forEach((val) => { if (val === 4) roots++; });

    const suits = new Set(allTiles.map(t => t.suit));
    const isFullFlush = suits.size === 1;

    let pairs = 0;
    let triplets = 0;
    counts.forEach((c) => { 
        if (c >= 2) pairs++; 
        if (c >= 3) triplets++;
    });

    const makeSichuanSug = (name: string, baseFan: number, missing: Tile[], prob: number) => {
        const finalFan = baseFan + roots; 
        const details = [`${name} (${baseFan})`];
        if (roots > 0) details.push(`${t.root} x${roots} (+${roots})`);
        
        suggestions.push({
            name: roots > 0 ? `${name} + ${roots}${t.root}` : name,
            fan: finalFan,
            baseFan: baseFan,
            probability: prob,
            missingTiles: missing,
            patternDetails: details
        });
    };

    if (isFullFlush) {
        if (pairs >= 5) {
             makeSichuanSug(t.qiDui, 4, [], 80);
        } else if (triplets + melds.length >= 3) {
             makeSichuanSug(t.qingDui, 6, [], 85);
        } else {
             makeSichuanSug(t.qingYiSe, 4, [], 90);
        }
    } else {
        let maxSuit = Suit.Man; 
        let maxC = 0;
        [Suit.Man, Suit.Pin, Suit.Sou].forEach(s => {
            const c = getSuitCount(allTiles, s);
            if(c > maxC) { maxC = c; maxSuit = s; }
        });
        
        if (maxC >= 9) {
            const missing: Tile[] = [createTile(maxSuit, 1)]; 
            makeSichuanSug(t.qingYiSe, 4, missing, maxC * 7);
        }
    }

    if (pairs >= 4 && melds.length === 0) {
        const missing: Tile[] = [];
        allTiles.forEach(tile => {
            if (counts.get(getTileKey(tile.suit, tile.value)) === 1) {
                if(missing.length < 3) missing.push(createTile(tile.suit, tile.value));
            }
        });
        const name = roots > 0 ? t.longQiDui : t.qiDui;
        makeSichuanSug(name, 4, missing, pairs * 12); 
    }

    if ((triplets + melds.length) >= 3 || pairs >= 5) {
        const missing: Tile[] = [createTile(allTiles[0].suit, allTiles[0].value)]; 
        const isQing = isFullFlush || (getSuitCount(allTiles, allTiles[0].suit) >= 10);
        
        if (isQing) {
            makeSichuanSug(t.qingDui, 6, missing, 60);
        } else {
            makeSichuanSug(t.duiDuiHu, 2, missing, 70);
        }
    }

    if (!isFullFlush && pairs < 4 && melds.every(m => m.type === 'chi')) {
         makeSichuanSug(t.pingHu, 0, [], 95);
    }
    
    return suggestions.sort((a, b) => b.fan - a.fan);
};


// --- MCR LOGIC ENGINE REFACTOR ---

const calculateMCRExtras = (allTiles: Tile[], melds: Meld[], mainSuit: Suit | null, t: any): { score: number, details: string[] } => {
    let score = 0;
    const details: string[] = [];

    const isHonors = (tile: Tile) => tile.suit === Suit.Zihai;
    const isTerminal = (tile: Tile) => tile.value === 1 || tile.value === 9;
    const isSimple = (tile: Tile) => !isHonors(tile) && !isTerminal(tile);

    // 1. All Simples (Duan Yao) - 2 Fan
    const allSimple = allTiles.every(isSimple);
    if (allSimple) {
        score += 2;
        details.push(`${t.allSimples} (2)`);
    }

    // 2. No Honors (Wu Zi) - 1 Fan
    // Only valid if not All Simples (usually). MCR rules: All Simples implies No Honors.
    // If All Simples, we don't count No Honors.
    if (!allSimple && !allTiles.some(isHonors)) {
        score += 1;
        details.push(`${t.noHonors} (1)`);
    }

    // 3. One Void (Que Yi Men) - 1 Fan
    const suits = new Set(allTiles.filter(t => t.suit !== Suit.Zihai).map(t => t.suit));
    if (suits.size <= 2) {
        score += 1;
        details.push(`${t.huaZhu} (1)`); // Reusing "Flower Pig" translation for Void/Missing Door? Or better: Que Yi Men
    }

    // 4. Closed Hand (Men Qian Qing) - 2 Fan
    // Check if no open melds (assuming hand input is closed part, melds are open)
    // Actually in this app, 'melds' array implies exposed.
    if (melds.length === 0) {
        score += 2;
        details.push(`Men Qian Qing (2)`); // TODO: Add trans
    }

    return { score, details };
};

const analyzeMCR = (hand: Tile[], melds: Meld[], lang: Language): FanSuggestion[] => {
    const t = TEXT[lang];
    const suggestions: FanSuggestion[] = [];
    const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
    const counts = countTiles(allTiles);
    
    // --- PARTIAL PATTERN SEEKERS ---

    // 1. Mixed Triple Chow (San Se San Tong Shun) - 8 Fan
    // Strategy: Look for Sequence S1(n), S2(n), S3(n)
    for (let i = 1; i <= 7; i++) { // Can be 123 to 789
        const m1 = costToMakeSeq(hand, melds, Suit.Man, i);
        const m2 = costToMakeSeq(hand, melds, Suit.Pin, i);
        const m3 = costToMakeSeq(hand, melds, Suit.Sou, i);
        const totalMissing = m1 + m2 + m3;
        
        if (totalMissing <= 5) {
            const missingTiles = [
                ...getMissingForSeq(hand, Suit.Man, i),
                ...getMissingForSeq(hand, Suit.Pin, i),
                ...getMissingForSeq(hand, Suit.Sou, i)
            ]; // This is rough, logic above 'cost' is better for count
            
            // Calculate extras
            const { score: extraScore, details: extraDetails } = calculateMCRExtras(allTiles, melds, null, t);
            
            suggestions.push({
                name: t.mixedTripleChow,
                baseFan: 8,
                fan: 8 + extraScore,
                probability: Math.max(10, 80 - totalMissing * 15),
                missingTiles: missingTiles.slice(0, 4), // Limit UI clutter
                patternDetails: [`${t.mixedTripleChow} (8)`, ...extraDetails]
            });
        }
    }

    // 2. Mixed Shifted Chows (San Se San Bu Gao) - 6 Fan
    // Strategy: S1(n), S2(n+1), S3(n+2) in any suit permutation
    // There are 6 permutations of suits.
    const perms = [
        [Suit.Man, Suit.Pin, Suit.Sou],
        [Suit.Man, Suit.Sou, Suit.Pin],
        [Suit.Pin, Suit.Man, Suit.Sou],
        [Suit.Pin, Suit.Sou, Suit.Man],
        [Suit.Sou, Suit.Man, Suit.Pin],
        [Suit.Sou, Suit.Pin, Suit.Man],
    ];
    
    for (let i = 1; i <= 5; i++) { // 123, 234, 345 -> max start is 5 (567, 678, 789) is invalid? No, 789 is last.
        // If i=7, n=7, n+1=8, n+2=9. 9,10,11 invalid. Max i depends on structure.
        // Seq 1: i..i+2. Seq 2: i+1..i+3. Seq 3: i+2..i+4. Max i+4 <= 9 => i <= 5.
        
        for (const [s1, s2, s3] of perms) {
            const c1 = costToMakeSeq(hand, melds, s1, i);
            const c2 = costToMakeSeq(hand, melds, s2, i+1);
            const c3 = costToMakeSeq(hand, melds, s3, i+2);
            const totalMissing = c1 + c2 + c3;
            
            if (totalMissing <= 4) {
                 const missingTiles = [
                    ...getMissingForSeq(hand, s1, i),
                    ...getMissingForSeq(hand, s2, i+1),
                    ...getMissingForSeq(hand, s3, i+2)
                ];
                const { score: exScore, details: exDetails } = calculateMCRExtras(allTiles, melds, null, t);
                
                suggestions.push({
                    name: t.mixedShiftedChows,
                    baseFan: 6,
                    fan: 6 + exScore,
                    probability: Math.max(10, 75 - totalMissing * 15),
                    missingTiles: missingTiles.slice(0, 4),
                    patternDetails: [`${t.mixedShiftedChows} (6)`, ...exDetails]
                });
            }
        }
    }

    // 3. Five Gates (Wu Men Qi) - 6 Fan
    // Need Man, Pin, Sou, Wind, Dragon
    const hasMan = getSuitCount(allTiles, Suit.Man) > 0;
    const hasPin = getSuitCount(allTiles, Suit.Pin) > 0;
    const hasSou = getSuitCount(allTiles, Suit.Sou) > 0;
    const hasWind = allTiles.some(x => x.suit === Suit.Zihai && x.value <= 4);
    const hasDragon = allTiles.some(x => x.suit === Suit.Zihai && x.value >= 5);
    
    let gates = 0;
    if(hasMan) gates++; if(hasPin) gates++; if(hasSou) gates++; if(hasWind) gates++; if(hasDragon) gates++;
    
    if (gates >= 4) {
         // Missing?
         const missing: Tile[] = [];
         if(!hasMan) missing.push(createTile(Suit.Man, 1));
         if(!hasPin) missing.push(createTile(Suit.Pin, 1));
         if(!hasSou) missing.push(createTile(Suit.Sou, 1));
         if(!hasWind) missing.push(createTile(Suit.Zihai, 1));
         if(!hasDragon) missing.push(createTile(Suit.Zihai, 5));
         
         const { score: exScore, details: exDetails } = calculateMCRExtras(allTiles, melds, null, t);
         suggestions.push({
            name: t.fiveGates,
            baseFan: 6,
            fan: 6 + exScore,
            probability: gates * 15,
            missingTiles: missing,
            patternDetails: [`${t.fiveGates} (6)`, ...exDetails]
         });
    }
    
    // 4. Pure Straight (Qing Long) - 16 Fan
    // Check Man, Pin, Sou
    [Suit.Man, Suit.Pin, Suit.Sou].forEach(s => {
        // Need 123, 456, 789
        const c1 = costToMakeSeq(hand, melds, s, 1);
        const c2 = costToMakeSeq(hand, melds, s, 4);
        const c3 = costToMakeSeq(hand, melds, s, 7);
        const total = c1 + c2 + c3;
        
        if (total <= 5) {
             const missing = [
                 ...getMissingForSeq(hand, s, 1),
                 ...getMissingForSeq(hand, s, 4),
                 ...getMissingForSeq(hand, s, 7)
             ];
             suggestions.push({
                 name: t.pureStraight,
                 baseFan: 16,
                 fan: 16, // usually conflicts with other small things or overrides them
                 probability: 80 - total * 10,
                 missingTiles: missing.slice(0, 4),
                 patternDetails: [`${t.pureStraight} (16)`]
             });
        }
    });

    // 5. Full Flush / Half Flush Logic (reused roughly)
    // ... (Simplified for brevity, but relying on MCRExtras helps)
    
    // 6. Seven Pairs
    let pairs = 0;
    counts.forEach(c => { if(c>=2) pairs++; });
    if (pairs >= 4) {
        suggestions.push({
            name: t.sevenPairs,
            baseFan: 24,
            fan: 24,
            probability: pairs * 12,
            missingTiles: [], // Hard to guess
            patternDetails: [`${t.sevenPairs} (24)`]
        });
    }
    
    // 7. All Pungs
    let trips = 0;
    counts.forEach(c => { if(c>=3) trips++; });
    if (trips + melds.length >= 2) {
         suggestions.push({
            name: t.allPungs,
            baseFan: 6,
            fan: 6,
            probability: 50,
            missingTiles: [],
            patternDetails: [`${t.allPungs} (6)`]
        });
    }

    // Sort by Total Fan, then Probability
    return suggestions
        .sort((a, b) => (b.fan * 10 + b.probability) - (a.fan * 10 + a.probability));
};

// --- MAIN EXPORT ---

export const analyzeGame = (state: GameState, lang: Language = 'en'): AnalysisResult => {
  const { hand, melds, discards, wallCount, mode, voidSuit } = state;
  const warnings: string[] = [];
  const t = TEXT[lang];
  
  // Best Discard Logic
  let bestDiscard: { tile: Tile, reason: string } | undefined;
  if (hand.length > 0) {
      if (mode === GameMode.Sichuan && voidSuit) {
          const voidTile = hand.find(t => t.suit === voidSuit);
          if (voidTile) bestDiscard = { tile: voidTile, reason: t.huaZhu };
      }
      if (!bestDiscard) {
        const counts = countTiles(hand);
        const isolated = hand.find(tile => {
            const k = getTileKey(tile.suit, tile.value);
            return counts.get(k) === 1 && 
                   !hand.some(o => o.suit === tile.suit && Math.abs(o.value - tile.value) <= 1);
        });
        if (isolated) bestDiscard = { tile: isolated, reason: t.discardHint };
        else bestDiscard = { tile: hand[0], reason: t.discardHint };
      }
  }

  // Suggestions
  let suggestions: FanSuggestion[] = [];
  if (mode === GameMode.Sichuan) {
      suggestions = analyzeSichuan(hand, melds, voidSuit, lang);
  } else {
      suggestions = analyzeMCR(hand, melds, lang);
  }

  // Mock Waiting Tiles
  const isReady = suggestions.length > 0 && suggestions[0].missingTiles.length <= 1;
  const waitingTiles = [];
  if (suggestions.length > 0 && suggestions[0].missingTiles.length > 0) {
      // Pick top missing tiles
       suggestions[0].missingTiles.slice(0, 3).forEach(mt => {
           waitingTiles.push({
              tile: mt,
              remaining: Math.floor(Math.random() * 4),
              probability: 'N/A'
           });
       });
  }

  return {
    isReady,
    shanten: isReady ? 0 : 1, // Mock
    waitingTiles,
    bestDiscard,
    suggestions,
    scoreEstimate: suggestions.length > 0 ? suggestions[0].fan : 0,
    warnings,
  };
};

export { sortTiles, countTiles };
