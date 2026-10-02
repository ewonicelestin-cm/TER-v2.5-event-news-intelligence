import type { AssetClass, MarketAsset } from "../types";

export interface FundamentalSnapshot {
  symbol: string;
  name: string;
  sector: string;
  assetClass: AssetClass;
  currency: string;
  period: string;
  source: "OFFICIAL_REPORTS" | "PROVIDER";
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
  description?: string;
  reliableSource?: string;
  flags: string[];
  warnings: string[];
}

const demo: Record<string, Omit<FundamentalSnapshot, "symbol" | "name" | "assetClass" | "currency" | "source" | "period" | "warnings">> = {
  AAPL: { sector: "Technology", revenueGrowthYoY: 5.2, earningsGrowthYoY: 8.7, grossMargin: 46.8, operatingMargin: 31.2, freeCashFlowMargin: 24.1, debtToEquity: 1.7, currentRatio: 0.9, roe: 157.0, pe: 31.5, forwardPe: 28.2, priceToSales: 8.9, evToEbitda: 24.8, dividendYield: 0.5, qualityScore: 82, growthScore: 68, balanceSheetScore: 72, valuationScore: 48, momentumContext: "FAVORABLE", description: "Leader mondial de l'électronique grand public et des services numériques. Apple bénéficie d'un écosystème fermé et d'un fort pouvoir de fixation des prix.", reliableSource: "Rapports annuels (SEC Form 10-K)", flags: ["Marge opérationnelle élevée", "Valorisation exigeante"] },
  NVDA: { sector: "Semiconductors", revenueGrowthYoY: 52.0, earningsGrowthYoY: 58.0, grossMargin: 74.0, operatingMargin: 62.0, freeCashFlowMargin: 39.0, debtToEquity: 0.2, currentRatio: 4.1, roe: 118.0, pe: 44.0, forwardPe: 31.0, priceToSales: 22.0, evToEbitda: 37.0, dividendYield: 0.03, qualityScore: 91, growthScore: 97, balanceSheetScore: 94, valuationScore: 35, momentumContext: "FAVORABLE", description: "Pionnier du calcul accéléré et leader incontesté des processeurs pour l'intelligence artificielle générative (GPUs).", reliableSource: "NVIDIA Investor Relations / GTC Conference", flags: ["Croissance exceptionnelle", "Multiple élevé"] },
  MSFT: { sector: "Software", revenueGrowthYoY: 14.0, earningsGrowthYoY: 16.0, grossMargin: 69.0, operatingMargin: 45.0, freeCashFlowMargin: 29.0, debtToEquity: 0.5, currentRatio: 1.3, roe: 34.0, pe: 36.0, forwardPe: 31.0, priceToSales: 13.0, evToEbitda: 25.0, dividendYield: 0.7, qualityScore: 90, growthScore: 86, balanceSheetScore: 88, valuationScore: 44, momentumContext: "FAVORABLE", description: "Géant du logiciel (Windows, Office) et leader du Cloud (Azure), avec une intégration majeure de l'IA via OpenAI.", reliableSource: "Microsoft Investor Relations", flags: ["Rentabilité robuste", "Valorisation au-dessus de la moyenne historique"] },
  XAUUSD: { sector: "Precious Metals", revenueGrowthYoY: null, earningsGrowthYoY: null, grossMargin: null, operatingMargin: null, freeCashFlowMargin: null, debtToEquity: null, currentRatio: null, roe: null, pe: null, forwardPe: null, priceToSales: null, evToEbitda: null, dividendYield: null, qualityScore: 85, growthScore: 60, balanceSheetScore: 95, valuationScore: 70, momentumContext: "NEUTRAL", description: "L'or est l'actif refuge par excellence. Il sert de réserve de valeur contre l'inflation et les dévaluations monétaires. La demande est portée par les banques centrales et la joaillerie.", reliableSource: "World Gold Council (WGC) / LBMA", flags: ["Hedge inflation", "Réserve de valeur"] },
  XAGUSD: { sector: "Precious Metals", revenueGrowthYoY: null, earningsGrowthYoY: null, grossMargin: null, operatingMargin: null, freeCashFlowMargin: null, debtToEquity: null, currentRatio: null, roe: null, pe: null, forwardPe: null, priceToSales: null, evToEbitda: null, dividendYield: null, qualityScore: 78, growthScore: 65, balanceSheetScore: 85, valuationScore: 75, momentumContext: "NEUTRAL", description: "L'argent combine des propriétés d'investissement et industrielles majeures (panneaux solaires, électronique, conducteurs). Sa volatilité est historiquement plus élevée que celle de l'or.", reliableSource: "Silver Institute / The Silver Institute Reports", flags: ["Usage industriel", "Volatilité élevée"] },
  HG1: { sector: "Industrial Metals", revenueGrowthYoY: null, earningsGrowthYoY: null, grossMargin: null, operatingMargin: null, freeCashFlowMargin: null, debtToEquity: null, currentRatio: null, roe: null, pe: null, forwardPe: null, priceToSales: null, evToEbitda: null, dividendYield: null, qualityScore: 75, growthScore: 70, balanceSheetScore: 80, valuationScore: 65, momentumContext: "FAVORABLE", description: "Le cuivre est un baromètre de la santé économique mondiale (Dr. Copper). Crucial pour l'électrification, les véhicules électriques et les infrastructures d'énergie renouvelable.", reliableSource: "LME / ICSG (International Copper Study Group)", flags: ["Baromètre économique", "Transition énergétique"] },
  CL1: { sector: "Energy", revenueGrowthYoY: null, earningsGrowthYoY: null, grossMargin: null, operatingMargin: null, freeCashFlowMargin: null, debtToEquity: null, currentRatio: null, roe: null, pe: null, forwardPe: null, priceToSales: null, evToEbitda: null, dividendYield: null, qualityScore: 70, growthScore: 55, balanceSheetScore: 75, valuationScore: 60, momentumContext: "CAUTION", description: "Le pétrole brut WTI est la référence américaine. Le prix est fortement influencé par les tensions géopolitiques, les décisions de l'OPEP+ et la demande mondiale de transport.", reliableSource: "IEA (International Energy Agency) / EIA / OPEC", flags: ["Risque géopolitique", "Sensibilité offre/demande"] },
  DAX: { sector: "Indices - Europe", revenueGrowthYoY: null, earningsGrowthYoY: null, grossMargin: null, operatingMargin: null, freeCashFlowMargin: null, debtToEquity: null, currentRatio: null, roe: null, pe: null, forwardPe: null, priceToSales: null, evToEbitda: null, dividendYield: 3.2, qualityScore: 78, growthScore: 45, balanceSheetScore: 82, valuationScore: 65, momentumContext: "NEUTRAL", description: "Indice phare de la Bourse de Francfort, regroupant les 40 plus grandes entreprises allemandes. Reflet de la puissance industrielle de la zone euro.", reliableSource: "Deutsche Börse AG / STOXX Ltd", flags: ["Industrie exportatrice", "Benchmark Eurozone"] },
  NI225: { sector: "Indices - Asie", revenueGrowthYoY: null, earningsGrowthYoY: null, grossMargin: null, operatingMargin: null, freeCashFlowMargin: null, debtToEquity: null, currentRatio: null, roe: null, pe: null, forwardPe: null, priceToSales: null, evToEbitda: null, dividendYield: 2.1, qualityScore: 75, growthScore: 52, balanceSheetScore: 85, valuationScore: 58, momentumContext: "NEUTRAL", description: "L'indice de référence du Japon, pondéré par les prix des actions, incluant les fleurons technologiques et industriels nippons.", reliableSource: "Nikkei Inc. / Tokyo Stock Exchange (TSE)", flags: ["Yen Carry Trade", "Tech & Auto Asie"] },
  HSI: { sector: "Indices - Asie", revenueGrowthYoY: null, earningsGrowthYoY: null, grossMargin: null, operatingMargin: null, freeCashFlowMargin: null, debtToEquity: null, currentRatio: null, roe: null, pe: null, forwardPe: null, priceToSales: null, evToEbitda: null, dividendYield: 4.5, qualityScore: 68, growthScore: 40, balanceSheetScore: 72, valuationScore: 82, momentumContext: "CAUTION", description: "Indice de Hong Kong, passage obligé pour les flux de capitaux internationaux vers la Chine continentale. Sensible aux régulations de Pékin.", reliableSource: "Hang Seng Indexes Company Limited / HKEX", flags: ["Proxy Chine", "Multiple historiquement bas"] },
  J200: { sector: "Indices - Afrique", revenueGrowthYoY: null, earningsGrowthYoY: null, grossMargin: null, operatingMargin: null, freeCashFlowMargin: null, debtToEquity: null, currentRatio: null, roe: null, pe: null, forwardPe: null, priceToSales: null, evToEbitda: null, dividendYield: 3.8, qualityScore: 72, growthScore: 48, balanceSheetScore: 78, valuationScore: 72, momentumContext: "NEUTRAL", description: "Le JSE Top 40 représente les plus grandes capitalisations d'Afrique du Sud, fortement exposé aux secteurs minier, financier et aux biens de consommation.", reliableSource: "Johannesburg Stock Exchange (JSE) / FTSE Russell", flags: ["Benchmark Afrique", "Exposition minière"] },
  TSM: { sector: "Semiconductors - Asie", revenueGrowthYoY: 36.0, earningsGrowthYoY: 32.0, grossMargin: 54.0, operatingMargin: 42.0, freeCashFlowMargin: 25.0, debtToEquity: 0.3, currentRatio: 2.5, roe: 28.0, pe: 28.5, forwardPe: 22.0, priceToSales: 9.5, evToEbitda: 14.2, dividendYield: 1.4, qualityScore: 92, growthScore: 88, balanceSheetScore: 90, valuationScore: 55, momentumContext: "FAVORABLE", description: "Leader mondial de la fonderie de semi-conducteurs. TSMC fabrique les puces de pointe pour Apple, NVIDIA et AMD, au cœur de la chaîne d'approvisionnement mondiale.", reliableSource: "TSMC Investor Relations / MOPS Taiwan", flags: ["Incontournable IA", "Avance technologique"] },
  "MC.PA": { sector: "Consumer Luxury - Europe", revenueGrowthYoY: 10.0, earningsGrowthYoY: 8.5, grossMargin: 68.0, operatingMargin: 26.0, freeCashFlowMargin: 18.0, debtToEquity: 0.6, currentRatio: 1.2, roe: 25.0, pe: 24.0, forwardPe: 21.5, priceToSales: 4.2, evToEbitda: 13.8, dividendYield: 1.8, qualityScore: 88, growthScore: 70, balanceSheetScore: 85, valuationScore: 52, momentumContext: "FAVORABLE", description: "LVMH est le premier groupe mondial de luxe, possédant 75 marques prestigieuses. Très exposé à la consommation haut de gamme en Chine et aux États-Unis.", reliableSource: "LVMH Finance / Euronext Paris", flags: ["Pouvoir de marque", "Diversification luxe"] },
};

