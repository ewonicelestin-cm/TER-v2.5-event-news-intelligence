/**
 * Provider-neutral adapter layer.
 * Add licensed providers here rather than coupling the UI to a vendor.
 */
export interface Quote {
  symbol: string;
  venue: string;
  price: number;
  timestamp: string;
}

export interface MarketProvider {
  name: string;
  getQuotes(symbols: string[]): Promise<Quote[]>;
  getHistory(symbol: string, timeframe: string, from: string, to: string): Promise<unknown[]>;
  getNews?(symbols: string[]): Promise<unknown[]>;
}

/**
 * Every provider call below goes through this instead of raw `fetch` so a
 * slow or hung upstream (a real risk with free, best-effort public APIs)
 * fails fast into the synthetic-data fallback instead of blocking the whole
 * request indefinitely.
 */
const DEFAULT_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

export class RestMarketProvider implements MarketProvider {
  constructor(
    public name: string,
    private baseUrl: string,
    private apiKey: string
  ) {}

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const url = `${this.baseUrl}/quotes?symbols=${encodeURIComponent(symbols.join(","))}`;
    const r = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${this.apiKey}` } });
    if (!r.ok) throw new Error(`${this.name}: quote request failed (${r.status})`);
    return r.json() as Promise<Quote[]>;
  }

  async getHistory(symbol: string, timeframe: string, from: string, to: string) {
    const url = `${this.baseUrl}/history?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const r = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${this.apiKey}` } });
    if (!r.ok) throw new Error(`${this.name}: history request failed (${r.status})`);
    return r.json();
  }
}

/**
 * CoinGecko public API adapter — no API key required, so this is the one
 * provider in the codebase that can be wired end-to-end and tested without
 * a paid subscription. Rate-limited (roughly 10-30 req/min on the free tier)
 * so callers should cache results rather than polling per request.
 * Docs: https://www.coingecko.com/en/api/documentation
 */
const COINGECKO_IDS: Record<string, string> = {
  BTCUSD: "bitcoin",
  ETHUSD: "ethereum"
};

interface CoinGeckoMarketChartResponse {
  prices: [number, number][];       // [timestamp_ms, price]
  total_volumes: [number, number][];
}

export class CoinGeckoProvider implements MarketProvider {
  name = "CoinGecko";
  private baseUrl = "https://api.coingecko.com/api/v3";

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const ids = symbols.map(s => COINGECKO_IDS[s]).filter(Boolean);
    if (!ids.length) return [];

    const url = `${this.baseUrl}/simple/price?ids=${ids.join(",")}&vs_currencies=usd`;
    const r = await fetchWithTimeout(url);
    if (!r.ok) throw new Error(`${this.name}: quote request failed (${r.status})`);
    const data = (await r.json()) as Record<string, { usd: number }>;

    return symbols
      .filter(s => COINGECKO_IDS[s] && data[COINGECKO_IDS[s]])
      .map(s => ({
        symbol: s,
        venue: "24/7",
        price: data[COINGECKO_IDS[s]].usd,
        timestamp: new Date().toISOString()
      }));
  }

  /**
   * Returns daily OHLCV bars built from CoinGecko's market_chart endpoint,
   * which only exposes close price + volume per point (not true OHLC) on the
   * free tier — open/high/low are approximated from consecutive closes.
   * A paid provider with real OHLC candles should replace this once budget
   * allows; the `MarketProvider` interface is unchanged either way.
   */
  async getHistory(symbol: string, _timeframe: string, _from: string, _to: string) {
    const id = COINGECKO_IDS[symbol];
    if (!id) throw new Error(`${this.name}: unsupported symbol ${symbol}`);

    const url = `${this.baseUrl}/coins/${id}/market_chart?vs_currency=usd&days=220&interval=daily`;
    const r = await fetchWithTimeout(url);
    if (!r.ok) throw new Error(`${this.name}: history request failed (${r.status})`);
    const data = (await r.json()) as CoinGeckoMarketChartResponse;

    const bars = [];
    for (let i = 0; i < data.prices.length; i++) {
      const [ts, close] = data.prices[i];
      const prevClose = i > 0 ? data.prices[i - 1][1] : close;
      bars.push({
        ts: new Date(ts).toISOString(),
        open: prevClose,
        high: Math.max(prevClose, close),
        low: Math.min(prevClose, close),
        close,
        volume: data.total_volumes[i]?.[1] ?? 0
      });
    }
    return bars;
  }
}

/**
 * Binance public market-data endpoints — no authentication of any kind,
 * documented explicitly as key-free by Binance itself (data-api.binance.vision
 * serves market data only, no trading). Unlike CoinGecko's free tier, this
 * returns real OHLC candles, not close-price-only data — so it's the better
 * default for crypto and is tried first in `marketData.ts`.
 * Docs: https://developers.binance.com/docs/binance-spot-api-docs/faqs/market_data_only
 */
export class BinanceProvider implements MarketProvider {
  name = "Binance";
  private baseUrl = "https://data-api.binance.vision/api/v3";

  /** "BTCUSD" -> "BTCUSDT" — Binance quotes crypto against USDT, not USD. */
  private toBinanceSymbol(symbol: string): string {
    return symbol.endsWith("USD") ? `${symbol}T` : symbol;
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const out: Quote[] = [];
    for (const symbol of symbols) {
      const binanceSymbol = this.toBinanceSymbol(symbol);
      const r = await fetchWithTimeout(`${this.baseUrl}/ticker/price?symbol=${binanceSymbol}`);
      if (!r.ok) continue; // symbol not listed on Binance — skip rather than fail the whole batch
      const data = (await r.json()) as { symbol: string; price: string };
      out.push({ symbol, venue: "Binance", price: Number(data.price), timestamp: new Date().toISOString() });
    }
    return out;
  }

  /** `interval` follows Binance's own vocabulary: "1d", "4h", "1h", "15m", ... */
  async getHistory(symbol: string, interval = "1d", _from?: string, _to?: string, limit = 220) {
    const binanceSymbol = this.toBinanceSymbol(symbol);
    const url = `${this.baseUrl}/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`;
    const r = await fetchWithTimeout(url);
    if (!r.ok) throw new Error(`${this.name}: history request failed (${r.status}) for ${binanceSymbol}`);
    const raw = (await r.json()) as [number, string, string, string, string, string, ...unknown[]][];

    return raw.map(k => ({
      ts: new Date(k[0]).toISOString(),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5])
    }));
  }
}

/**
 * Frankfurter — free, open-source ECB reference exchange rates, no API key,
 * no request quota (only abuse-prevention rate limiting). Only gives one
 * rate per business day (no intraday OHLC, and no data on weekends/EU bank
 * holidays), so open/high/low are approximated from consecutive daily closes
 * the same way CoinGecko's are above.
 * Docs: https://frankfurter.dev/
 */
export class FrankfurterProvider implements MarketProvider {
  name = "Frankfurter";
  private baseUrl = "https://api.frankfurter.app";

  /** "EURUSD" -> { base: "EUR", quote: "USD" } */
  private parsePair(symbol: string): { base: string; quote: string } {
    if (symbol.length !== 6) throw new Error(`${this.name}: unsupported pair format ${symbol}`);
    return { base: symbol.slice(0, 3), quote: symbol.slice(3) };
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const out: Quote[] = [];
    for (const symbol of symbols) {
      try {
        const { base, quote } = this.parsePair(symbol);
        const r = await fetchWithTimeout(`${this.baseUrl}/latest?from=${base}&to=${quote}`);
        if (!r.ok) continue;
        const data = (await r.json()) as { rates: Record<string, number> };
        if (data.rates[quote] === undefined) continue;
        out.push({ symbol, venue: "ECB", price: data.rates[quote], timestamp: new Date().toISOString() });
      } catch {
        continue; // unsupported pair or currency — skip rather than fail the whole batch
      }
    }
    return out;
  }

  async getHistory(symbol: string, _timeframe: string, _from?: string, _to?: string, days = 220) {
    const { base, quote } = this.parsePair(symbol);
    const end = new Date();
    const start = new Date(end.getTime() - days * 1.6 * 24 * 60 * 60 * 1000); // ~1.6x to cover weekends/holidays
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const url = `${this.baseUrl}/${fmt(start)}..${fmt(end)}?from=${base}&to=${quote}`;
    const r = await fetchWithTimeout(url);
    if (!r.ok) throw new Error(`${this.name}: history request failed (${r.status}) for ${symbol}`);
    const data = (await r.json()) as { rates: Record<string, Record<string, number>> };

    const dates = Object.keys(data.rates).sort();
    const closes = dates.map(d => data.rates[d][quote]);

    const bars = closes.map((close, i) => {
      const prevClose = i > 0 ? closes[i - 1] : close;
      return {
        ts: new Date(dates[i]).toISOString(),
        open: prevClose,
        high: Math.max(prevClose, close),
        low: Math.min(prevClose, close),
        close,
        volume: 0 // Frankfurter carries no volume data — FX reference rates only.
      };
    });

    return bars.slice(-days);
  }
}


/**
 * Optional Twelve Data adapter for traditional assets. It is deliberately
 * opt-in: the key stays on the server in `TWELVEDATA_API_KEY` and is never
 * exposed to the React bundle. Free-plan limits vary, so server caching is
 * required when this adapter is enabled.
 */
export class TwelveDataProvider implements MarketProvider {
  name = "Twelve Data";
  private baseUrl = "https://api.twelvedata.com";

  constructor(private apiKey: string) {}

  private normalize(symbol: string): string {
    if (symbol === "EURUSD") return "EUR/USD";
    if (symbol === "GBPUSD") return "GBP/USD";
    if (symbol === "XAUUSD") return "XAU/USD";
    return symbol;
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const out: Quote[] = [];
    for (const symbol of symbols) {
      const url = `${this.baseUrl}/quote?symbol=${encodeURIComponent(this.normalize(symbol))}&apikey=${encodeURIComponent(this.apiKey)}`;
      const r = await fetchWithTimeout(url);
      if (!r.ok) continue;
      const data = (await r.json()) as { price?: string; close?: string; exchange?: string; timestamp?: number; status?: string };
      const price = Number(data.price ?? data.close);
      if (!Number.isFinite(price)) continue;
      out.push({ symbol, venue: data.exchange || this.name, price, timestamp: data.timestamp ? new Date(data.timestamp * 1000).toISOString() : new Date().toISOString() });
    }
    return out;
  }

  async getHistory(symbol: string, timeframe = "1day", _from?: string, _to?: string) {
    const interval = timeframe === "1D" ? "1day" : timeframe;
    const url = `${this.baseUrl}/time_series?symbol=${encodeURIComponent(this.normalize(symbol))}&interval=${encodeURIComponent(interval)}&outputsize=500&apikey=${encodeURIComponent(this.apiKey)}`;
    const r = await fetchWithTimeout(url);
    if (!r.ok) throw new Error(`${this.name}: history request failed (${r.status})`);
    const data = (await r.json()) as { values?: Array<{ datetime: string; open: string; high: string; low: string; close: string; volume?: string }> };
    if (!data.values?.length) throw new Error(`${this.name}: no history for ${symbol}`);
    return [...data.values].reverse().map(v => ({ ts: new Date(v.datetime).toISOString(), open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close), volume: Number(v.volume ?? 0) }));
  }
}
