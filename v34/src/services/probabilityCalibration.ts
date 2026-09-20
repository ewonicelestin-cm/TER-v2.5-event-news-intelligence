export type OutcomeClass = "BULLISH" | "NEUTRAL" | "BEARISH";

export interface CalibrationObservation {
  id: string;
  symbol: string;
  generatedAt: string;
  horizonHours: number;
  entryPrice: number;
  probability: { bullish: number; neutral: number; bearish: number };
  resolvedAt?: string;
  exitPrice?: number;
  outcome?: OutcomeClass;
  forwardReturnPct?: number;
}

export interface CalibrationBin {
  bucket: string;
  count: number;
  predicted: number;
  observed: number;
  gap: number;
}

export interface CalibrationReport {
  symbol: string;
  sampleSize: number;
  resolved: number;
  pending: number;
  brierScore: number | null;
  logLoss: number | null;
  accuracy: number | null;
  meanConfidence: number | null;
  reliability: CalibrationBin[];
  status: "INSUFFICIENT_SAMPLE" | "CALIBRATING";
  note: string;
}

const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const outcomeIndex = (o: OutcomeClass) => o === "BULLISH" ? 0 : o === "NEUTRAL" ? 1 : 2;

export function resolveObservation(obs: CalibrationObservation, exitPrice: number, resolvedAt: string, neutralBandPct = 0.25): CalibrationObservation {
  const forwardReturnPct = obs.entryPrice > 0 ? ((exitPrice / obs.entryPrice) - 1) * 100 : 0;
  const outcome: OutcomeClass = forwardReturnPct > neutralBandPct ? "BULLISH" : forwardReturnPct < -neutralBandPct ? "BEARISH" : "NEUTRAL";
  return { ...obs, exitPrice, resolvedAt, outcome, forwardReturnPct };
}

export function calibrationReport(observations: CalibrationObservation[], symbol: string): CalibrationReport {
  const resolved = observations.filter(o => o.outcome && Number.isFinite(o.exitPrice));
  if (!resolved.length) {
    return { symbol, sampleSize: observations.length, resolved: 0, pending: observations.length, brierScore: null, logLoss: null, accuracy: null, meanConfidence: null, reliability: [], status: "INSUFFICIENT_SAMPLE", note: "Aucune observation résolue : TER collecte d'abord des scénarios puis mesure leurs résultats hors-échantillon." };
  }
  let brier = 0, logLoss = 0, correct = 0, confidence = 0;
  const bins = Array.from({ length: 5 }, (_, i) => ({ count: 0, predicted: 0, positive: 0 }));
  for (const o of resolved) {
    const p = [o.probability.bullish, o.probability.neutral, o.probability.bearish].map(x => clamp(x / 100));
    const idx = outcomeIndex(o.outcome!);
    brier += p.reduce((s, x, i) => s + (x - (i === idx ? 1 : 0)) ** 2, 0);
    logLoss += -Math.log(Math.max(1e-6, p[idx]));
    const predictedIdx = p.indexOf(Math.max(...p));
    if (predictedIdx === idx) correct++;
    const maxP = Math.max(...p);
    confidence += maxP;
    const bin = bins[Math.min(4, Math.floor(maxP * 5))];
    bin.count++; bin.predicted += maxP; bin.positive += predictedIdx === idx ? 1 : 0;
  }
  const reliability = bins.filter(b => b.count).map((b, i) => {
    const predicted = b.predicted / b.count;
    const observed = b.positive / b.count;
    return { bucket: `${i * 20}-${i === 4 ? 100 : (i + 1) * 20}%`, count: b.count, predicted: Math.round(predicted * 1000) / 10, observed: Math.round(observed * 1000) / 10, gap: Math.round(Math.abs(predicted - observed) * 1000) / 10 };
  });
  return { symbol, sampleSize: observations.length, resolved: resolved.length, pending: observations.length - resolved.length, brierScore: brier / resolved.length, logLoss: logLoss / resolved.length, accuracy: correct / resolved.length * 100, meanConfidence: confidence / resolved.length * 100, reliability, status: resolved.length >= 30 ? "CALIBRATING" : "INSUFFICIENT_SAMPLE", note: resolved.length >= 30 ? "Mesures calculées sur des observations résolues; elles servent à évaluer la calibration, pas à garantir les résultats futurs." : "Échantillon encore trop court pour une calibration statistique robuste." };
}