export function buildFundamentalSnapshot(asset: MarketAsset): FundamentalSnapshot {
  const row = demo[asset.symbol];
  if (row) return { ...row, symbol: asset.symbol, name: asset.name, assetClass: asset.assetClass, currency: "USD", period: "DEMO / LTM", source: "OFFICIAL_REPORTS", warnings: ["Les fondamentaux affichés sont des données de démonstration synthétiques. Ils ne doivent pas être utilisés comme données financières actuelles."] };
  return { symbol: asset.symbol, name: asset.name, sector: asset.assetClass, assetClass: asset.assetClass, currency: "—", period: "N/A", source: "OFFICIAL_REPORTS", revenueGrowthYoY: null, earningsGrowthYoY: null, grossMargin: null, operatingMargin: null, freeCashFlowMargin: null, debtToEquity: null, currentRatio: null, roe: null, pe: null, forwardPe: null, priceToSales: null, evToEbitda: null, dividendYield: null, qualityScore: 50, growthScore: 50, balanceSheetScore: 50, valuationScore: 50, momentumContext: "NEUTRAL", flags: [], warnings: [] };
}

export function buildFundamentalReport(assets: MarketAsset[]) {
  const snapshots = assets.map(buildFundamentalSnapshot);
  const supported = snapshots.filter(x => x.revenueGrowthYoY !== null);
  return {
    generatedAt: new Date().toISOString(),
    snapshots,
    coverage: snapshots.length ? Math.round((supported.length / snapshots.length) * 100) : 0,
    methodology: "Analyse descriptive des fondamentaux : croissance, marges, bilan, rentabilité et multiples.",
    warnings: []
  };
}
