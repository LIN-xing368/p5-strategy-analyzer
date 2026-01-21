import { 
  StrategyConfig, 
  DrawData, 
  StrategyStats, 
  FormulaType, 
  OpType, 
  WIN_PROFIT, 
  LOSE_COST, 
  OVERHEAT_THRESHOLD,
  PeriodStat,
  StreakCounts
} from '../types';

// --- Shared Constants & Helpers for Main Thread ---

// Helper to calculate combinations
function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  return arr.flatMap((v, i) =>
    getCombinations(arr.slice(i + 1), k - 1).map((c) => [v, ...c])
  );
}

// Helper to generate all permutations of operators
function getOpPermutations(length: number): OpType[][] {
    const ops: OpType[] = ['+', '-', '*'];
    if (length === 1) return ops.map(o => [o]);
    const sub = getOpPermutations(length - 1);
    return ops.flatMap(o => sub.map(s => [o, ...s]));
}

const POS_NAMES = ['万', '千', '百', '十', '个'];
const OFFSETS = [0, 1, 2, 3, 4]; 
const LOOKBACKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// --- Main Thread Functions (Single Strategy Analysis) ---

export const generateStrategies = (): StrategyConfig[] => {
  // NOTE: This function is kept for reference or single-use if needed, 
  // but the Worker now generates its own strategies to avoid massive data transfer overhead.
  const strategies: StrategyConfig[] = [];
  const positions = [0, 1, 2, 3, 4];
  const targetGroups = getCombinations(positions, 3);

  const addVariations = (type: FormulaType, inputs: number[], ops: OpType[], baseName: string) => {
    targetGroups.forEach(targets => {
      OFFSETS.forEach(offset => {
        LOOKBACKS.forEach(lookback => {
            const nameSuffix = offset > 0 ? `+${offset}` : '';
            const lbSuffix = lookback > 1 ? `(回${lookback})` : '';
            strategies.push({
              id: `${type}-${inputs.join('')}-${ops.join('')}-T${targets.join('')}-K${offset}-L${lookback}`,
              type,
              inputIndices: inputs,
              operators: ops,
              targetIndices: targets,
              offset,
              lookback,
              name: `${baseName}${nameSuffix}${lbSuffix}`
            });
        });
      });
    });
  };

  // Type 0-4 Logic mirroring the worker...
  positions.forEach(idx => addVariations(FormulaType.ONE_POS, [idx], [], POS_NAMES[idx]));
  const inputPairs = getCombinations(positions, 2);
  const ops2 = getOpPermutations(1); 
  inputPairs.forEach(inputs => ops2.forEach(ops => addVariations(FormulaType.TWO_POS, inputs, ops, `${POS_NAMES[inputs[0]]}${ops[0]}${POS_NAMES[inputs[1]]}`)));
  const inputTriples = getCombinations(positions, 3);
  const ops3 = getOpPermutations(2); 
  inputTriples.forEach(inputs => ops3.forEach(ops => addVariations(FormulaType.THREE_POS, inputs, ops, `${POS_NAMES[inputs[0]]}${ops[0]}${POS_NAMES[inputs[1]]}${ops[1]}${POS_NAMES[inputs[2]]}`)));
  const inputQuads = getCombinations(positions, 4);
  const ops4 = getOpPermutations(3); 
  inputQuads.forEach(inputs => ops4.forEach(ops => addVariations(FormulaType.FOUR_POS, inputs, ops, `${POS_NAMES[inputs[0]]}${ops[0]}${POS_NAMES[inputs[1]]}${ops[1]}${POS_NAMES[inputs[2]]}${ops[2]}${POS_NAMES[inputs[3]]}`)));
  const inputFive = [0,1,2,3,4];
  const ops5 = getOpPermutations(4); 
  ops5.forEach(ops => addVariations(FormulaType.FIVE_POS, inputFive, ops, `${POS_NAMES[0]}${ops[0]}${POS_NAMES[1]}${ops[1]}${POS_NAMES[2]}${ops[2]}${POS_NAMES[3]}${ops[3]}${POS_NAMES[4]}`));

  return strategies;
};

