import type { AssetClass, MarketAsset } from "../types";
import type { NewsIntelligenceItem, MarketEvent } from "./eventNewsEngine";

export type EntityType = "COMPANY" | "COUNTRY" | "CENTRAL_BANK" | "COMMODITY" | "ASSET" | "MACRO";
export interface NLPEntity { text: string; type: EntityType; confidence: number; }
export interface NLPNewsItem extends NewsIntelligenceItem {
  normalizedTitle: string;
  entities: NLPEntity[];
  topics: string[];
  noveltyScore: number;
  urgencyScore: number;
  contradictionScore: number;
  language: "fr" | "en" | "unknown";
  dedupeKey: string;
}
export interface EventImpactAttribution {
  eventId: string;
  symbol: string;
  impactScore: number;
  direction: "POSITIVE" | "NEGATIVE" | "MIXED";
  drivers: string[];
  historicalEvidence: "UNAVAILABLE" | "DEMO_HEURISTIC";
}
export interface NLPEventReport {
  generatedAt: string;
  news: NLPNewsItem[];
  events: MarketEvent[];
  entities: { text: string; type: EntityType; mentions: number }[];
  topics: { topic: string; mentions: number; sentiment: number }[];
  attributions: EventImpactAttribution[];
  duplicateGroups: number;
  warnings: string[];
  methodology: string;
}

const rules: Array<[RegExp, string]> = [
  [/inflation|cpi|consumer price|prix/i, "INFLATION"],
  [/rate|rates|taux|fed|ecb|central bank|banque centrale/i, "RATES"],
  [/earnings|revenue|profit|guidance|résultats|bénéfice/i, "EARNINGS"],
  [/oil|crude|brent|wti|pétrole|energy|énergie/i, "ENERGY"],
  [/gold|silver|copper|or|argent|cuivre/i, "METALS"],
  [/bitcoin|ethereum|crypto|blockchain/i, "CRYPTO"],
  [/war|conflict|sanctions|geopolit|guerre|sanctions/i, "GEOPOLITICS"],
  [/jobs|employment|payroll|chômage|emploi/i, "LABOR"]
];

const entityRules: Array<[RegExp, EntityType, string]> = [
  [/\b(Fed|Federal Reserve|Réserve fédérale)\b/i, "CENTRAL_BANK", "Fed"],
  [/\b(ECB|BCE|European Central Bank|Banque centrale européenne)\b/i, "CENTRAL_BANK", "ECB"],
  [/\b(AAPL|Apple)\b/i, "COMPANY", "Apple"],
  [/\b(NVDA|Nvidia)\b/i, "COMPANY", "Nvidia"],
  [/\b(MSFT|Microsoft)\b/i, "COMPANY", "Microsoft"],
  [/\b(BTC|Bitcoin)\b/i, "ASSET", "Bitcoin"],
  [/\b(ETH|Ethereum)\b/i, "ASSET", "Ethereum"],
  [/\b(XAU|gold|or)\b/i, "COMMODITY", "Gold"],
  [/\b(US|USA|United States|États-Unis)\b/i, "COUNTRY", "United States"],
  [/\b(EU|Eurozone|zone euro)\b/i, "COUNTRY", "Eurozone"]
];

