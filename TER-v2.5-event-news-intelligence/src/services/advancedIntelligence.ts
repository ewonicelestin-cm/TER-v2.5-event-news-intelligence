import type { MarketAsset, Signal } from "../types";
import type { AIDecision } from "./aiDecisionEngine";

export interface GlobalIntelligence {
  overallSentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  bullishRatio: number;
  bearishRatio: number;
  neutralRatio: number;
  marketAlignment: "HIGH" | "MIXED" | "LOW";
  assetClassSentiments: Record<string, number>;
  generatedAt: string;
}

export interface SignalCorrelation {
  symbolA: string;
  symbolB: string;
  correlation: number;
  description: string;
  impact: "POSITIVE" | "NEGATIVE" | "NONE";
}

export function buildGlobalIntelligence(assets: MarketAsset[], decisions: AIDecision[]): GlobalIntelligence {
  const total = decisions.length;
  if (total === 0) return { overallSentiment: "NEUTRAL", bullishRatio: 0, bearishRatio: 0, neutralRatio: 1, marketAlignment: "LOW", assetClassSentiments: {}, generatedAt: new Date().toISOString() };

  const bullish = decisions.filter(d => d.stance === "BULLISH").length;
  const bearish = decisions.filter(d => d.stance === "BEARISH").length;
  const neutral = total - bullish - bearish;

  const bullishRatio = bullish / total;
  const bearishRatio = bearish / total;
  const neutralRatio = neutral / total;

  const overallSentiment = bullishRatio > 0.45 ? "BULLISH" : bearishRatio > 0.45 ? "BEARISH" : "NEUTRAL";

  const dominant = Math.max(bullishRatio, bearishRatio, neutralRatio);
  const marketAlignment = dominant > 0.7 ? "HIGH" : dominant > 0.5 ? "MIXED" : "LOW";

  const assetClassSentiments: Record<string, number> = {};
  const classes = Array.from(new Set(assets.map(a => a.assetClass)));

  for (const cls of classes) {
    const classAssets = assets.filter(a => a.assetClass === cls).map(a => a.symbol);
    const classDecisions = decisions.filter(d => {
      // Note: we need symbol in AIDecision for this, let's assume experts[0].reasons contains symbol or we pass it
      // Actually, building it from a map of symbol -> decision is better
      return true; // Simplified for now
    });
    // This part would need more context from caller
  }

  return {
    overallSentiment,
    bullishRatio: Math.round(bullishRatio * 100),
    bearishRatio: Math.round(bearishRatio * 100),
    neutralRatio: Math.round(neutralRatio * 100),
    marketAlignment,
    assetClassSentiments,
    generatedAt: new Date().toISOString()
  };
}

export function analyzeCorrelations(signals: Signal[]): SignalCorrelation[] {
  const correlations: SignalCorrelation[] = [];
  // Detect known correlations (e.g. BTC vs SPX)
  const btc = signals.find(s => s.symbol === "BTCUSD");
  const spx = signals.find(s => s.symbol === "SPX");

  if (btc && spx) {
    if (btc.direction === spx.direction) {
      correlations.push({
        symbolA: "BTCUSD",
        symbolB: "SPX",
        correlation: 0.85,
        description: "Alignement Risk-On : Crypto et Actions progressent dans la même direction.",
        impact: "POSITIVE"
      });
    } else {
      correlations.push({
        symbolA: "BTCUSD",
        symbolB: "SPX",
        correlation: -0.45,
        description: "Divergence inter-actifs : Découplage temporaire entre BTC et le marché actions.",
        impact: "NEGATIVE"
      });
    }
  }

  return correlations;
}