export const getReferenceBase = (numbers: number[], config: StrategyConfig): number => {
  let sum = 0;
  const idx = config.inputIndices;
  const ops = config.operators;
  
  if (config.type === FormulaType.ONE_POS) sum = numbers[idx[0]];
  else if (config.type === FormulaType.TWO_POS) {
    const v1 = numbers[idx[0]], v2 = numbers[idx[1]];
    sum = ops[0] === '+' ? v1+v2 : ops[0] === '-' ? v1-v2 : v1*v2;
  } 
  else if (config.type === FormulaType.THREE_POS) {
    let temp = numbers[idx[0]];
    const v2 = numbers[idx[1]], v3 = numbers[idx[2]];
    temp = ops[0] === '+' ? temp+v2 : ops[0] === '-' ? temp-v2 : temp*v2;
    sum = ops[1] === '+' ? temp+v3 : ops[1] === '-' ? temp-v3 : temp*v3;
  }
  else if (config.type === FormulaType.FOUR_POS || config.type === FormulaType.FIVE_POS) {
     let temp = numbers[idx[0]];
     for(let k=0; k<ops.length; k++) {
         const val = numbers[idx[k+1]];
         const op = ops[k];
         if (op === '+') temp += val;
         else if (op === '-') temp -= val;
         else if (op === '*') temp *= val;
     }
     sum = temp;
  }
  return (Math.abs(sum) + config.offset) % 10;
};

export const analyzeStrategy = (config: StrategyConfig, draws: DrawData[]): StrategyStats => {
  // Keep the original single-strategy logic for Detail View
  // Logic duplication is acceptable here to keep Detail View independent of Worker
  let totalProfit = 0, winDraws = 0, currentStreak = 0, maxWinStreak = 0, maxLoseStreak = 0, peakProfit = 0, maxDrawdown = 0;
  const streakCounts = { win: {} as StreakCounts, loss: {} as StreakCounts };
  const annualMap = new Map<string, { profit: number, wins: number, count: number }>();
  const targetIndices = config.targetIndices;
  const lookback = config.lookback;
  const drawCount = draws.length;
  const winHistory = new Array(drawCount).fill(false);

  for (let i = lookback; i < drawCount; i++) {
    const draw = draws[i];
    const sourceDrawNumbers = draws[i - lookback].numbers;
    const refA = getReferenceBase(sourceDrawNumbers, config);
    const refB = (refA + 5) % 10;
    
    let matchCount = 0;
    for (const tidx of targetIndices) {
        const n = draw.numbers[tidx];
        if (n === refA || n === refB) matchCount++;
    }
    const isWin = matchCount === 1;
    winHistory[i] = isWin;
    const profit = isWin ? WIN_PROFIT : LOSE_COST;
    totalProfit += profit;
    if (totalProfit > peakProfit) peakProfit = totalProfit;
    const drawdown = peakProfit - totalProfit;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    if (isWin) {
      winDraws++;
      if (currentStreak > 0) currentStreak++;
      else {
          if (currentStreak < 0) streakCounts.loss[Math.abs(currentStreak)] = (streakCounts.loss[Math.abs(currentStreak)] || 0) + 1;
          currentStreak = 1;
      }
      if (currentStreak > maxWinStreak) maxWinStreak = currentStreak;
    } else {
      if (currentStreak < 0) currentStreak--;
      else {
          if (currentStreak > 0) streakCounts.win[currentStreak] = (streakCounts.win[currentStreak] || 0) + 1;
          currentStreak = -1;
      }
      if (Math.abs(currentStreak) > maxLoseStreak) maxLoseStreak = Math.abs(currentStreak);
    }
    const year = draw.issue.substring(0, 4);
    let yStat = annualMap.get(year);
    if (!yStat) { yStat = { profit: 0, wins: 0, count: 0 }; annualMap.set(year, yStat); }
    yStat.profit += profit; yStat.count += 1; if (isWin) yStat.wins += 1;
  }
  if (currentStreak > 0) streakCounts.win[currentStreak] = (streakCounts.win[currentStreak] || 0) + 1;
  else if (currentStreak < 0) streakCounts.loss[Math.abs(currentStreak)] = (streakCounts.loss[Math.abs(currentStreak)] || 0) + 1;

  const survivalPeriods: number[] = [];
  let tempStreak = 0;
  for (let i = lookback; i < drawCount; i++) {
      if (winHistory[i]) {
          if (tempStreak < 0) tempStreak = 0;
          tempStreak++;
      } else {
          if (tempStreak >= 9) {
              let simPnL = 0, simCount = 0;
              for (let j = i + 1; j < drawCount; j++) {
                  simPnL += winHistory[j] ? WIN_PROFIT : LOSE_COST;
                  simCount++;
                  if (simPnL <= -1000) break;
              }
              survivalPeriods.push(simCount);
          }
          tempStreak = -1;
      }
  }

  const processedDrawsCount = Math.max(0, drawCount - lookback);
  const grossProfit = winDraws * WIN_PROFIT;
  const grossLoss = (processedDrawsCount - winDraws) * Math.abs(LOSE_COST);

  return {
    config,
    totalDraws: processedDrawsCount,
    winDraws,
    winRate: processedDrawsCount > 0 ? (winDraws / processedDrawsCount) * 100 : 0,
    totalProfit,
    profitRatio: grossLoss === 0 ? grossProfit : Number((grossProfit / grossLoss).toFixed(3)),
    maxWinStreak, maxLoseStreak, maxDrawdown, currentStreak,
    isOverheated: currentStreak >= OVERHEAT_THRESHOLD,
    annualStats: Array.from(annualMap.entries()).map(([year, data]) => ({ year, profit: data.profit, winCount: data.wins, totalCount: data.count })).sort((a, b) => a.year.localeCompare(b.year)),
    streakCounts,
    survivalStats: { count: survivalPeriods.length, periods: survivalPeriods, avgPeriods: survivalPeriods.length > 0 ? survivalPeriods.reduce((a,b)=>a+b,0)/survivalPeriods.length : 0 }
  };
};