function normalize(s: string) { return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
function language(title: string): "fr" | "en" | "unknown" { if (/\b(le|la|les|des|une|avec|pour|sur|taux|inflation|banque)\b/i.test(title)) return "fr"; if (/\b(the|and|with|for|on|rate|bank|inflation)\b/i.test(title)) return "en"; return "unknown"; }
function topics(title: string) { return [...new Set(rules.filter(([r]) => r.test(title)).map(([,t]) => t))]; }
function entities(title: string): NLPEntity[] { return entityRules.filter(([r]) => r.test(title)).map(([,type,text]) => ({ text, type, confidence: 0.86 })); }
function dedupeKey(title: string) { return normalize(title).split(" ").slice(0, 12).join("-"); }

export function enrichNewsNLP(items: NewsIntelligenceItem[], assets: MarketAsset[]): NLPNewsItem[] {
  const assetSymbols = new Set(assets.map(a => a.symbol));
  const seen = new Map<string, number>();
  return items.map(item => {
    const normalizedTitle = normalize(item.title);
    const key = dedupeKey(item.title);
    const previous = seen.get(key) ?? 0;
    seen.set(key, previous + 1);
    const ts = Date.parse(item.publishedAt);
    const ageHours = Number.isFinite(ts) ? Math.max(0, (Date.now() - ts) / 3600000) : 24;
    const urgencyScore = Math.min(1, (item.impactScore * 0.65) + (ageHours < 2 ? 0.35 : ageHours < 8 ? 0.2 : 0));
    const noveltyScore = previous === 0 ? 1 : Math.max(0.1, 1 / (previous + 1));
    const contradictionScore = item.sentimentLabel === "NEUTRAL" ? 0.08 : item.impact === "HIGH" ? 0.18 : 0.05;
    const inferredSymbols = item.symbols.filter(s => assetSymbols.has(s));
    return { ...item, symbols: inferredSymbols, normalizedTitle, entities: entities(item.title), topics: topics(item.title), noveltyScore: Number(noveltyScore.toFixed(2)), urgencyScore: Number(urgencyScore.toFixed(2)), contradictionScore: Number(contradictionScore.toFixed(2)), language: language(item.title), dedupeKey: key };
  });
}

export function buildNLPEventReport(items: NewsIntelligenceItem[], events: MarketEvent[], assets: MarketAsset[]): NLPEventReport {
  const news = enrichNewsNLP(items, assets);
  const entityMap = new Map<string, { type: EntityType; mentions: number }>();
  const topicMap = new Map<string, { mentions: number; sentiment: number }>();
  for (const item of news) {
    for (const e of item.entities) { const row = entityMap.get(e.text) ?? { type: e.type, mentions: 0 }; row.mentions++; entityMap.set(e.text, row); }
    for (const t of item.topics) { const row = topicMap.get(t) ?? { mentions: 0, sentiment: 0 }; row.mentions++; row.sentiment += item.sentimentScore; topicMap.set(t, row); }
  }
  const attributions: EventImpactAttribution[] = [];
  for (const event of events) {
    for (const symbol of event.symbols) {
      const related = news.filter(n => n.symbols.includes(symbol) || n.assetClasses.some(c => event.affectedAssetClasses.includes(c)));
      if (!related.length) continue;
      const signed = related.reduce((s, n) => s + n.sentimentScore * n.impactScore, 0) / related.length;
      attributions.push({ eventId: event.id, symbol, impactScore: Number(Math.min(1, event.importance === "HIGH" ? 0.75 + Math.abs(signed) * 0.25 : 0.4 + Math.abs(signed) * 0.35).toFixed(2)), direction: signed > 0.08 ? "POSITIVE" : signed < -0.08 ? "NEGATIVE" : "MIXED", drivers: [...new Set(related.flatMap(n => [...n.topics, ...n.drivers]))].slice(0, 4), historicalEvidence: "DEMO_HEURISTIC" });
    }
  }
  return {
    generatedAt: new Date().toISOString(), news, events,
    entities: [...entityMap.entries()].map(([text, row]) => ({ text, ...row })).sort((a,b)=>b.mentions-a.mentions),
    topics: [...topicMap.entries()].map(([topic,row]) => ({ topic, mentions: row.mentions, sentiment: Number((row.sentiment/row.mentions).toFixed(2)) })).sort((a,b)=>b.mentions-a.mentions),
    attributions,
    duplicateGroups: news.filter((n, i, arr) => arr.findIndex(x => x.dedupeKey === n.dedupeKey) !== i).length,
    warnings: [
      "NLP est actuellement hybride : règles lexicales + entités connues. Il ne prétend pas remplacer un modèle NLP financier entraîné et validé.",
      "Les données d'actualité et d'événements restent synthétiques dans la démo tant qu'un fournisseur licencié n'est pas connecté.",
      "L'attribution historique d'impact sera activée après constitution d'un historique événement → réaction de marché hors-échantillon."
    ],
    methodology: "Normalisation, déduplication, extraction d'entités, classification thématique, nouveauté/urgence, puis attribution heuristique aux actifs concernés. Chaque score est accompagné de sa limite méthodologique."
  };
}
