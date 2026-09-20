import type { AssetClass, MarketAsset, NewsItem } from "../types";

export type ImpactLevel = "LOW" | "MEDIUM" | "HIGH";
export type EventCategory = "MACRO" | "CENTRAL_BANK" | "INFLATION" | "EARNINGS" | "GEOPOLITICAL" | "COMMODITY" | "CRYPTO" | "OTHER";
export type SentimentLabel = "BULLISH" | "NEUTRAL" | "BEARISH";

export interface MarketEvent {
  id: string;
  title: string;
  category: EventCategory;
  scheduledAt: string;
  region: string;
  importance: ImpactLevel;
  affectedAssetClasses: AssetClass[];
  symbols: string[];
  source: string;
  isSynthetic: boolean;
}

export interface NewsIntelligenceItem {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  sentimentScore: number;
  sentimentLabel: SentimentLabel;
  impactScore: number;
  impact: ImpactLevel;
  symbols: string[];
  assetClasses: AssetClass[];
  drivers: string[];
  confidence: number;
  isSynthetic: boolean;
}

export interface EventNewsReport {
  generatedAt: string;
  events: MarketEvent[];
  news: NewsIntelligenceItem[];
  symbolImpact: { symbol: string; score: number; sentiment: SentimentLabel; mentions: number; impact: ImpactLevel }[];
  regimeAlerts: string[];
  warnings: string[];
  methodology: string;
}

const sentimentWords: Array<[RegExp, number, string]> = [
  [/momentum|renewed|interest|growth|surge|rally|beats|improves/i, 0.2, "vocabulaire de soutien"],
  [/pressure|decline|falls|weak|risk|tension|miss|slows|drop/i, -0.2, "vocabulaire de pression"],
  [/crisis|shock|war|default|collapse|panic/i, -0.4, "vocabulaire de stress"],
  [/stimulus|cut|easing|support/i, 0.15, "vocabulaire accommodant"]
];

