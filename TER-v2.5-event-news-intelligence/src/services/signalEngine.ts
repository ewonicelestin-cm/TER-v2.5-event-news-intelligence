import type { MarketAsset, OHLCVBar, Signal, TraderProfile } from "../types";
import { computeSnapshot, type IndicatorSnapshot } from "./technicalIndicators";

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

/**
 * v2 signal engine — scores now come from real indicators (RSI, EMA20/50
 * trend, MACD histogram, Bollinger position, ATR-based regime) computed on
 * OHLCV history, instead of the v1.0 formula `momentum * 0.55 + ... + (i % 3
 * === 0 ? 17 : 9)`. The social-quality term is unchanged in spirit (average
 * of verified strategy consistency/winRate) but no longer hard-coded to a
 * flat 50 when no snapshot is available — it now degrades gracefully.
 */

function technicalScore(s: IndicatorSnapshot): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 50;
  const p = s.profile;

  const trendDirection = s.ema20 >= s.ema50 ? 1 : -1;
  const trendStrength = Math.min(1, Math.max(0, (s.adx - p.trendAdxThreshold) / 20));
  const macdBias = Math.max(-1, Math.min(1, (s.macdHistogram / Math.max(s.atr, s.price * 0.0001)) * 3));

  if (s.regime === "TREND_UP") {
    score += 20 * trendStrength + 12 * Math.max(0, macdBias);
    reasons.push(`Régime tendance haussière · ADX ${s.adx.toFixed(1)}`);
    reasons.push("EMA20 au-dessus de l'EMA50");
  } else if (s.regime === "TREND_DOWN") {
    score -= 20 * trendStrength + 12 * Math.max(0, -macdBias);
    reasons.push(`Régime tendance baissière · ADX ${s.adx.toFixed(1)}`);
    reasons.push("EMA20 sous l'EMA50");
  } else if (s.regime === "RANGE") {
    // In a range, oscillators matter more than trend indicators.
    if (s.rsi <= p.rsiOversold) { score += 12; reasons.push(`RSI sous ${p.rsiOversold} · zone de rebond potentielle`); }
    else if (s.rsi >= p.rsiOverbought) { score -= 12; reasons.push(`RSI au-dessus de ${p.rsiOverbought} · zone d'excès`); }
    else reasons.push(`RSI ${s.rsi.toFixed(1)} · zone intermédiaire`);

    if (s.stochasticK < 20 && s.stochasticK >= s.stochasticD) { score += 10; reasons.push("Stochastique : sortie de survente"); }
    if (s.stochasticK > 80 && s.stochasticK <= s.stochasticD) { score -= 10; reasons.push("Stochastique : sortie de surachat"); }
    if (s.cci < -100) { score += 8; reasons.push("CCI < -100 · excès vendeur"); }
    if (s.cci > 100) { score -= 8; reasons.push("CCI > +100 · excès acheteur"); }
  } else {
    // High volatility: avoid treating an oscillator extreme as a reversal by itself.
    score += macdBias * 10 + trendDirection * 5;
    score -= 6;
    reasons.push(`Volatilité élevée · ATR ${ (s.atrPct * 100).toFixed(2)}%`);
    reasons.push("Poids réduit des signaux de retournement");
  }

  // Bollinger position is interpreted differently in trend vs range.
  const bandWidth = s.bollinger.upper - s.bollinger.lower;
  if (bandWidth > 0) {
    const pos = (s.price - s.bollinger.lower) / bandWidth;
    if (s.regime === "RANGE") {
      if (pos < 0.15) { score += 8; reasons.push("Prix proche de la bande basse en range"); }
      else if (pos > 0.85) { score -= 8; reasons.push("Prix proche de la bande haute en range"); }
    } else if (s.regime === "TREND_UP" && pos > 0.55) {
      score += 5; reasons.push("Prix maintenu dans la moitié haute des Bollinger");
    } else if (s.regime === "TREND_DOWN" && pos < 0.45) {
      score -= 5; reasons.push("Prix maintenu dans la moitié basse des Bollinger");
    }
  }

  if (s.volumeRatio >= 1.25) {
    score += trendDirection * 5;
    reasons.push(`Volume ${s.volumeRatio.toFixed(2)}× sa moyenne · confirmation à surveiller`);
  } else if (s.volumeRatio < 0.7) {
    reasons.push(`Volume faible (${s.volumeRatio.toFixed(2)}×) · confirmation limitée`);
  }

  return { score: clamp(score), reasons };
}
export function generateSignals(
  assets: MarketAsset[],
  traders: TraderProfile[],
  historyBySymbol: Record<string, OHLCVBar[]>
): Signal[] {
  // Only verified traders count toward the social-quality adjustment —
  // matches what the reasons text below actually claims. Unverified
  // track records (self-reported, no independent confirmation) are shown
  // to the user elsewhere but must not move the score.
  const verifiedTraders = traders.filter(t => t.verified);
  const socialQuality = verifiedTraders.length
    ? verifiedTraders.reduce((s, t) => s + (t.consistency * t.winRate) / 100, 0) / verifiedTraders.length
    : null;

  return assets.map((a, i) => {
    const bars = historyBySymbol[a.symbol];
    const snapshot = bars ? computeSnapshot(bars, a.assetClass, "1D") : null;

    let score: number;
    let reasons: string[];
    let atr14: number;

    if (snapshot) {
      const tech = technicalScore(snapshot);
      score = socialQuality !== null ? clamp(tech.score * 0.8 + socialQuality * 0.2) : tech.score;
      reasons = [...tech.reasons, "Score ajusté par la qualité des stratégies sociales vérifiées"];
      atr14 = snapshot.atr;
    } else {
      // No history yet for this symbol: fall back to a conservative neutral
      // watch signal rather than inventing a confident score.
      score = 50;
      reasons = ["Historique insuffisant pour calculer les indicateurs — signal neutre par défaut"];
      atr14 = a.price * 0.01;
    }

    const direction = score >= 65 ? "LONG" : score <= 35 ? "SHORT" : "WATCH";

    // ATR-based stop instead of a flat risk percentage: wider stop in more
    // volatile instruments, tighter in calm ones.
    const atrMultiple = 1.5;
    const entry = a.price;
    const stopDistance = Math.max(atr14 * atrMultiple, entry * 0.003);
    const stop = direction === "SHORT" ? entry + stopDistance : entry - stopDistance;
    const rr = 2;
    const target = direction === "SHORT" ? entry - stopDistance * rr : entry + stopDistance * rr;

    return {
      id: `${a.symbol}-${i}`,
      symbol: a.symbol,
      market: a.market,
      direction,
      score: Math.round(score),
      confidence: Math.round(clamp(score * 0.92)),
      entry,
      stop,
      targets: [target],
      timeframe: "1D",
      reasons,
      timestamp: new Date().toISOString(),
      sourceCount: verifiedTraders.length,
      riskReward: rr
    };
  });
}

export function rankSignals(signals: Signal[]) {
  return [...signals].sort((a, b) => b.score - a.score);
}
