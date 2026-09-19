import type { AssetClass, MarketAsset } from "../types";

export interface WatchlistItem { symbol: string; note?: string; addedAt: string; }
export interface AlertRule { id: string; symbol: string; threshold: number; direction: "LONG" | "SHORT" | "ANY"; enabled: boolean; }
export interface FactorExposure { factor: string; assetClass: AssetClass | "Cross-Asset"; exposure: number; interpretation: string; }
export interface Anomaly { symbol: string; type: "PRICE" | "VOLUME" | "VOLATILITY" | "DATA"; score: number; observation: string; severity: "LOW" | "MEDIUM" | "HIGH"; }

const defaultWatchlist: WatchlistItem[] = [
  { symbol: "BTCUSD", note: "Crypto benchmark", addedAt: new Date().toISOString() },
  { symbol: "NVDA", note: "Equity technology", addedAt: new Date().toISOString() },
  { symbol: "EURUSD", note: "FX reference", addedAt: new Date().toISOString() }
];
let watchlist = [...defaultWatchlist];
let alerts: AlertRule[] = [];

export function getWatchlist() { return watchlist; }
export function addWatchlist(symbol: string, note?: string) {
  const s = symbol.toUpperCase();
  if (!watchlist.some(x => x.symbol === s)) watchlist.push({ symbol: s, note, addedAt: new Date().toISOString() });
  return watchlist;
}
export function removeWatchlist(symbol: string) { watchlist = watchlist.filter(x => x.symbol !== symbol.toUpperCase()); return watchlist; }
export function getAlerts() { return alerts; }
export function addAlert(input: Omit<AlertRule, "id">) { const row = { ...input, id: `ALT-${Date.now()}` }; alerts.push(row); return row; }
export function deleteAlert(id: string) { alerts = alerts.filter(a => a.id !== id); return alerts; }

export function buildFactorExposure(assets: MarketAsset[]): FactorExposure[] {
  const groups = new Map<AssetClass, MarketAsset[]>();
  for (const a of assets) { const list = groups.get(a.assetClass) ?? []; list.push(a); groups.set(a.assetClass, list); }
  const avg = (xs: MarketAsset[]) => xs.length ? xs.reduce((s, a) => s + a.change24h, 0) / xs.length : 0;
  const equities = avg(groups.get("Equities") ?? []), crypto = avg(groups.get("Crypto") ?? []), forex = avg(groups.get("Forex") ?? []), commodities = avg(groups.get("Commodities") ?? []), rates = avg(groups.get("Rates") ?? []);
  return [
    { factor: "Risk appetite", assetClass: "Cross-Asset", exposure: Number(((equities + crypto) / 2).toFixed(2)), interpretation: "Moyenne des variations actions et crypto." },
    { factor: "Dollar / FX", assetClass: "Forex", exposure: Number((-forex).toFixed(2)), interpretation: "Proxy inversé du mouvement moyen FX suivi." },
    { factor: "Commodities", assetClass: "Commodities", exposure: Number(commodities.toFixed(2)), interpretation: "Sensibilité agrégée des matières premières suivies." },
    { factor: "Rates pressure", assetClass: "Rates", exposure: Number(rates.toFixed(2)), interpretation: "Variation moyenne des instruments de taux disponibles." },
    { factor: "Crypto beta", assetClass: "Crypto", exposure: Number(crypto.toFixed(2)), interpretation: "Momentum crypto agrégé." }
  ];
}

export function detectAnomalies(assets: MarketAsset[]): Anomaly[] {
  return assets.flatMap(a => {
    const anomalies: Anomaly[] = [];
    const abs = Math.abs(a.change24h);
    if (abs >= 5) anomalies.push({ symbol: a.symbol, type: "PRICE", score: Math.min(100, Math.round(abs * 12)), observation: `Variation 24h de ${a.change24h.toFixed(2)}%`, severity: abs >= 10 ? "HIGH" : "MEDIUM" });
    if (a.dataQuality && a.dataQuality !== "FRESH" && a.dataSource === "live") anomalies.push({ symbol: a.symbol, type: "DATA", score: 70, observation: `Qualité ${a.dataQuality}, score ${a.dataQualityScore ?? "—"}/100`, severity: a.dataQuality === "INVALID" ? "HIGH" : "MEDIUM" });
    return anomalies;
  }).sort((a,b) => b.score - a.score);
}

export function buildInstitutionalSnapshot(assets: MarketAsset[]) {
  const factors = buildFactorExposure(assets);
  const anomalies = detectAnomalies(assets);
  return { generatedAt: new Date().toISOString(), coverage: assets.length, factors, anomalies, watchlist: getWatchlist(), alerts: getAlerts(), warnings: ["Les expositions sont des proxies analytiques, pas des facteurs institutionnels estimés par régression.", "Les anomalies sont des détections heuristiques et doivent être validées sur historique hors-échantillon."] };
}
