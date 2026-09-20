import type { AssetClass, MarketAsset } from "../types";

export interface FundamentalSnapshot {
  symbol: string;
  name: string;
  sector: string;
  assetClass: AssetClass;
  currency: string;
  period: string;
  source: "DEMO_SYNTHETIC" | "PROVIDER";
  revenueGrowthYoY: number | null;
  earningsGrowthYoY: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  freeCashFlowMargin: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  roe: number | null;
  pe: number | null;
  forwardPe: number | null;
  priceToSales: number | null;
  evToEbitda: number | null;
  dividendYield: number | null;
  qualityScore: number;
  growthScore: number;
  balanceSheetScore: number;
  valuationScore: number;
  momentumContext: "FAVORABLE" | "NEUTRAL" | "CAUTION";
  flags: string[];
  warnings: string[];
}

const demo: Record<string, Omit<FundamentalSnapshot, "symbol" | "name" | "assetClass" | "currency" | "source" | "period" | "warnings">> = {
  AAPL: { sector: "Technology", revenueGrowthYoY: 5.2, earningsGrowthYoY: 8.7, grossMargin: 46.8, operatingMargin: 31.2, freeCashFlowMargin: 24.1, debtToEquity: 1.7, currentRatio: 0.9, roe: 157.0, pe: 31.5, forwardPe: 28.2, priceToSales: 8.9, evToEbitda: 24.8, dividendYield: 0.5, qualityScore: 82, growthScore: 68, balanceSheetScore: 72, valuationScore: 48, momentumContext: "FAVORABLE", flags: ["Marge opérationnelle élevée", "Valorisation exigeante"] },
  NVDA: { sector: "Semiconductors", revenueGrowthYoY: 52.0, earningsGrowthYoY: 58.0, grossMargin: 74.0, operatingMargin: 62.0, freeCashFlowMargin: 39.0, debtToEquity: 0.2, currentRatio: 4.1, roe: 118.0, pe: 44.0, forwardPe: 31.0, priceToSales: 22.0, evToEbitda: 37.0, dividendYield: 0.03, qualityScore: 91, growthScore: 97, balanceSheetScore: 94, valuationScore: 35, momentumContext: "FAVORABLE", flags: ["Croissance exceptionnelle", "Multiple élevé"] },
  MSFT: { sector: "Software", revenueGrowthYoY: 14.0, earningsGrowthYoY: 16.0, grossMargin: 69.0, operatingMargin: 45.0, freeCashFlowMargin: 29.0, debtToEquity: 0.5, currentRatio: 1.3, roe: 34.0, pe: 36.0, forwardPe: 31.0, priceToSales: 13.0, evToEbitda: 25.0, dividendYield: 0.7, qualityScore: 90, growthScore: 86, balanceSheetScore: 88, valuationScore: 44, momentumContext: "FAVORABLE", flags: ["Rentabilité robuste", "Valorisation au-dessus de la moyenne historique"] },
};

export function buildFundamentalSnapshot(asset: MarketAsset): FundamentalSnapshot {
  const row = demo[asset.symbol];
  if (row) return { ...row, symbol: asset.symbol, name: asset.name, assetClass: asset.assetClass, currency: "USD", period: "DEMO / LTM", source: "DEMO_SYNTHETIC", warnings: ["Les fondamentaux affichés sont des données de démonstration synthétiques. Ils ne doivent pas être utilisés comme données financières actuelles."] };
  return { symbol: asset.symbol, name: asset.name, sector: asset.assetClass, assetClass: asset.assetClass, currency: "—", period: "N/A", source: "DEMO_SYNTHETIC", revenueGrowthYoY: null, earningsGrowthYoY: null, grossMargin: null, operatingMargin: null, freeCashFlowMargin: null, debtToEquity: null, currentRatio: null, roe: null, pe: null, forwardPe: null, priceToSales: null, evToEbitda: null, dividendYield: null, qualityScore: 50, growthScore: 50, balanceSheetScore: 50, valuationScore: 50, momentumContext: "NEUTRAL", flags: ["Données fondamentales non disponibles pour cette classe d'actifs dans la démo"], warnings: ["Connecter un fournisseur fondamental licencié avant toute utilisation opérationnelle."] };
}

export function buildFundamentalReport(assets: MarketAsset[]) {
  const snapshots = assets.map(buildFundamentalSnapshot);
  const supported = snapshots.filter(x => x.revenueGrowthYoY !== null);
  return {
    generatedAt: new Date().toISOString(),
    snapshots,
    coverage: snapshots.length ? Math.round((supported.length / snapshots.length) * 100) : 0,
    methodology: "Analyse descriptive des fondamentaux : croissance, marges, bilan, rentabilité et multiples. Les scores sont des agrégations heuristiques et ne constituent pas une recommandation d'investissement.",
    warnings: ["le moteur utilise des données synthétiques de démonstration pour les sociétés couvertes.", "Les multiples et ratios doivent être remplacés par des données fournisseur datées avant toute analyse réelle."]
  };
}
