import type { MarketAsset, NewsItem, OHLCVBar } from "../types";

export const demoAssets: MarketAsset[] = [
  { symbol: "AAPL", name: "Apple", market: "NASDAQ", assetClass: "Equities", price: 227.31, change24h: 1.84, volume: 78100000 },
  { symbol: "NVDA", name: "NVIDIA", market: "NASDAQ", assetClass: "Equities", price: 183.62, change24h: 2.76, volume: 142000000 },
  { symbol: "MSFT", name: "Microsoft", market: "NASDAQ", assetClass: "Equities", price: 511.09, change24h: 0.91, volume: 19600000 },
  { symbol: "EURUSD", name: "Euro / US Dollar", market: "FX", assetClass: "Forex", price: 1.1662, change24h: -0.21, volume: 0 },
  { symbol: "GBPUSD", name: "Pound / US Dollar", market: "FX", assetClass: "Forex", price: 1.3481, change24h: 0.13, volume: 0 },
  { symbol: "BTCUSD", name: "Bitcoin", market: "24/7", assetClass: "Crypto", price: 118420, change24h: 1.12, volume: 34600000000 },
  { symbol: "ETHUSD", name: "Ethereum", market: "24/7", assetClass: "Crypto", price: 4240.7, change24h: 0.74, volume: 18300000000 },
  { symbol: "XAUUSD", name: "Gold", market: "COMEX/OTC", assetClass: "Commodities", price: 3387.4, change24h: -0.35, volume: 0 },
  { symbol: "SPX", name: "S&P 500", market: "CME", assetClass: "Indices", price: 6421.18, change24h: 0.62, volume: 0 },
  { symbol: "NDX", name: "Nasdaq 100", market: "NASDAQ/CME", assetClass: "Indices", price: 23642.2, change24h: 0.88, volume: 0 }
];

export const demoNews: NewsItem[] = [
  { title: "Tech sector momentum remains elevated", source: "Market Feed", sentiment: 0.71, publishedAt: "13 min", symbols: ["NVDA", "MSFT"] },
  { title: "Dollar consolidates ahead of macro data", source: "Macro Desk", sentiment: -0.08, publishedAt: "31 min", symbols: ["EURUSD", "GBPUSD"] },
  { title: "Crypto flows show renewed institutional interest", source: "Digital Assets", sentiment: 0.63, publishedAt: "48 min", symbols: ["BTCUSD", "ETHUSD"] }
];

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8787";