function clamp(x: number) { return Math.max(-1, Math.min(1, x)); }
function level(score: number): ImpactLevel { return score >= 0.68 ? "HIGH" : score >= 0.38 ? "MEDIUM" : "LOW"; }
function label(score: number): SentimentLabel { return score > 0.12 ? "BULLISH" : score < -0.12 ? "BEARISH" : "NEUTRAL"; }
function parsePublishedAt(value: string): string {
  const mins = Number(String(value).match(/\d+/)?.[0]);
  if (Number.isFinite(mins)) return new Date(Date.now() - mins * 60_000).toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

export function analyzeNews(news: NewsItem[], assets: MarketAsset[]): NewsIntelligenceItem[] {
  const bySymbol = new Map(assets.map(a => [a.symbol, a]));
  return news.map((item, index) => {
    let score = clamp(Number(item.sentiment) || 0);
    const drivers: string[] = [];
    for (const [regex, delta, why] of sentimentWords) {
      if (regex.test(item.title)) {
        score = clamp(score + delta);
        drivers.push(why);
      }
    }
    const symbols = item.symbols.filter(s => bySymbol.has(s));
    const assetClasses = [...new Set(symbols.map(s => bySymbol.get(s)?.assetClass).filter(Boolean))] as AssetClass[];
    const impactScore = clamp(0.35 + Math.min(symbols.length, 4) * 0.12 + Math.abs(score) * 0.45);
    return {
      id: `news-${index + 1}`,
      title: item.title,
      source: item.source,
      publishedAt: parsePublishedAt(item.publishedAt),
      sentimentScore: Number(score.toFixed(2)),
      sentimentLabel: label(score),
      impactScore: Number(impactScore.toFixed(2)),
      impact: level(impactScore),
      symbols,
      assetClasses,
      drivers: [...new Set(drivers)].slice(0, 3),
      confidence: Math.min(95, Math.round(55 + Math.abs(score) * 35 + Math.min(symbols.length, 2) * 5)),
      isSynthetic: true
    };
  }).sort((a, b) => b.impactScore - a.impactScore);
}

function makeEvents(now = new Date()): MarketEvent[] {
  const day = 24 * 60 * 60 * 1000;
  return [
    { id: "evt-fed", title: "Décision de politique monétaire — démonstration", category: "CENTRAL_BANK", scheduledAt: new Date(now.getTime() + day).toISOString(), region: "US", importance: "HIGH", affectedAssetClasses: ["Indices", "Equities", "Forex", "Rates", "Crypto"], symbols: ["SPX", "NDX", "EURUSD", "GBPUSD", "BTCUSD"], source: "TER Demo Calendar", isSynthetic: true },
    { id: "evt-inflation", title: "Publication inflation — démonstration", category: "INFLATION", scheduledAt: new Date(now.getTime() + 2 * day).toISOString(), region: "US", importance: "HIGH", affectedAssetClasses: ["Indices", "Equities", "Forex", "Commodities", "Rates"], symbols: ["SPX", "NDX", "EURUSD", "XAUUSD"], source: "TER Demo Calendar", isSynthetic: true },
    { id: "evt-tech", title: "Résultats technologiques — démonstration", category: "EARNINGS", scheduledAt: new Date(now.getTime() + 3 * day).toISOString(), region: "US", importance: "MEDIUM", affectedAssetClasses: ["Equities", "Indices"], symbols: ["AAPL", "NVDA", "MSFT", "SPX", "NDX"], source: "TER Demo Calendar", isSynthetic: true },
    { id: "evt-oil", title: "Inventaires énergie — démonstration", category: "COMMODITY", scheduledAt: new Date(now.getTime() + 4 * day).toISOString(), region: "GLOBAL", importance: "MEDIUM", affectedAssetClasses: ["Commodities", "Forex", "Indices"], symbols: ["XAUUSD", "EURUSD"], source: "TER Demo Calendar", isSynthetic: true },
    { id: "evt-crypto", title: "Flux crypto institutionnels — démonstration", category: "CRYPTO", scheduledAt: new Date(now.getTime() + 5 * day).toISOString(), region: "GLOBAL", importance: "MEDIUM", affectedAssetClasses: ["Crypto"], symbols: ["BTCUSD", "ETHUSD"], source: "TER Demo Calendar", isSynthetic: true }
  ];
}

export function buildEventNewsReport(assets: MarketAsset[], news: NewsItem[], regime?: string): EventNewsReport {
  const events = makeEvents();
  const intelligence = analyzeNews(news, assets);
  const symbolMap = new Map<string, { score: number; mentions: number; absImpact: number }>();
  for (const item of intelligence) {
    for (const symbol of item.symbols) {
      const row = symbolMap.get(symbol) ?? { score: 0, mentions: 0, absImpact: 0 };
      row.score += item.sentimentScore * item.impactScore;
      row.mentions += 1;
      row.absImpact += item.impactScore;
      symbolMap.set(symbol, row);
    }
  }
  const symbolImpact = [...symbolMap.entries()].map(([symbol, row]) => ({
    symbol,
    score: Number(clamp(row.score / Math.max(1, row.mentions)).toFixed(2)),
    sentiment: label(row.score),
    mentions: row.mentions,
    impact: level(row.absImpact / Math.max(1, row.mentions))
  })).sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  const regimeAlerts: string[] = [];
  if (regime === "RISK_OFF" && intelligence.some(n => n.impact === "HIGH" && n.sentimentLabel === "BULLISH")) regimeAlerts.push("Divergence à surveiller : le régime RISK_OFF coexiste avec des nouvelles positives à fort impact.");
  if (regime === "RISK_ON" && intelligence.some(n => n.impact === "HIGH" && n.sentimentLabel === "BEARISH")) regimeAlerts.push("Divergence à surveiller : le régime RISK_ON coexiste avec des nouvelles négatives à fort impact.");
  const warnings = [
    "Le calendrier et les nouvelles affichés ici sont des données de démonstration tant qu'un fournisseur licencié n'est pas connecté.",
    "Le score de sentiment est heuristique et ne remplace pas un modèle NLP validé sur un corpus dédié."
  ];
  return {
    generatedAt: new Date().toISOString(),
    events: events.sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)),
    news: intelligence,
    symbolImpact,
    regimeAlerts,
    warnings,
    methodology: "Score heuristique combinant le sentiment fourni par le flux, un lexique de pression/soutien, la pertinence symbolique et l'importance de l'événement. Les sorties sont descriptives, avec incertitude explicite."
  };
}
