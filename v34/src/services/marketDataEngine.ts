import type { MarketAsset } from "../types.js";
import { cached } from "../../server/cache.js";
import { BinanceProvider, CoinGeckoProvider, FrankfurterProvider, TwelveDataProvider } from "./providerAdapters.js";
import { CircuitBreaker, withRetry } from "./resilience.js";

export type EngineSource = "live" | "synthetic";
export type EngineQuality = "FRESH" | "STALE" | "INVALID" | "SYNTHETIC";

export interface MarketDataSnapshot extends MarketAsset {
  dataSource: EngineSource;
  dataQuality: EngineQuality;
  dataQualityScore: number;
  receivedAt: string;
  providerTimestamp: string;
  latencyMs: number;
  staleAfterSeconds: number;
}

export interface MarketEngineStatus {
  online: boolean;
  refreshing: boolean;
  lastRefreshAt: string | null;
  successCount: number;
  failureCount: number;
  providerStats: Record<string, { ok: number; failed: number }>;
}

const STALE_AFTER: Record<MarketAsset["assetClass"], number> = {
  Crypto: 120,
  Forex: 48 * 60 * 60,
  Equities: 10 * 60,
  Indices: 10 * 60,
  Commodities: 10 * 60,
  Rates: 10 * 60
};

function quoteQuality(source: EngineSource, providerTimestamp: string, staleAfterSeconds: number) {
  if (source === "synthetic") return { dataQuality: "SYNTHETIC" as const, dataQualityScore: 45 };
  const age = Math.max(0, (Date.now() - Date.parse(providerTimestamp)) / 1000);
  if (!Number.isFinite(age)) return { dataQuality: "INVALID" as const, dataQualityScore: 0 };
  if (age > staleAfterSeconds) {
    const score = Math.max(20, Math.round(100 - (age / staleAfterSeconds - 1) * 40));
    return { dataQuality: "STALE" as const, dataQualityScore: score };
  }
  return { dataQuality: "FRESH" as const, dataQualityScore: Math.max(70, Math.round(100 - (age / staleAfterSeconds) * 30)) };
}

export class MarketDataEngine {
  private snapshots: MarketDataSnapshot[] = [];
  private refreshing = false;
  private lastRefreshAt: string | null = null;
  private successCount = 0;
  private failureCount = 0;
  private providerStats: Record<string, { ok: number; failed: number }> = {};
  private breakers: Record<string, CircuitBreaker> = {};

  constructor(private readonly assets: MarketAsset[], private readonly twelveDataApiKey?: string) {}

  private breaker(provider: string) { return this.breakers[provider] ??= new CircuitBreaker(3, 30_000); }

  private stat(provider: string, ok: boolean) {
    this.providerStats[provider] ??= { ok: 0, failed: 0 };
    ok ? this.providerStats[provider].ok++ : this.providerStats[provider].failed++;
  }

  async refresh(force = false): Promise<MarketDataSnapshot[]> {
    if (this.refreshing) return this.snapshots;
    this.refreshing = true;
    try {
      const result = await cached("engine:markets", force ? 1 : 45_000, async () => {
        const receivedAt = new Date().toISOString();
        const crypto = this.assets.filter(a => a.assetClass === "Crypto").map(a => a.symbol);
        const forex = this.assets.filter(a => a.assetClass === "Forex").map(a => a.symbol);
        const traditionalAssets = this.assets.filter(a => !["Crypto", "Forex"].includes(a.assetClass));
        const quotes: Array<{ symbol: string; price: number; venue: string; timestamp: string }> = [];

        if (crypto.length) {
          try { const q = await this.breaker("Binance").execute(() => withRetry(() => new BinanceProvider().getQuotes(crypto), { retries: 2 })); quotes.push(...q); this.stat("Binance", true); }
          catch { this.stat("Binance", false); }
          if (!crypto.every(s => quotes.some(q => q.symbol === s))) {
            try { const q = await this.breaker("CoinGecko").execute(() => withRetry(() => new CoinGeckoProvider().getQuotes(crypto), { retries: 2 })); quotes.push(...q); this.stat("CoinGecko", true); }
            catch { this.stat("CoinGecko", false); }
          }
        }
        if (forex.length) {
          try { const q = await this.breaker("Frankfurter").execute(() => withRetry(() => new FrankfurterProvider().getQuotes(forex), { retries: 2 })); quotes.push(...q); this.stat("Frankfurter", true); }
          catch { this.stat("Frankfurter", false); }
        }
        if (traditionalAssets.length && this.twelveDataApiKey) {
          try { const q = await this.breaker("Twelve Data").execute(() => withRetry(() => new TwelveDataProvider(this.twelveDataApiKey!).getQuotes(traditionalAssets.map(a => a.symbol)), { retries: 2 })); quotes.push(...q); this.stat("Twelve Data", true); }
          catch { this.stat("Twelve Data", false); }
        }

        return this.assets.map(asset => {
          const quote = quotes.find(q => q.symbol === asset.symbol);
          if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) {
            this.failureCount++;
            return { ...asset, dataSource: "synthetic" as const, provider: "synthetic", dataQuality: "SYNTHETIC" as const, dataQualityScore: 45, receivedAt, providerTimestamp: receivedAt, latencyMs: 0, staleAfterSeconds: STALE_AFTER[asset.assetClass] };
          }
          this.successCount++;
          const latencyMs = Math.max(0, Date.now() - Date.parse(quote.timestamp));
          const quality = quoteQuality("live", quote.timestamp, STALE_AFTER[asset.assetClass]);
          return { ...asset, price: quote.price, market: quote.venue, dataSource: "live" as const, provider: quote.venue, ...quality, receivedAt, providerTimestamp: quote.timestamp, latencyMs, staleAfterSeconds: STALE_AFTER[asset.assetClass] };
        });
      });
      this.snapshots = result;
      this.lastRefreshAt = new Date().toISOString();
      return result;
    } catch (error) {
      this.failureCount++;
      console.error("[engine] refresh failed", error);
      return this.snapshots;
    } finally { this.refreshing = false; }
  }

  async getMarkets(force = false) { return this.refresh(force); }

  getStatus(): MarketEngineStatus {
    return { online: true, refreshing: this.refreshing, lastRefreshAt: this.lastRefreshAt, successCount: this.successCount, failureCount: this.failureCount, providerStats: Object.fromEntries(Object.entries(this.providerStats).map(([name, stats]) => [name, { ...stats, circuit: this.breaker(name).getStatus() }])) };
  }
}
