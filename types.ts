export interface DrawData {
  issue: string;
  date: string;
  numbers: number[]; // Array of 5 integers
}

// 0: +, 1: -, 2: *
export type OpType = '+' | '-' | '*';

export enum FormulaType {
  ONE_POS = '1-Pos', // New: Single Position
  TWO_POS = '2-Pos',
  THREE_POS = '3-Pos',
  FOUR_POS = '4-Pos', 
  FIVE_POS = '5-Pos'
}

export interface StrategyConfig {
  id: string;
  type: FormulaType;
  inputIndices: number[]; // Indices of P[0]..P[4] used in formula
  operators: OpType[]; // Operators between inputs
  offset: number; // Constant added to result (0-4)
  targetIndices: number[]; // The 3 indices to check against (e.g., [0,1,2])
  lookback: number; // New: 1=Last Issue, 2=2 Issues Ago, etc.
  name: string; // Human readable name
}

export interface PeriodStat {
  issue: string;
  isWin: boolean;
  profit: number; // +606 or -384
  cumulativeProfit: number;
}

export interface AnnualStat {
  year: string;
  profit: number;
  winCount: number;
  totalCount: number;
}

export interface StreakCounts {
  [length: number]: number;
}

export interface StrategyStats {
  config: StrategyConfig;
  totalDraws: number;
  winDraws: number;
  winRate: number; // percentage
  totalProfit: number;
  profitRatio: number; // Total Profit / Total Loss (absolute)
  maxWinStreak: number;
  maxLoseStreak: number;
  maxDrawdown: number; // Max drop from peak equity
  currentStreak: number; // Positive for win, negative for loss
  isOverheated: boolean; // currentStreak >= 8
  annualStats: AnnualStat[];
  streakCounts: {
    win: StreakCounts;
    loss: StreakCounts;
  };
  survivalStats: {
    count: number; // How many times a >=9 streak broke
    periods: number[]; // Array of how many periods it survived before -1000 loss
    avgPeriods: number;
  };
}

export const WIN_PROFIT = 606;
export const LOSE_COST = -384;
export const OVERHEAT_THRESHOLD = 8;
