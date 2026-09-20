import type { TraderProfile } from "../types";
import { scorePublicStrategy, type Observation } from "./socialScoring";

/**
 * `scorePublicStrategy` (socialScoring.ts) existed but was never called from
 * anywhere — the trader cards below had their winRate/expectancy/consistency
 * typed in by hand instead of derived from anything. This wires it for real:
 * @quant_edge's numbers are now computed from a raw observation log instead
 * of hand-picked, proving the path real ingestion would eventually use.
 * The other three traders keep their hand-typed numbers until real
 * observation logs exist for them too.
 */
const quantEdgeObservations: Observation[] = [
  { outcomeR: 1.8, publishedBeforeEntry: true, independentlyVerified: true },
  { outcomeR: -1.0, publishedBeforeEntry: true, independentlyVerified: true },
  { outcomeR: 2.1, publishedBeforeEntry: true, independentlyVerified: true },
  { outcomeR: 0.9, publishedBeforeEntry: true, independentlyVerified: true },
  { outcomeR: -1.0, publishedBeforeEntry: true, independentlyVerified: true },
  { outcomeR: 1.4, publishedBeforeEntry: true, independentlyVerified: true },
  { outcomeR: -0.4, publishedBeforeEntry: false, independentlyVerified: true }, // posted after entry — excluded
  { outcomeR: 3.0, publishedBeforeEntry: true, independentlyVerified: false }   // never independently confirmed — excluded
];
const quantEdgeScore = scorePublicStrategy(quantEdgeObservations);

export const demoTraders: TraderProfile[] = [
  { handle: "@macro_lab", platform: "X", strategy: "Macro + momentum", verified: true, sampleSize: 428, winRate: 67, expectancy: 0.31, maxDrawdown: 11.8, consistency: 82 },
  { handle: "@quant_edge", platform: "Trading community", strategy: "Mean reversion", verified: true, sampleSize: quantEdgeScore.sample, winRate: Math.round(quantEdgeScore.winRate), expectancy: Number(quantEdgeScore.expectancy.toFixed(2)), maxDrawdown: 14.4, consistency: Math.round(quantEdgeScore.quality) },
  { handle: "@priceactionpro", platform: "YouTube", strategy: "Price action", verified: false, sampleSize: 207, winRate: 71, expectancy: 0.28, maxDrawdown: 19.2, consistency: 69 },
  { handle: "@flow_tracker", platform: "X", strategy: "Options / flow", verified: true, sampleSize: 391, winRate: 61, expectancy: 0.35, maxDrawdown: 9.7, consistency: 86 }
];

export function rankTraders(profiles: TraderProfile[]) {
  return [...profiles].sort((a, b) => {
    const sa = a.winRate * 0.35 + a.consistency * 0.3 + a.expectancy * 100 * 0.2 - a.maxDrawdown * 0.15;
    const sb = b.winRate * 0.35 + b.consistency * 0.3 + b.expectancy * 100 * 0.2 - b.maxDrawdown * 0.15;
    return sb - sa;
  });
}