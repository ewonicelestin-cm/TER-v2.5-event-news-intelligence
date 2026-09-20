import type { MarketAsset, Signal } from "../types";
import type { SignalIntelligence } from "./signalIntelligence";

export type AIStance = "BULLISH" | "BEARISH" | "NEUTRAL";
export type AIAgreement = "HIGH" | "MEDIUM" | "LOW";

export interface AIExpertOpinion {
  name: string;
  role: string;
  stance: AIStance;
  score: number;
  confidence: number;
  reasons: string[];
}

export interface AIDecision {
  engine: "TER Advanced Ensemble v3.6";
  generatedAt: string;
  stance: AIStance;
  probability: { bullish: number; neutral: number; bearish: number };
  uncertainty: number;
  agreement: AIAgreement;
  experts: AIExpertOpinion[];
  scenario: {
    primary: string;
    invalidation: string;
    alternative: string;
    horizon: string;
  };
  dataQuality: { status: string; score: number; provider: string };
  disclaimer: string;
}

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

function stanceFromScore(score: number): AIStance {
  return score >= 60 ? "BULLISH" : score <= 40 ? "BEARISH" : "NEUTRAL";
}

export function buildAIDecision(asset: MarketAsset, signal: Signal & { intelligence?: SignalIntelligence }): AIDecision {
  const intel = signal.intelligence;
  const evidence = intel?.evidence ?? [];
  const bullish = evidence.filter(e => e.direction === "LONG").length;
  const bearish = evidence.filter(e => e.direction === "SHORT").length;
  const totalDirectional = bullish + bearish;
  const agreement = totalDirectional === 0 ? 0.5 : Math.max(bullish, bearish) / totalDirectional;

  const technicalScore = intel?.confluenceScore ?? signal.score;
  const regimeBias = evidence.length ? evidence.reduce((sum, e) => sum + (e.score - 50), 0) / evidence.length : signal.score - 50;
  const structureBias = intel?.structure.breakout === "UP" ? 15 : intel?.structure.breakout === "DOWN" ? -15 : 0;
  const divergenceBias = intel?.divergences.reduce((sum, d) => sum + (d.type === "BULLISH" ? 1 : -1) * d.strength / 8, 0) ?? 0;
  const quality = asset.dataQualityScore ?? 45;

  const experts: AIExpertOpinion[] = [
    {
      name: "Technical Expert v3.6",
      role: "Indicateurs et momentum avancé",
      stance: stanceFromScore(technicalScore),
      score: Math.round(clamp(technicalScore)),
      confidence: Math.round(clamp(55 + Math.abs(technicalScore - 50))),
      reasons: intel?.evidence.flatMap(e => e.reasons).slice(0, 3) ?? signal.reasons.slice(0, 3)
    },
    {
      name: "Regime Strategist",
      role: "Régime multi-timeframe & Macro",
      stance: stanceFromScore(clamp(50 + regimeBias)),
      score: Math.round(clamp(50 + regimeBias)),
      confidence: Math.round(clamp(50 + Math.abs(regimeBias) * 1.5)),
      reasons: evidence.map(e => `${e.timeframe}: ${e.regime}`).slice(0, 3)
    },
    {
      name: "Structural Analyst",
      role: "Supports, résistances & cassures",
      stance: stanceFromScore(50 + structureBias),
      score: Math.round(clamp(50 + structureBias)),
      confidence: structureBias === 0 ? 50 : 72,
      reasons: [intel?.structure.breakout !== "NONE" ? `Cassure ${intel?.structure.breakout} identifiée` : "Phase de consolidation structurelle"]
    },
    {
      name: "Predictive Analyst",
      role: "Divergences & probabilités",
      stance: stanceFromScore(50 + divergenceBias),
      score: Math.round(clamp(50 + divergenceBias)),
      confidence: intel?.divergences.length ? 65 : 50,
      reasons: intel?.divergences.length ? intel.divergences.map(d => d.description) : ["Équilibre prédictif : pas de divergence majeure"]
    },
    {
      name: "Reliability Auditor",
      role: "Intégrité des données v3.5+",
      stance: "NEUTRAL",
      score: Math.round(clamp(quality)),
      confidence: Math.round(clamp(quality)),
      reasons: [`Flux ${asset.provider ?? "synthetic"}`, `Fiabilité ${asset.dataQuality ?? "UNKNOWN"} (${quality}/100)`]
    }
  ];

  const weighted = experts.slice(0, 4).reduce((sum, e) => sum + (e.score - 50), 0) / 4;
  const raw = clamp(50 + weighted * 0.65);
  const direction = stanceFromScore(raw);
  const qualityPenalty = quality < 60 ? (60 - quality) * 0.35 : 0;
  const uncertainty = Math.round(clamp(100 - (Math.abs(raw - 50) * 1.35 + agreement * 25 - qualityPenalty)));

  let bullishProb = direction === "BULLISH" ? raw : 35;
  let bearishProb = direction === "BEARISH" ? 100 - raw : 35;
  if (direction === "NEUTRAL") { bullishProb = 40; bearishProb = 40; }
  let neutralProb = 100 - bullishProb - bearishProb;
  if (neutralProb < 10) {
    const excess = 10 - neutralProb;
    bullishProb -= excess / 2;
    bearishProb -= excess / 2;
    neutralProb = 10;
  }
  const normalizer = bullishProb + neutralProb + bearishProb;
  const probability = {
    bullish: Math.round(bullishProb / normalizer * 100),
    neutral: Math.round(neutralProb / normalizer * 100),
    bearish: 0
  };
  probability.bearish = Math.max(0, 100 - probability.bullish - probability.neutral);

  const agreementLevel: AIAgreement = agreement >= 0.8 ? "HIGH" : agreement >= 0.6 ? "MEDIUM" : "LOW";

  const primary = direction === "BULLISH"
    ? `L'analyse v3.6 favorise une dynamique haussière avec un score de ${probability.bullish}%. La confluence technique et structurelle suggère une poursuite vers les objectifs.`
    : direction === "BEARISH"
      ? `L'analyse v3.6 identifie une pression baissière dominante (${probability.bearish}%). Les indicateurs de momentum et la structure de marché s'alignent vers le bas.`
      : "Stagnation détectée : les forces haussières et baissières s'équilibrent. Le modèle Advanced Intelligence reste neutre en l'absence de cassure confirmée.";

  const invalidation = intel && intel.structure.breakout !== "NONE"
    ? `Le scénario est invalidé par un retour sous la structure de cassure ${intel.structure.breakout} ou une baisse de confiance < 50%.`
    : "Une divergence inverse forte ou une rupture des supports/résistances majeurs invalide la thèse actuelle.";

  const alternative = direction === "NEUTRAL"
    ? "Une accélération du volume sur les résistances pourrait forcer un scénario haussier agressif."
    : "Une phase de distribution latérale est probable si le momentum actuel s'essouffle prématurément.";

  const horizon = uncertainty < 30 ? "Court terme (6-24h)" : uncertainty < 60 ? "Moyen terme (1-3 jours)" : "Indéterminé (Haute incertitude)";

  return {
    engine: "TER Advanced Ensemble v3.6",
    generatedAt: new Date().toISOString(),
    stance: direction,
    probability,
    uncertainty,
    agreement: agreementLevel,
    experts,
    scenario: { primary, invalidation, alternative, horizon },
    dataQuality: { status: asset.dataQuality ?? "UNKNOWN", score: quality, provider: asset.provider ?? "unknown" },
    disclaimer: "Release Final v3.6 - Prototype de recherche IA. Sortie analytique probabiliste destinée au paper trading."
  };
}