export async function getMarkets(): Promise<MarketAsset[]> {
  try {
    const response = await fetch(`${API_BASE}/api/markets`, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as MarketAsset[];
    return Array.isArray(data) && data.length ? data : demoAssets;
  } catch {
    return demoAssets;
  }
}

export async function getNews(): Promise<NewsItem[]> {
  try {
    const response = await fetch(`${API_BASE}/api/news`, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as NewsItem[];
    return Array.isArray(data) ? data : demoNews;
  } catch {
    return demoNews;
  }
}

/**
 * Replace these demo functions with a licensed market-data provider.
 * Never scrape restricted feeds or bypass provider authentication.
 */
export async function fetchProviderData(endpoint: string, apiKey?: string) {
  if (!apiKey) throw new Error("API key manquante");
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!response.ok) throw new Error(`Provider error: ${response.status}`);
  return response.json();
}

/**
 * Deterministic seeded PRNG (mulberry32) so demo history is reproducible
 * across reloads instead of using Math.random(). This is still synthetic
 * data — swap `generateHistory` for `MarketProvider.getHistory` (see
 * providerAdapters.ts) as soon as a licensed feed is connected.
 */
function seedFromSymbol(symbol: string): number {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  return h || 1;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates `count` daily OHLCV bars ending at the asset's current price,
 * using a mean-reverting random walk with asset-class-appropriate volatility.
 * Deterministic per symbol so indicator snapshots are stable between calls.
 */
export function generateHistory(asset: MarketAsset, count = 220): OHLCVBar[] {
  const rand = mulberry32(seedFromSymbol(asset.symbol));
  const volByClass: Record<string, number> = {
    Equities: 0.016, Indices: 0.011, Forex: 0.006, Crypto: 0.035, Commodities: 0.013, Rates: 0.004
  };
  const dailyVol = volByClass[asset.assetClass] ?? 0.015;
  const drift = asset.change24h / 100 / 20; // spread the known 24h move into a mild trend bias

  // Walk backwards from today's price so the series ends exactly at asset.price.
  const closes: number[] = new Array(count);
  closes[count - 1] = asset.price;
  for (let i = count - 2; i >= 0; i--) {
    const shock = (rand() - 0.5) * 2 * dailyVol - drift;
    closes[i] = closes[i + 1] / (1 + shock);
  }

  const bars: OHLCVBar[] = [];
  const msPerDay = 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const close = closes[i];
    const prevClose = i > 0 ? closes[i - 1] : close;
    const intrabarVol = dailyVol * 0.6;
    const high = Math.max(close, prevClose) * (1 + rand() * intrabarVol);
    const low = Math.min(close, prevClose) * (1 - rand() * intrabarVol);
    bars.push({
      ts: new Date(now - (count - 1 - i) * msPerDay).toISOString(),
      open: prevClose,
      high,
      low,
      close,
      volume: asset.volume ? asset.volume * (0.6 + rand() * 0.8) : 0
    });
  }
  return bars;
}

export async function getHistory(asset: MarketAsset, count = 220): Promise<OHLCVBar[]> {
  try {
    const response = await fetch(`${API_BASE}/api/history/${encodeURIComponent(asset.symbol)}?count=${count}`, { signal: AbortSignal.timeout(9000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as { bars?: OHLCVBar[] };
    if (body.bars?.length) return body.bars.slice(-count);
  } catch {
    // Local deterministic fallback keeps the dashboard usable when the API is offline.
  }
  return generateHistory(asset, count);
}

/**
 * Live-data-aware variant of getHistory: tries real, key-free providers
 * first and falls back to the deterministic synthetic generator on any
 * failure — missing network access, rate limiting, or an unsupported
 * symbol/pair. Provider chain by asset class:
 *   - Crypto: Binance public klines (real OHLC) -> CoinGecko (close-only) -> synthetic
 *   - Forex:  Frankfurter ECB reference rates (close-only) -> synthetic
 *   - Everything else (Equities, Indices, Commodities, Rates): synthetic only —
 *     no provider that is simultaneously free, key-free, and compliant with its
 *     own terms of service was found for these classes. Yahoo Finance's
 *     unofficial endpoints are free and key-free but its ToS explicitly
 *     prohibits automated access; Stooq now gates its CSV endpoint behind a
 *     free-but-required API key. Neither qualifies as "no key AND no license
 *     restriction", so neither is wired in here — see README for the reasoning.
 * Callers that just want something to compute indicators on can keep using
 * `getHistory`/`generateHistory`; use this one when "real if possible" matters.
 */
export async function getHistoryPreferLive(asset: MarketAsset, count = 220): Promise<{ bars: OHLCVBar[]; source: "live" | "synthetic"; provider?: string }> {
  if (asset.assetClass === "Crypto") {
    try {
      const { BinanceProvider } = await import("./providerAdapters");
      const bars = (await new BinanceProvider().getHistory(asset.symbol, "1d", "", "", count)) as OHLCVBar[];
      if (bars.length) return { bars: bars.slice(-count), source: "live", provider: "Binance" };
    } catch {
      // Symbol not listed on Binance, or network unavailable — try CoinGecko next.
    }
    try {
      const { CoinGeckoProvider } = await import("./providerAdapters");
      const bars = (await new CoinGeckoProvider().getHistory(asset.symbol, "1d", "", "")) as OHLCVBar[];
      if (bars.length) return { bars: bars.slice(-count), source: "live", provider: "CoinGecko" };
    } catch {
      // Fall through to synthetic data.
    }
  }

  if (asset.assetClass === "Forex") {
    try {
      const { FrankfurterProvider } = await import("./providerAdapters");
      const bars = (await new FrankfurterProvider().getHistory(asset.symbol, "1d", "", "", count)) as OHLCVBar[];
      if (bars.length) return { bars: bars.slice(-count), source: "live", provider: "Frankfurter" };
    } catch {
      // Unsupported currency pair, or network unavailable — fall through to synthetic data.
    }
  }

  return { bars: generateHistory(asset, count), source: "synthetic" };
}