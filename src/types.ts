export type AssetClass = "Equities" | "Forex" | "Crypto" | "Indices" | "Commodities" | "Rates";

export type SignalDirection = "LONG" | "SHORT" | "WATCH";

export interface MarketAsset {
  symbol: string;
  name: string;
  market: string;
  assetClass: AssetClass;
  price: number;
  change24h: number;
  volume: number;
  dataSource?: "live" | "synthetic";
  provider?: string;
  dataQuality?: "FRESH" | "STALE" | "INVALID" | "SYNTHETIC";
  dataQualityScore?: number;
  receivedAt?: string;
  providerTimestamp?: string;
  latencyMs?: number;
  staleAfterSeconds?: number;
}

/** One OHLCV candle. `ts` is an ISO timestamp for the candle open. */
export interface OHLCVBar {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  dataSource?: "live" | "synthetic";
  provider?: string;
  dataQuality?: "FRESH" | "STALE" | "INVALID" | "SYNTHETIC";
  dataQualityScore?: number;
}

export interface Signal {
  id: string;
  symbol: string;
  market: string;
  direction: SignalDirection;
  score: number;
  confidence: number;
  entry: number;
  stop: number;
  targets: number[];
  timeframe: string;
  reasons: string[];
  timestamp: string;
  sourceCount: number;
  riskReward: number;
  intelligence?: import("./services/signalIntelligence").SignalIntelligence;
  aiDecision?: import("./services/aiDecisionEngine").AIDecision;
  calibration?: import("./services/probabilityCalibration").CalibrationReport;
}

export interface TraderProfile {
  handle: string;
  platform: string;
  strategy: string;
  verified: boolean;
  sampleSize: number;
  winRate: number;
  expectancy: number;
  maxDrawdown: number;
  consistency: number;
}

export interface AIModel {
  name: string;
  role: string;
  specialty: string;
  score: number;
  status: "active" | "planned";
}

export interface NewsItem {
  title: string;
  source: string;
  sentiment: number;
  publishedAt: string;
  symbols: string[];
}

export interface MarketEventSummary {
  id: string;
  title: string;
  category: string;
  scheduledAt: string;
  region: string;
  importance: "LOW" | "MEDIUM" | "HIGH";
  affectedAssetClasses: AssetClass[];
  symbols: string[];
  source: string;
  isSynthetic: boolean;
}