export const generateHistory = (config: StrategyConfig, draws: DrawData[]): PeriodStat[] => {
    const history: PeriodStat[] = [];
    let cumulativeProfit = 0;
    const targetIndices = config.targetIndices;
    const lookback = config.lookback;
    for (let i = lookback; i < draws.length; i++) {
        const draw = draws[i];
        const refA = getReferenceBase(draws[i - lookback].numbers, config);
        const refB = (refA + 5) % 10;
        let matchCount = 0;
        for (const tidx of targetIndices) if (draw.numbers[tidx] === refA || draw.numbers[tidx] === refB) matchCount++;
        const isWin = matchCount === 1;
        const profit = isWin ? WIN_PROFIT : LOSE_COST;
        cumulativeProfit += profit;
        history.push({ issue: draw.issue, isWin, profit, cumulativeProfit });
    }
    return history;
};

export const parseCSV = (text: string): DrawData[] => {
  const lines = text.split('\n');
  const data: DrawData[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(/[,;\t]+/);
    if (parts.length < 2) continue;
    let issue = parts[0].trim();
    if (issue.endsWith('.0')) issue = issue.slice(0, -2);
    let numberPart = '';
    for(let j=1; j<parts.length; j++) {
        const p = parts[j].replace(/["\r]/g, '').trim();
        if (/^\d{5}$/.test(p.replace(/\s+/g, ''))) { numberPart = p; break; }
    }
    if (numberPart) {
        const cleanNumbers = numberPart.replace(/\D/g, '');
        if (cleanNumbers.length === 5) {
            data.push({ issue, date: parts.length > 2 && parts[1].includes('-') ? parts[1].trim() : issue.substring(0, 4), numbers: cleanNumbers.split('').map(Number) });
        }
    }
  }
  return data.sort((a, b) => a.issue.localeCompare(b.issue));
};

// --- WEB WORKER IMPLEMENTATION ---

const workerCode = `
const WIN_PROFIT = 606;
const LOSE_COST = -384;
const POS_NAMES = ['万', '千', '百', '十', '个'];
const OFFSETS = [0, 1, 2, 3, 4]; 
const LOOKBACKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function getCombinations(arr, k) {
  if (k === 0) return [[]];
  return arr.flatMap((v, i) => getCombinations(arr.slice(i + 1), k - 1).map((c) => [v, ...c]));
}
function getOpPermutations(length) {
    const ops = ['+', '-', '*'];
    if (length === 1) return ops.map(o => [o]);
    const sub = getOpPermutations(length - 1);
    return ops.flatMap(o => sub.map(s => [o, ...s]));
}

self.onmessage = function(e) {
    const draws = e.data;
    const drawCount = draws.length;
    
    // We will generate formula definitions first
    // Then iterate formulas -> lookbacks -> Precalculate Refs -> Offsets -> Targets
    // This reduces redundant calculations massively.
    
    const positions = [0, 1, 2, 3, 4];
    const targetGroups = getCombinations(positions, 3);
    const formulas = [];

    // Define Formulas (Input Indices + Operators)
    // 1-Pos
    positions.forEach(idx => formulas.push({ type: '1-Pos', inputs: [idx], ops: [], name: POS_NAMES[idx] }));
    // 2-Pos
    const inputPairs = getCombinations(positions, 2);
    const ops2 = getOpPermutations(1);
    inputPairs.forEach(inputs => ops2.forEach(ops => formulas.push({ type: '2-Pos', inputs, ops, name: \`\${POS_NAMES[inputs[0]]}\${ops[0]}\${POS_NAMES[inputs[1]]}\` })));
    // 3-Pos
    const inputTriples = getCombinations(positions, 3);
    const ops3 = getOpPermutations(2);
    inputTriples.forEach(inputs => ops3.forEach(ops => formulas.push({ type: '3-Pos', inputs, ops, name: \`\${POS_NAMES[inputs[0]]}\${ops[0]}\${POS_NAMES[inputs[1]]}\${ops[1]}\${POS_NAMES[inputs[2]]}\` })));
    // 4-Pos
    const inputQuads = getCombinations(positions, 4);
    const ops4 = getOpPermutations(3);
    inputQuads.forEach(inputs => ops4.forEach(ops => formulas.push({ type: '4-Pos', inputs, ops, name: \`\${POS_NAMES[inputs[0]]}\${ops[0]}\${POS_NAMES[inputs[1]]}\${ops[1]}\${POS_NAMES[inputs[2]]}\${ops[2]}\${POS_NAMES[inputs[3]]}\` })));
    // 5-Pos
    const inputFive = [0,1,2,3,4];
    const ops5 = getOpPermutations(4);
    ops5.forEach(ops => formulas.push({ type: '5-Pos', inputs: inputFive, ops, name: \`\${POS_NAMES[0]}\${ops[0]}\${POS_NAMES[1]}\${ops[1]}\${POS_NAMES[2]}\${ops[2]}\${POS_NAMES[3]}\${ops[3]}\${POS_NAMES[4]}\` }));

    const results = [];
    
    // BATCH PROCESSING
    // Loop Formulas
    for (let f = 0; f < formulas.length; f++) {
        const form = formulas[f];
        
        // Loop Lookbacks
        for (let l = 0; l < LOOKBACKS.length; l++) {
            const lookback = LOOKBACKS[l];
            
            // Pre-calculate Reference Number A (Base without offset) for all draws
            // RefBase[i] corresponds to draws[i] using data from draws[i-lookback]
            const refBaseArray = new Int8Array(drawCount);
            
            for (let i = lookback; i < drawCount; i++) {
                const srcNum = draws[i - lookback].numbers;
                let sum = 0;
                
                // Inline Calculation Logic for speed
                if (form.type === '1-Pos') sum = srcNum[form.inputs[0]];
                else if (form.type === '2-Pos') {
                    const v1 = srcNum[form.inputs[0]], v2 = srcNum[form.inputs[1]];
                    sum = form.ops[0] === '+' ? v1+v2 : form.ops[0] === '-' ? v1-v2 : v1*v2;
                } 
                else if (form.type === '3-Pos') {
                   let t = srcNum[form.inputs[0]];
                   t = form.ops[0] === '+' ? t+srcNum[form.inputs[1]] : form.ops[0] === '-' ? t-srcNum[form.inputs[1]] : t*srcNum[form.inputs[1]];
                   sum = form.ops[1] === '+' ? t+srcNum[form.inputs[2]] : form.ops[1] === '-' ? t-srcNum[form.inputs[2]] : t*srcNum[form.inputs[2]];
                }
                else {
                    let t = srcNum[form.inputs[0]];
                    for(let k=0; k<form.ops.length; k++) {
                        const val = srcNum[form.inputs[k+1]];
                        const op = form.ops[k];
                        if (op === '+') t += val; else if (op === '-') t -= val; else t *= val;
                    }
                    sum = t;
                }
                refBaseArray[i] = Math.abs(sum) % 10; // Base Mod 10
            }

            // Loop Offsets
            for (let o = 0; o < OFFSETS.length; o++) {
                const offset = OFFSETS[o];
                
                // Calculate Final RefA for this offset
                // This is fast vector op
                const refA_Array = new Int8Array(drawCount);
                const refB_Array = new Int8Array(drawCount);
                
                for(let i = lookback; i < drawCount; i++) {
                    const ra = (refBaseArray[i] + offset) % 10;
                    refA_Array[i] = ra;
                    refB_Array[i] = (ra + 5) % 10;
                }

                // Loop Targets
                for (let t = 0; t < targetGroups.length; t++) {
                    const targets = targetGroups[t];
                    
                    // --- ANALYSIS START ---
                    let totalProfit = 0;
                    let winDraws = 0;
                    let currentStreak = 0;
                    let maxWinStreak = 0;
                    let maxLoseStreak = 0;
                    let peakProfit = 0;
                    let maxDrawdown = 0;
                    
                    const streakCounts = { win: {}, loss: {} };
                    const annualMap = {}; // Use obj for speed then convert

                    // To track win/loss for survival stats
                    const winHistory = new Uint8Array(drawCount); // 1=Win, 0=Loss

                    // Inner Loop over Draws
                    for (let i = lookback; i < drawCount; i++) {
                         const n = draws[i].numbers;
                         // Check win
                         // targets is array of 3 indices
                         const ra = refA_Array[i];
                         const rb = refB_Array[i];
                         
                         let matches = 0;
                         if (n[targets[0]] === ra || n[targets[0]] === rb) matches++;
                         if (n[targets[1]] === ra || n[targets[1]] === rb) matches++;
                         if (n[targets[2]] === ra || n[targets[2]] === rb) matches++;
                         
                         const isWin = matches === 1;
                         winHistory[i] = isWin ? 1 : 0;
                         
                         const profit = isWin ? WIN_PROFIT : LOSE_COST;
                         totalProfit += profit;
                         if (totalProfit > peakProfit) peakProfit = totalProfit;
                         const dd = peakProfit - totalProfit;
                         if (dd > maxDrawdown) maxDrawdown = dd;
                         
                         if (isWin) {
                             winDraws++;
                             if (currentStreak > 0) currentStreak++;
                             else {
                                 if (currentStreak < 0) {
                                    const abs = -currentStreak;
                                    streakCounts.loss[abs] = (streakCounts.loss[abs] || 0) + 1;
                                 }
                                 currentStreak = 1;
                             }
                             if (currentStreak > maxWinStreak) maxWinStreak = currentStreak;
                         } else {
                             if (currentStreak < 0) currentStreak--;
                             else {
                                 if (currentStreak > 0) streakCounts.win[currentStreak] = (streakCounts.win[currentStreak] || 0) + 1;
                                 currentStreak = -1;
                             }
                             if (-currentStreak > maxLoseStreak) maxLoseStreak = -currentStreak;
                         }

                         const year = draws[i].issue.substring(0,4);
                         if(!annualMap[year]) annualMap[year] = {p:0, w:0, c:0};
                         annualMap[year].p += profit;
                         annualMap[year].c++;
                         if(isWin) annualMap[year].w++;
                    }

                    // Final Streak
                    if (currentStreak > 0) streakCounts.win[currentStreak] = (streakCounts.win[currentStreak] || 0) + 1;
                    else if (currentStreak < 0) {
                        const abs = -currentStreak;
                        streakCounts.loss[abs] = (streakCounts.loss[abs] || 0) + 1;
                    }

                    // Survival Stats
                    const survivalPeriods = [];
                    let tempStreak = 0;
                    for (let i = lookback; i < drawCount; i++) {
                        if (winHistory[i] === 1) {
                            if (tempStreak < 0) tempStreak = 0;
                            tempStreak++;
                        } else {
                            if (tempStreak >= 9) {
                                // Break
                                let simPnL = 0;
                                let simCount = 0;
                                for (let j = i + 1; j < drawCount; j++) {
                                    simPnL += (winHistory[j]===1) ? WIN_PROFIT : LOSE_COST;
                                    simCount++;
                                    if (simPnL <= -1000) break;
                                }
                                survivalPeriods.push(simCount);
                            }
                            tempStreak = -1;
                        }
                    }

                    // Build Config Object
                    const nameSuffix = offset > 0 ? ('+'+offset) : '';
                    const lbSuffix = lookback > 1 ? ('(回'+lookback+')') : '';
                    
                    const annualStats = Object.keys(annualMap).sort().map(y => ({
                        year: y,
                        profit: annualMap[y].p,
                        winCount: annualMap[y].w,
                        totalCount: annualMap[y].c
                    }));
                    
                    const processedCount = Math.max(0, drawCount - lookback);
                    const grossProfit = winDraws * WIN_PROFIT;
                    const grossLoss = (processedCount - winDraws) * Math.abs(LOSE_COST);
                    
                    const avgSurv = survivalPeriods.length > 0 ? (survivalPeriods.reduce((a,b)=>a+b,0)/survivalPeriods.length) : 0;

                    results.push({
                        config: {
                            id: \`\${form.type}-\${form.inputs.join('')}-\${form.ops.join('')}-T\${targets.join('')}-K\${offset}-L\${lookback}\`,
                            type: form.type,
                            inputIndices: form.inputs,
                            operators: form.ops,
                            targetIndices: targets,
                            offset: offset,
                            lookback: lookback,
                            name: \`\${form.name}\${nameSuffix}\${lbSuffix}\`
                        },
                        totalDraws: processedCount,
                        winDraws: winDraws,
                        winRate: processedCount > 0 ? (winDraws/processedCount)*100 : 0,
                        totalProfit: totalProfit,
                        profitRatio: grossLoss === 0 ? grossProfit : Number((grossProfit/grossLoss).toFixed(3)),
                        maxWinStreak: maxWinStreak,
                        maxLoseStreak: maxLoseStreak,
                        maxDrawdown: maxDrawdown,
                        currentStreak: currentStreak,
                        isOverheated: currentStreak >= 8,
                        annualStats: annualStats,
                        streakCounts: streakCounts,
                        survivalStats: {
                            count: survivalPeriods.length,
                            periods: survivalPeriods,
                            avgPeriods: avgSurv
                        }
                    });
                }
            }
        }
    }
    
    self.postMessage(results);
};
`;

export const runAnalysisWorker = (draws: DrawData[]): Promise<StrategyStats[]> => {
    return new Promise((resolve, reject) => {
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const worker = new Worker(URL.createObjectURL(blob));
        
        worker.onmessage = (e) => {
            resolve(e.data);
            worker.terminate();
        };
        
        worker.onerror = (e) => {
            reject(e);
            worker.terminate();
        };
        
        worker.postMessage(draws);
    });
};
