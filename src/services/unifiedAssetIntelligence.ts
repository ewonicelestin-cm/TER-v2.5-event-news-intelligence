import type { MarketAsset, Signal, OHLCVBar } from "../types";
import { computeSnapshot, type IndicatorSnapshot } from "./technicalIndicators";
import { buildFundamentalSnapshot, type FundamentalSnapshot } from "./fundamentalEngine";
import { buildNLPEventReport } from "./nlpEventEngine";
import { analyzeNews } from "./eventNewsEngine";
import { buildEventNewsReport } from "./eventNewsEngine";
import type { NewsItem } from "../types";
import type { MarketEvent } from "./eventNewsEngine";
import { buildAIDecision, type AIDecision } from "./aiDecisionEngine";

export interface UnifiedAssetIntelligence {
  generatedAt: string;
  asset: MarketAsset;
  technical: IndicatorSnapshot | null;
  signal: Signal | null;
  fundamental: FundamentalSnapshot;
  news: {
    sentimentScore: number;
    sentimentLabel: string;
    impactScore: number;
    noveltyScore: number;
    urgencyScore: number;
    count: number;
    topItems: Array<{ title: string; source: string; sentimentScore: number; impact: string; publishedAt: string }>;
  };
  events: Array<Pick<MarketEvent, "id" | "title" | "category" | "scheduledAt" | "region" | "importance">>;
  macro: {
    regime: string;
    score: number;
    confidence: number;
  };
  ai: AIDecision | null;
  dataHealth: {
    status: string;
    score: number;
    source: string;
    provider?: string;
    receivedAt?: string;
    latencyMs?: number;
  };
  factors: Array<{ name: string; value: number; direction: "POSITIVE" | "NEGATIVE" | "NEUTRAL"; weight: number; note: string }>;
  warnings: string[];
}

function direction(value: number): "POSITIVE" | "NEGATIVE" | "NEUTRAL" {
  if (value > 0.15) return "POSITIVE";
  if (value < -0.15) return "NEGATIVE";
  return "NEUTRAL";
}

export function buildUnifiedAssetIntelligence(
  asset: MarketAsset,
  bars: OHLCVBar[],
  signal: Signal | null,
  news: NewsItem[],
  events: MarketEvent[],
  macro: { regime: string; score: number; confidence: number }
): UnifiedAssetIntelligence {
  const technical = computeSnapshot(bars, asset.assetClass, "1D");
  const fundamental = buildFundamentalSnapshot(asset);
  const analyzedNews = analyzeNews(news, [asset]);
  const nlp = buildNLPEventReport(analyzedNews.filter(n => n.symbols.includes(asset.symbol)), events.filter(e => e.symbols.includes(asset.symbol)), [asset]);
  const relevantNews = nlp.news;
  const sentimentScore = relevantNews.length ? relevantNews.reduce((s, n) => s + n.sentimentScore, 0) / relevantNews.length : 0;
  const impactScore = relevantNews.length ? relevantNews.reduce((s, n) => s + n.impactScore, 0) / relevantNews.length : 0;
  const noveltyScore = relevantNews.length ? Math.max(...relevantNews.map(n => n.noveltyScore)) : 0;
  const urgencyScore = relevantNews.length ? Math.max(...relevantNews.map(n => n.urgencyScore)) : 0;

  const ai = signal ? buildAIDecision(asset, signal) : null;
  const factors = [
    { name: "Technique", value: technical ? (technical.ema20 > technical.ema50 ? 0.65 : -0.65) : 0, direction: direction(technical ? (technical.ema20 > technical.ema50 ? 0.65 : -0.65) : 0), weight: 25, note: technical ? `EMA20 ${technical.ema20 > technical.ema50 ? ">" : "<"} EMA50` : "Données techniques insuffisantes" },
    { name: "Signal", value: signal ? (signal.direction === "LONG" ? 0.8 : signal.direction === "SHORT" ? -0.8 : 0) : 0, direction: direction(signal ? (signal.direction === "LONG" ? 0.8 : signal.direction === "SHORT" ? -0.8 : 0) : 0), weight: 20, note: signal ? `${signal.direction} · ${signal.score}/100` : "Aucun signal disponible" },
    { name: "Fondamentaux", value: (fundamental.qualityScore - 50) / 50, direction: direction((fundamental.qualityScore - 50) / 50), weight: 20, note: `Qualité ${fundamental.qualityScore}/100 · ${fundamental.source}` },
    { name: "News / NLP", value: sentimentScore, direction: direction(sentimentScore), weight: 15, note: `${relevantNews.length} publication(s) analysée(s)` },
    { name: "Macro", value: (macro.score - 50) / 50, direction: direction((macro.score - 50) / 50), weight: 20, note: `${macro.regime} · confiance ${macro.confidence}%` },
  ];

  const warnings = [
    ...(asset.dataSource === "synthetic" ? ["Le prix de marché est synthétique."] : []),
    ...(fundamental.source === "DEMO_SYNTHETIC" ? ["Les fondamentaux sont synthétiques de démonstration."] : []),
    ...(relevantNews.length === 0 ? ["Aucune news directement attribuée à cet actif."] : []),
    ...(bars.length < 60 ? ["Historique technique court : prudence sur les indicateurs."] : []),
  ];

  return {
    generatedAt: new Date().toISOString(), asset, technical, signal, fundamental,
    news: { sentimentScore: Number(sentimentScore.toFixed(3)), sentimentLabel: sentimentScore > 0.15 ? "BULLISH" : sentimentScore < -0.15 ? "BEARISH" : "NEUTRAL", impactScore: Number(impactScore.toFixed(3)), noveltyScore: Number(noveltyScore.toFixed(3)), urgencyScore: Number(urgencyScore.toFixed(3)), count: relevantNews.length, topItems: relevantNews.slice(0, 5).map(n => ({ title: n.title, source: n.source, sentimentScore: n.sentimentScore, impact: n.impact, publishedAt: n.publishedAt })) },
    events: events.filter(e => e.symbols.includes(asset.symbol)).slice(0, 8).map(e => ({ id: e.id, title: e.title, category: e.category, scheduledAt: e.scheduledAt, region: e.region, importance: e.importance })),
    macro, ai, dataHealth: { status: asset.dataQuality ?? "UNKNOWN", score: asset.dataQualityScore ?? 0, source: asset.dataSource ?? "unknown", provider: asset.provider, receivedAt: asset.receivedAt, latencyMs: asset.latencyMs }, factors, warnings
  };
}
