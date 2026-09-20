import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { authenticate, login, rateLimit, registerUser, requireRole, securityStatus, seedDemoAdmin, type User, type Role } from "../src/services/securityCore.js";
import { z } from "zod";
import { demoAssets, demoNews, generateHistory, getHistoryPreferLive } from "../src/services/marketData.js";
import { demoTraders } from "../src/services/socialIntelligence.js";
import { generateSignals, rankSignals } from "../src/services/signalEngine.js";
import { buildSignalIntelligence } from "../src/services/signalIntelligence.js";
import { backtest, runWalkForward, monteCarloSimulation, type BacktestTrade } from "../src/services/backtest.js";
import { validateByRegime } from "../src/services/regimeValidation.js";
import { computeSnapshot } from "../src/services/technicalIndicators.js";
import { createKillSwitchState, recordTradeResult, resetKillSwitch, type KillSwitchState } from "../src/services/riskEngine.js";
import { createPaperAccount, openPositionFromSignal, closePosition, markToMarket, type PaperAccount } from "../src/services/paperTrading.js";
import type { OHLCVBar } from "../src/types.js";
import { databaseHealth, insertAuditEvent, insertBacktestResult, insertKillSwitchEvent, insertPaperTrade } from "./db.js";
import { cached, cacheStats } from "./cache.js";
import { BinanceProvider, CoinGeckoProvider, FrankfurterProvider, TwelveDataProvider } from "../src/services/providerAdapters.js";
import { assessDataQuality, normalizeBars } from "../src/services/dataQuality.js";
import { buildInstitutionalSnapshot, getWatchlist, addWatchlist, removeWatchlist, getAlerts, addAlert, deleteAlert } from "../src/services/institutionalIntelligence.js";
import { MarketDataEngine } from "../src/services/marketDataEngine.js";
import { buildAIDecision } from "../src/services/aiDecisionEngine.js";
import { getCalibration, getJournal, recordDecision, resolveDue } from "../src/services/signalJournal.js";
import { buildPortfolioRisk } from "../src/services/portfolioRisk.js";
import { optimizePortfolio, type AllocationMethod } from "../src/services/portfolioOptimizer.js";
import { runStressEngine, historicalWorstMove } from "../src/services/stressEngine.js";
import { buildMacroRegime } from "../src/services/macroFactorEngine.js";
import { buildEventNewsReport } from "../src/services/eventNewsEngine.js";
import { buildNLPEventReport } from "../src/services/nlpEventEngine.js";
import { buildFundamentalReport } from "../src/services/fundamentalEngine.js";
import { buildUnifiedAssetIntelligence } from "../src/services/unifiedAssetIntelligence.js";
import { evaluateMonitoring, getNotifications, markNotificationRead, markAllNotificationsRead, notificationStatus, pushAutomationNotifications } from "../src/services/notificationEngine.js";
import { addAutomationRule, deleteAutomationRule, evaluateAutomationRules, getAutomationRules, updateAutomationRule } from "../src/services/automationEngine.js";
import { addWorkflow, deleteWorkflow, getWorkflowRuns, getWorkflows, runWorkflow, updateWorkflow, workflowStats } from "../src/services/workflowEngine.js";
import { beginRequest, getMetrics, getRecentLogs, recordError, recordEvent, recordProviderFailure } from "../src/services/observability.js";
import { buildIntelligenceOverview } from "../src/core/intelligence/index.js";

dotenv.config();
const app = express();
seedDemoAdmin();

// Production-oriented HTTP hardening.
app.disable("x-powered-by");
app.use((req, res, next) => {
  const finishMetrics = beginRequest();
  res.once("finish", () => finishMetrics(res.statusCode >= 500 ? new Error("http_5xx") : undefined));
  const requestId = randomUUID();
  res.setHeader("X-Request-Id", requestId);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  const limit = rateLimit(req.ip || "unknown");
  res.setHeader("X-RateLimit-Remaining", String(limit.remaining));
  if (!limit.allowed) return res.status(429).json({ error: "rate limit exceeded", requestId });
  next();
});

// Wide open (any origin) by default so the demo works out of the box;
// set CORS_ORIGIN in production to the real frontend origin instead of
// leaving every browser on the internet able to call this API with
// credentials-less requests.
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin } : {}));
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 8787);

/**
 * Every audit event is written to Postgres's `audit_events` table when
 * DATABASE_URL is set (see server/db.ts); it's also kept in this in-memory
 * ring buffer so /api/audit works out of the box in a no-DB demo setup.
 * Insert failures are logged, not thrown — a broken audit sink should never
 * take down request handling.
 */
const auditLog: { eventType: string; payload: unknown; createdAt: string }[] = [];
function recordAudit(eventType: string, payload: unknown) {
  auditLog.push({ eventType, payload, createdAt: new Date().toISOString() });
  insertAuditEvent(eventType, payload).catch(err => console.error("[audit] insert failed:", err.message));
}

async function historyBySymbol(assets = demoAssets): Promise<Record<string, OHLCVBar[]>> {
  const entries = await Promise.all(assets.map(async asset => {
    const result = await cached(`history:${asset.symbol}:220`, 5 * 60 * 1000, () => getHistoryPreferLive(asset, 220));
    return [asset.symbol, result.bars] as const;
  }));
  return Object.fromEntries(entries);
}

app.get("/api/health", async (_req, res) => {
  const db = await databaseHealth();
  const engine = marketEngine.getStatus();
  const degraded = db.status !== "UP" || engine.failureCount > 0;
  res.status(degraded ? 503 : 200).json({ ok: !degraded, service: "TER API", mode: process.env.NODE_ENV || "development", version: "3.6.0", security: securityStatus(), database: db, engine, metrics: getMetrics() });
});

app.get("/api/system/health", async (_req, res) => {
  const db = await databaseHealth();
  const engine = marketEngine.getStatus();
  const providers = engine.providerStats ?? {};
  const checks = [
    { component: "api", status: "UP", latencyMs: 0 },
    { component: "database", status: db.status, latencyMs: db.latencyMs, details: db },
    { component: "market_engine", status: engine.failureCount > 0 ? "DEGRADED" : "UP", latencyMs: engine.lastRefreshAt ? 0 : null, details: engine },
    ...Object.entries(providers).map(([provider, value]: [string, any]) => ({ component: `provider:${provider}`, status: value.failed > 0 ? "DEGRADED" : "UP", latencyMs: null, details: value }))
  ];
  const degraded = checks.some(c => c.status !== "UP");
  res.status(degraded ? 503 : 200).json({ generatedAt: new Date().toISOString(), status: degraded ? "DEGRADED" : "UP", checks, metrics: getMetrics() });
});

app.get("/api/system/metrics", (_req, res) => res.json(getMetrics()));
app.get("/api/system/logs", (req, res) => res.json(getRecentLogs(Number(req.query.limit) || 50)));

app.get("/api/security/status", (_req, res) => res.json(securityStatus()));
app.post("/api/auth/register", (req, res) => {
  if (process.env.AUTH_ENABLED === "true" && process.env.ALLOW_SELF_REGISTRATION !== "true") return res.status(403).json({ error: "self registration disabled" });
  try { const user = registerUser(String(req.body?.email || ""), String(req.body?.password || "")); recordAudit("user_registered", { userId: user.id, role: user.role }); res.status(201).json(user); }
  catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : "invalid registration" }); }
});
app.post("/api/auth/login", (req, res) => {
  const result = login(String(req.body?.email || ""), String(req.body?.password || ""));
  if (!result) return res.status(401).json({ error: "invalid credentials" });
  recordAudit("user_login", { userId: result.user.id, role: result.user.role });
  res.json(result);
});
app.get("/api/auth/me", (req, res) => {
  const auth = String(req.headers.authorization || "");
  const user = authenticate(auth.startsWith("Bearer ") ? auth.slice(7) : undefined);
  if (!user) return res.status(401).json({ error: "authentication required" });
  res.json(user);
});


app.get("/api/institutional/overview", async (_req, res) => {
  const assets = await marketEngine.getMarkets();
  res.json(buildInstitutionalSnapshot(assets));
});

app.get("/api/watchlist", (_req, res) => res.json(getWatchlist()));
app.post("/api/watchlist", (req, res) => {
  const symbol = typeof req.body?.symbol === "string" ? req.body.symbol.trim() : "";
  if (!symbol) return res.status(400).json({ error: "symbol required" });
  res.status(201).json(addWatchlist(symbol, typeof req.body?.note === "string" ? req.body.note : undefined));
});
app.delete("/api/watchlist/:symbol", (req, res) => res.json(removeWatchlist(req.params.symbol)));
app.get("/api/alerts", (_req, res) => res.json(getAlerts()));
app.get("/api/notifications", (_req, res) => res.json({ notifications: getNotifications(), status: notificationStatus() }));
app.post("/api/notifications/read-all", (_req, res) => res.json({ updated: markAllNotificationsRead(), status: notificationStatus() }));
app.post("/api/notifications/:id/read", (req, res) => { const item = markNotificationRead(req.params.id); if (!item) return res.status(404).json({ error: "notification not found" }); res.json(item); });
app.post("/api/alerts", (req, res) => {
  const symbol = typeof req.body?.symbol === "string" ? req.body.symbol.trim().toUpperCase() : "";
  const threshold = Number(req.body?.threshold);
  const direction = req.body?.direction;
  if (!symbol || !Number.isFinite(threshold) || threshold < 0 || threshold > 100 || !["LONG","SHORT","ANY"].includes(direction)) return res.status(400).json({ error: "invalid alert" });
  res.status(201).json(addAlert({ symbol, threshold, direction, enabled: true }));
});
app.delete("/api/alerts/:id", (req, res) => res.json(deleteAlert(req.params.id)));

app.get("/api/workflows", (_req, res) => res.json(getWorkflows()));
app.get("/api/workflows/stats", (_req, res) => res.json(workflowStats()));
app.get("/api/workflows/runs", (req, res) => res.json(getWorkflowRuns(typeof req.query.workflowId === "string" ? req.query.workflowId : undefined)));
app.post("/api/workflows", (req, res) => {
  const b = req.body ?? {};
  if (typeof b.name !== "string" || !b.name.trim() || !Array.isArray(b.nodes) || !Array.isArray(b.edges)) return res.status(400).json({ error: "invalid workflow" });
  const allowed = new Set(["TRIGGER","CONDITION","LOGIC","ACTION","NOTIFICATION","JOURNAL","SCENARIO"]);
  const nodes = b.nodes.filter((n: any) => n && typeof n.id === "string" && allowed.has(n.type) && typeof n.label === "string").map((n: any) => ({ id: n.id, type: n.type, label: n.label, config: n.config && typeof n.config === "object" ? n.config : {} }));
  const ids = new Set(nodes.map((n: any) => n.id));
  const edges = b.edges.filter((e: any) => e && ids.has(e.from) && ids.has(e.to)).map((e: any) => ({ from: e.from, to: e.to, when: ["TRUE","FALSE","ALWAYS"].includes(e.when) ? e.when : undefined }));
  if (!nodes.length || !nodes.some((n: any) => n.type === "TRIGGER")) return res.status(400).json({ error: "workflow needs a trigger" });
  res.status(201).json(addWorkflow({ name: b.name.trim(), description: typeof b.description === "string" ? b.description : "", status: ["DRAFT","ACTIVE","PAUSED"].includes(b.status) ? b.status : "DRAFT", nodes, edges }));
});
app.patch("/api/workflows/:id", (req, res) => { const row = updateWorkflow(req.params.id, req.body ?? {}); if (!row) return res.status(404).json({ error: "workflow not found" }); res.json(row); });
app.delete("/api/workflows/:id", (req, res) => res.json({ deleted: deleteWorkflow(req.params.id) }));
app.post("/api/workflows/:id/run", (req, res) => { const row = runWorkflow(req.params.id, req.body?.dryRun !== false); if (!row) return res.status(404).json({ error: "workflow not found" }); recordAudit("workflow_run", { workflowId: req.params.id, dryRun: true, status: row.status }); res.json(row); });
app.get("/api/automation/rules", (_req, res) => res.json(getAutomationRules()));
app.post("/api/automation/rules", (req, res) => {
  const body = req.body ?? {};
  if (typeof body.name !== "string" || !body.name.trim() || !["ALL", "ANY"].includes(body.logic) || !Array.isArray(body.conditions) || body.conditions.length === 0) return res.status(400).json({ error: "invalid automation rule" });
  const conditions = body.conditions.filter((c: any) => c && ["SIGNAL_SCORE","CONFIDENCE","CHANGE_24H","DATA_QUALITY_SCORE","PRICE"].includes(c.metric) && [">",">=","<","<=","="].includes(c.operator) && Number.isFinite(Number(c.value))).map((c: any) => ({ metric: c.metric, operator: c.operator, value: Number(c.value) }));
  if (!conditions.length) return res.status(400).json({ error: "at least one valid condition required" });
  res.status(201).json(addAutomationRule({ name: body.name.trim(), symbol: typeof body.symbol === "string" && body.symbol.trim() ? body.symbol.trim().toUpperCase() : "*", logic: body.logic, conditions, severity: ["INFO","MEDIUM","HIGH"].includes(body.severity) ? body.severity : "MEDIUM", enabled: body.enabled !== false, cooldownMinutes: Math.max(1, Number(body.cooldownMinutes) || 15 }));
});
app.patch("/api/automation/rules/:id", (req, res) => { const row = updateAutomationRule(req.params.id, req.body ?? {}); if (!row) return res.status(404).json({ error: "rule not found" }); res.json(row); });
app.delete("/api/automation/rules/:id", (req, res) => res.json(deleteAutomationRule(req.params.id)));


app.get("/api/providers", (_req, res) => {
  res.json({ providers: [
    { name: "Binance", classes: ["Crypto"], mode: "public", configured: true, status: "available" },
    { name: "CoinGecko", classes: ["Crypto"], mode: "public-fallback", configured: true, status: "available" },
    { name: "Frankfurter", classes: ["Forex"], mode: "public-reference", configured: true, status: "available" },
    { name: "Twelve Data", classes: ["Equities", "Indices", "Commodities", "Rates"], mode: "api-key", configured: Boolean(process.env.TWELVEDATA_API_KEY), status: process.env.TWELVEDATA_API_KEY ? "configured" : "not_configured" }
  ], note: "TER distingue les données live des données synthétiques." });
});

app.get("/api/cache", (_req, res) => {
  res.json(cacheStats());
});

const marketEngine = new MarketDataEngine(demoAssets, process.env.TWELVEDATA_API_KEY);

app.get("/api/engine/status", (_req, res) => {
  res.json(marketEngine.getStatus());
});

app.get("/api/ai/calibration/:symbol", async (req, res) => {
  const assets = await marketEngine.getMarkets();
  resolveDue(new Map(assets.map(a => [a.symbol, a])));
  const symbol = req.params.symbol.toUpperCase();
  res.json(getCalibration(symbol));
});

app.get("/api/ai/journal", async (req, res) => {
  const assets = await marketEngine.getMarkets();
  resolveDue(new Map(assets.map(a => [a.symbol, a])));
  res.json(getJournal(typeof req.query.symbol === "string" ? req.query.symbol.toUpperCase() : undefined));
});

app.get("/api/markets", async (req, res) => {
  const force = String(req.query.refresh || "") === "1";
  res.json(await marketEngine.getMarkets(force));
});

app.get("/api/monitoring/status", async (_req, res) => {
  const assets = await marketEngine.getMarkets();
  const history = await historyBySymbol(assets);
  const signals = rankSignals(generateSignals(assets, demoTraders, history));
  const generated = evaluateMonitoring(assets, signals, getAlerts(), getWatchlist());
  const automation = evaluateAutomationRules(assets, signals);
  const automationNotifications = pushAutomationNotifications(automation.map(x => ({ symbol: x.symbol, title: `Règle: ${x.ruleName}`, message: x.message, severity: x.severity })));
  res.json({ status: notificationStatus(), generated: generated.length + automationNotifications.length, automationTriggered: automationNotifications.length, automation, monitoredAssets: assets.length, activeAlerts: getAlerts().filter(a => a.enabled).length, automationRules: getAutomationRules().filter(r => r.enabled).length, watchlist: getWatchlist().length, checkedAt: new Date().toISOString() });
});

app.get("/api/news", (_req, res) => res.json(demoNews));

app.get("/api/fundamentals", async (_req, res) => {
  const assets = await marketEngine.getMarkets();
  res.json(buildFundamentalReport(assets));
});

app.get("/api/asset-intelligence/:symbol", async (req, res) => {
  const assets = await marketEngine.getMarkets();
  const symbol = req.params.symbol.toUpperCase();
  const asset = assets.find(a => a.symbol === symbol);
  if (!asset) return res.status(404).json({ error: "unknown symbol" });
  const history = await historyBySymbol([asset]);
  const bars = history["1d"] ?? [];
  const baseSignals = rankSignals(generateSignals([asset], demoTraders, history));
  const baseSignal = baseSignals[0] ?? null;
  const signal = baseSignal ? { ...baseSignal, intelligence: buildSignalIntelligence(asset, baseSignal, await intelligenceHistories(asset)) } : null;
  const macro = buildMacroRegime(assets, await historyBySymbol(assets));
  const baseNews = buildEventNewsReport(assets, demoNews, macro.regime);
  const report = buildUnifiedAssetIntelligence(asset, bars, signal, baseNews.news, baseNews.events, { regime: macro.regime, score: macro.score, confidence: macro.confidence });
  recordAudit("asset_intelligence_view", { symbol, source: asset.dataSource, quality: asset.dataQuality, version: "3.6" });
  res.json(report);
});

app.get("/api/fundamentals/:symbol", async (req, res) => {
  const assets = await marketEngine.getMarkets();
  const symbol = req.params.symbol.toUpperCase();
  const asset = assets.find(a => a.symbol === symbol);
  if (!asset) return res.status(404).json({ error: "unknown symbol" });
  const report = buildFundamentalReport([asset]);
  res.json({ ...report, symbol });
});

app.get("/api/events", async (_req, res) => {
  const assets = await marketEngine.getMarkets();
  const report = buildEventNewsReport(assets, demoNews);
  res.json({ generatedAt: report.generatedAt, events: report.events, warnings: report.warnings, methodology: report.methodology });
});

app.get("/api/news/intelligence", async (_req, res) => {
  const assets = await marketEngine.getMarkets();
  const macro = buildMacroRegime(assets, await historyBySymbol(assets));
  res.json(buildEventNewsReport(assets, demoNews, macro.regime));
});

app.get("/api/news/nlp", async (_req, res) => {
  const assets = await marketEngine.getMarkets();
  const macro = buildMacroRegime(assets, await historyBySymbol(assets));
  const base = buildEventNewsReport(assets, demoNews, macro.regime);
  res.json(buildNLPEventReport(base.news, base.events, assets));
});

app.get("/api/news/nlp/:symbol", async (req, res) => {
  const assets = await marketEngine.getMarkets();
  const symbol = req.params.symbol.toUpperCase();
  const asset = assets.find(a => a.symbol === symbol);
  if (!asset) return res.status(404).json({ error: "unknown symbol" });
  const macro = buildMacroRegime(assets, await historyBySymbol(assets));
  const base = buildEventNewsReport(assets, demoNews, macro.regime);
  const report = buildNLPEventReport(base.news.filter(n => n.symbols.includes(symbol)), base.events.filter(e => e.symbols.includes(symbol)), [asset]);
  res.json({ ...report, symbol });
});

app.get("/api/news/intelligence/:symbol", async (req, res) => {
  const assets = await marketEngine.getMarkets();
  const symbol = req.params.symbol.toUpperCase();
  if (!assets.some(a => a.symbol === symbol)) return res.status(404).json({ error: "unknown symbol" });
  const macro = buildMacroRegime(assets, await historyBySymbol(assets));
  const report = buildEventNewsReport(assets, demoNews, macro.regime);
  res.json({ symbol, generatedAt: report.generatedAt, items: report.news.filter(n => n.symbols.includes(symbol)), events: report.events.filter(e => e.symbols.includes(symbol)), macroRegime: macro.regime, warnings: report.warnings });
});

app.get("/api/traders", (_req, res) => res.json(demoTraders));

app.get("/api/history/:symbol", async (req, res) => {
  const asset = demoAssets.find(a => a.symbol === req.params.symbol.toUpperCase());
  if (!asset) return res.status(404).json({ error: "unknown symbol" });

  const requestedCount = Math.min(Math.max(Number(req.query.count || 220), 60), 500);
  const timeframe = String(req.query.timeframe || "1d");
  const allowed = new Set(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]);
  if (!allowed.has(timeframe)) return res.status(400).json({ error: "unsupported timeframe" });

  const result = await cached(`history:${asset.symbol}:${timeframe}:${requestedCount}`, 60_000, async () => {
    if (asset.assetClass === "Crypto") {
      try {
        const bars = await new BinanceProvider().getHistory(asset.symbol, timeframe, "", "", requestedCount);
        if (bars.length) return { bars: normalizeBars(bars as OHLCVBar[]).slice(-requestedCount), source: "live" as const, provider: "Binance" };
      } catch { /* fallback */ }
    }
    if (process.env.TWELVEDATA_API_KEY && asset.assetClass !== "Crypto" && asset.assetClass !== "Forex") {
      try {
        const bars = await new TwelveDataProvider(process.env.TWELVEDATA_API_KEY).getHistory(asset.symbol, timeframe, "", "");
        if (bars.length) return { bars: normalizeBars(bars as OHLCVBar[]).slice(-requestedCount), source: "live" as const, provider: "Twelve Data" };
      } catch { /* fallback */ }
    }
    return getHistoryPreferLive(asset, requestedCount);
  });
  const bars = normalizeBars(result.bars);
  const quality = assessDataQuality(bars, result.source, result.provider ?? "synthetic", timeframe);
  res.json({ symbol: asset.symbol, timeframe, source: result.source, provider: result.provider ?? "synthetic", quality, bars });
});

app.get("/api/data-quality/:symbol", async (req, res) => {
  const asset = demoAssets.find(a => a.symbol === req.params.symbol.toUpperCase());
  if (!asset) return res.status(404).json({ error: "unknown symbol" });
  const timeframe = String(req.query.timeframe || "1d");
  const count = Math.min(Math.max(Number(req.query.count || 220), 60), 500);
  const allowed = new Set(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]);
  if (!allowed.has(timeframe)) return res.status(400).json({ error: "unsupported timeframe" });
  const result = await cached(`quality:${asset.symbol}:${timeframe}:${count}`, 60_000, async () => {
    if (asset.assetClass === "Crypto") {
      try {
        const bars = await new BinanceProvider().getHistory(asset.symbol, timeframe, "", "", count);
        return { bars: bars as OHLCVBar[], source: "live" as const, provider: "Binance" };
      } catch {}
    }
    return getHistoryPreferLive(asset, count);
  });
  const bars = normalizeBars(result.bars);
  res.json({ symbol: asset.symbol, timeframe, ...assessDataQuality(bars, result.source, result.provider ?? "synthetic", timeframe) });
});

async function intelligenceHistories(asset: (typeof demoAssets)[number]) {
  const timeframes = asset.assetClass === "Crypto" ? ["1D", "4h", "1h"] : ["1D"];
  const entries = await Promise.all(timeframes.map(async timeframe => {
    const apiTimeframe = timeframe === "1D" ? "1d" : timeframe;
    const result = await cached(`intel:${asset.symbol}:${apiTimeframe}:220`, 60_000, async () => {
      if (asset.assetClass === "Crypto") {
        try {
          const bars = await new BinanceProvider().getHistory(asset.symbol, apiTimeframe, "", "", 220);
          if (bars.length) return normalizeBars(bars as OHLCVBar[]);
        } catch { /* fallback below */ }
      }
      if (process.env.TWELVEDATA_API_KEY && asset.assetClass !== "Crypto" && asset.assetClass !== "Forex") {
        try {
          const bars = await new TwelveDataProvider(process.env.TWELVEDATA_API_KEY).getHistory(asset.symbol, apiTimeframe, "", "");
          if (bars.length) return normalizeBars(bars as OHLCVBar[]).slice(-220);
        } catch { /* fallback below */ }
      }
      return normalizeBars((await getHistoryPreferLive(asset, 220)).bars);
    });
    return [timeframe, result] as const;
  }));
  return Object.fromEntries(entries);
}

app.get("/api/signals", async (_req, res) => {
  const assets = await marketEngine.getMarkets();
  const history = await historyBySymbol(assets);
  const baseSignals = rankSignals(generateSignals(assets, demoTraders, history));
  const enriched = await Promise.all(baseSignals.map(async signal => {
    const asset = assets.find(a => a.symbol === signal.symbol);
    if (!asset) return signal;
    const histories = await intelligenceHistories(asset);
    const enriched = buildSignalIntelligence(asset, signal, histories);
    const aiDecision = buildAIDecision(asset, enriched);
    recordDecision(asset, aiDecision);
    return { ...enriched, aiDecision };
  }));
  recordAudit("signals_generated", { count: enriched.length, engineRefresh: marketEngine.getStatus().lastRefreshAt, intelligence: "v1.8" });
  res.json(enriched);
});

app.get("/api/ai/ensemble/:symbol", async (req, res) => {
  const assets = await marketEngine.getMarkets();
  const asset = assets.find(a => a.symbol === req.params.symbol.toUpperCase());
  if (!asset) return res.status(404).json({ error: "unknown symbol" });
  const history = await historyBySymbol([asset]);
  const base = generateSignals([asset], demoTraders, history)[0];
  const enriched = buildSignalIntelligence(asset, base, await intelligenceHistories(asset));
  const decision = buildAIDecision(asset, enriched);
  recordDecision(asset, decision);
  res.json(decision);
});

app.get("/api/signals/:symbol/intelligence", async (req, res) => {
  const assets = await marketEngine.getMarkets();
  const asset = assets.find(a => a.symbol === req.params.symbol.toUpperCase());
  if (!asset) return res.status(404).json({ error: "unknown symbol" });
  const history = await historyBySymbol([asset]);
  const base = generateSignals([asset], demoTraders, history)[0];
  const enriched = buildSignalIntelligence(asset, base, await intelligenceHistories(asset));
  res.json({ ...enriched.intelligence, aiDecision: buildAIDecision(asset, enriched) });
});

/**
 * Demo backtest strategy: "buy on EMA20/EMA50 cross, hold N bars", used only
 * so the walk-forward + Monte Carlo machinery has real data to run on.
 * Replace with the actual signal-engine-driven trade generator once a
 * licensed history feed is connected.
 */
function crossoverStrategy(trainBars: OHLCVBar[], testBars: OHLCVBar[]): BacktestTrade[] {
  const combined = [...trainBars, ...testBars];
  const offset = trainBars.length;
  const trades: BacktestTrade[] = [];
  const holdBars = 5;

  for (let i = offset; i < combined.length - holdBars; i++) {
    const snapshot = computeSnapshot(combined.slice(0, i + 1));
    if (!snapshot) continue;
    if (snapshot.ema20 <= snapshot.ema50) continue; // only take the long side in this demo strategy
    const entryBar = combined[i];
    const exitBar = combined[i + holdBars];
    trades.push({ entry: entryBar.close, exit: exitBar.close, direction: "LONG", entryTs: entryBar.ts, exitTs: exitBar.ts });
  }
  return trades;
}

const STRATEGY_VERSION = "v1.1-technical-indicators";

app.get("/api/backtest/:symbol/regimes", async (req, res) => {
  const asset = demoAssets.find(a => a.symbol === req.params.symbol.toUpperCase());
  if (!asset) return res.status(404).json({ error: "unknown symbol" });

  const live = await getHistoryPreferLive(asset, 260);
  const report = validateByRegime(live.bars, asset.assetClass, "1D", undefined, asset.symbol);
  recordAudit("regime_validation_run", { symbol: asset.symbol, trades: report.trades, source: live.source, provider: live.provider ?? "synthetic" });
  res.json({ ...report, dataSource: live.source, provider: live.provider ?? "synthetic" });
});

app.get("/api/backtest/:symbol", async (req, res) => {
  const asset = demoAssets.find(a => a.symbol === req.params.symbol.toUpperCase());
  if (!asset) return res.status(404).json({ error: "unknown symbol" });

  const live = await getHistoryPreferLive(asset, 260);
  const bars = live.bars;
  const { perFold, combined } = runWalkForward(bars, crossoverStrategy, undefined, 5);
  const allTrades = crossoverStrategy([], bars);
  const inSample = backtest(allTrades);
  const monteCarlo = monteCarloSimulation(allTrades, undefined, 500);

  recordAudit("backtest_run", { symbol: asset.symbol, folds: perFold.length, trades: combined.trades, source: live.source, provider: live.provider ?? "synthetic" });

  await insertBacktestResult({ strategyVersion: STRATEGY_VERSION, runType: "in_sample", trades: inSample.trades, winRate: inSample.winRate, expectancy: inSample.expectancy, profitFactor: inSample.profitFactor, maxDrawdown: inSample.maxDrawdown, sharpe: inSample.sharpe, sortino: inSample.sortino, calmar: inSample.calmar, annualizedReturn: inSample.annualizedReturn, feesPaid: inSample.feesPaid, slippageCost: inSample.slippageCost, params: { symbol: asset.symbol } })
    .catch(err => console.error("[backtest_results] insert failed:", err.message));
  await insertBacktestResult({ strategyVersion: STRATEGY_VERSION, runType: "walk_forward_combined", trades: combined.trades, winRate: combined.winRate, expectancy: combined.expectancy, profitFactor: combined.profitFactor, maxDrawdown: combined.maxDrawdown, sharpe: combined.sharpe, sortino: combined.sortino, calmar: combined.calmar, annualizedReturn: combined.annualizedReturn, feesPaid: combined.feesPaid, slippageCost: combined.slippageCost, params: { symbol: asset.symbol, folds: perFold.length } })
    .catch(err => console.error("[backtest_results] insert failed:", err.message));

  res.json({ inSample, walkForwardPerFold: perFold, walkForwardCombined: combined, monteCarlo });
});

app.get("/api/audit", (_req, res) => {
  // Falls back to the in-memory ring buffer; production reads should
  // SELECT from `audit_events` ordered by created_at, paginated, instead.
  res.json(auditLog.slice(-100));
});

/**
 * Paper trading — single shared demo account (per-user accounts need the
 * auth layer from Phase 5). State lives in memory; closed trades are
 * persisted to `paper_trades` so performance survives a server restart even
 * though open positions don't yet.
 */
let paperAccount: PaperAccount = createPaperAccount(10000);
let killSwitchState: KillSwitchState = createKillSwitchState(10000);
const KILL_SWITCH_CONFIG = { maxDrawdownPercent: 10, maxConsecutiveLosses: 5 };

app.get("/api/risk/portfolio", async (_req, res) => {
  const assets = await marketEngine.getMarkets();
  const account = paperAccount;
  const barsEntries = await Promise.all(account.positions.map(async p => {
    const asset = demoAssets.find(a => a.symbol === p.symbol);
    if (!asset) return [p.symbol, []] as const;
    const result = await cached(`risk:${p.symbol}:160`, 60_000, () => getHistoryPreferLive(asset, 160));
    return [p.symbol, result.bars] as const;
  }));
  res.json(buildPortfolioRisk(assets, account.positions, Object.fromEntries(barsEntries), markToMarket(account, Object.fromEntries(assets.map(a => [a.symbol, a.price]))), account.cash));
});

app.get("/api/risk/optimize", async (req, res) => {
  const assets = await marketEngine.getMarkets();
  const account = paperAccount;
  const barsEntries = await Promise.all(account.positions.map(async p => {
    const asset = demoAssets.find(a => a.symbol === p.symbol);
    if (!asset) return [p.symbol, []] as const;
    const result = await cached(`optimizer:${p.symbol}:160`, 60_000, () => getHistoryPreferLive(asset, 160));
    return [p.symbol, result.bars] as const;
  }));
  const prices = Object.fromEntries(assets.map(a => [a.symbol, a.price]));
  const equity = markToMarket(account, prices);
  const risk = buildPortfolioRisk(assets, account.positions, Object.fromEntries(barsEntries), equity, account.cash);
  const method = String(req.query.method || "RISK_PARITY_APPROX") as AllocationMethod;
  const allowed = new Set<AllocationMethod>(["EQUAL_WEIGHT", "INVERSE_VOL", "RISK_PARITY_APPROX"]);
  if (!allowed.has(method)) return res.status(400).json({ error: "unsupported optimization method" });
  res.json(optimizePortfolio(assets, account.positions, Object.fromEntries(barsEntries), risk, method));
});

app.get("/api/macro/regime", async (_req, res) => {
  const assets = await marketEngine.getMarkets();
  const histories = await historyBySymbol(assets);
  res.json(buildMacroRegime(assets, histories));
});

app.get("/api/intelligence/overview", async (_req, res) => {
  const assets = await marketEngine.getMarkets();
  const histories = await historyBySymbol(assets);
  const signals = rankSignals(generateSignals(assets, demoTraders, histories));
  const macro = buildMacroRegime(assets, histories);
  const news = buildEventNewsReport(assets, demoNews, macro.regime);
  const fundamentals = buildFundamentalReport(assets);
  const newsScore = news.news.length ? news.news.reduce((sum, item) => sum + item.sentimentScore * item.impactScore, 0) / news.news.length : 0;
  const fundamentalScore = fundamentals.snapshots.length ? fundamentals.snapshots.reduce((sum, item) => sum + item.qualityScore, 0) / fundamentals.snapshots.length : 50;
  const overview = buildIntelligenceOverview({ assets, signals, regime: macro.regime, macroScore: macro.score, fundamentalScore, newsScore, riskScore: 0 });
  recordAudit("intelligence_overview", { version: "3.6", coverage: overview.coverage, contradictions: overview.contradictions, graphDensity: overview.graph.density });
  res.json({ ...overview, sources: overview.provenance });
});

app.get("/api/risk/stress", async (_req, res) => {
  const assets = await marketEngine.getMarkets();
  const account = paperAccount;
  const barsEntries = await Promise.all(account.positions.map(async p => {
    const asset = demoAssets.find(a => a.symbol === p.symbol);
    if (!asset) return [p.symbol, []] as const;
    const result = await cached(`stress:${p.symbol}:160`, 60_000, () => getHistoryPreferLive(asset, 160));
    return [p.symbol, result.bars] as const;
  }));
  const bars = Object.fromEntries(barsEntries);
  const prices = Object.fromEntries(assets.map(a => [a.symbol, a.price]));
  const equity = markToMarket(account, prices);
  const risk = buildPortfolioRisk(assets, account.positions, bars, equity, account.cash);
  const report = runStressEngine(assets, account.positions, bars, risk);
  const historical = historicalWorstMove(bars, assets, account.positions, equity);
  res.json({ ...report, historicalWorstMove: historical });
});

app.get("/api/paper/account", (_req, res) => {
  res.json({ account: paperAccount, killSwitch: killSwitchState });
});

const openSchema = z.object({ symbol: z.string().min(1).max(30), riskPercent: z.number().min(0.1).max(10).default(1) });

app.post("/api/paper/open", async (req, res) => {
  const parsed = openSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const liveAssets = await (async () => {
    const base = demoAssets.map(a => ({ ...a }));
    const cryptoSymbols = base.filter(a => a.assetClass === "Crypto").map(a => a.symbol);
    const forexSymbols = base.filter(a => a.assetClass === "Forex").map(a => a.symbol);
    const crypto = await new BinanceProvider().getQuotes(cryptoSymbols).catch(async () => new CoinGeckoProvider().getQuotes(cryptoSymbols).catch(() => []));
    const forex = await new FrankfurterProvider().getQuotes(forexSymbols).catch(() => []);
    const quotes = [...crypto, ...forex];
    return base.map(asset => {
      const quote = quotes.find(q => q.symbol === asset.symbol);
      return quote ? { ...asset, price: quote.price, market: quote.venue } : asset;
    });
  })();
  const history = await historyBySymbol(liveAssets);
  const signals = generateSignals(liveAssets, demoTraders, history);
  const signal = signals.find(s => s.symbol === parsed.data.symbol.toUpperCase());
  if (!signal) return res.status(404).json({ error: "no signal for symbol" });

  const result = openPositionFromSignal(paperAccount, signal, killSwitchState, parsed.data.riskPercent);
  paperAccount = result.account;
  recordAudit("paper_position_opened", { symbol: signal.symbol, opened: !!result.opened, reason: result.reason });
  res.json({ opened: result.opened, reason: result.reason, account: paperAccount });
});

const closeSchema = z.object({ symbol: z.string().min(1).max(30) });

app.post("/api/paper/close", async (req, res) => {
  const parsed = closeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const symbol = parsed.data.symbol.toUpperCase();
  const asset = demoAssets.find(a => a.symbol === symbol);
  if (!asset) return res.status(404).json({ error: "unknown symbol" });

  const { account, trade } = closePosition(paperAccount, symbol, asset.price);
  paperAccount = account;
  if (!trade) return res.status(404).json({ error: "no open position for symbol" });

  killSwitchState = recordTradeResult(killSwitchState, trade.pnl, KILL_SWITCH_CONFIG);
  if (killSwitchState.tripped) {
    recordAudit("kill_switch_tripped", { reason: killSwitchState.trippedReason, equity: killSwitchState.currentEquity });
    await insertKillSwitchEvent("tripped", killSwitchState.trippedReason, killSwitchState.currentEquity)
      .catch(err => console.error("[kill_switch_events] insert failed:", err.message));
  }

  recordAudit("paper_position_closed", { symbol, pnl: trade.pnl });
  await insertPaperTrade({ symbol: trade.symbol, direction: trade.direction, entryPrice: trade.entry, exitPrice: trade.exit, size: trade.size, signalScore: trade.signalScore, pnl: trade.pnl, openedAt: trade.openedAt })
    .catch(err => console.error("[paper_trades] insert failed:", err.message));

  res.json({ trade, account: paperAccount, killSwitch: killSwitchState });
});

app.post("/api/paper/reset-kill-switch", async (_req, res) => {
  const previousReason = killSwitchState.trippedReason;
  killSwitchState = resetKillSwitch(killSwitchState);
  recordAudit("kill_switch_reset", { previousReason });
  await insertKillSwitchEvent("reset", previousReason, killSwitchState.currentEquity)
    .catch(err => console.error("[kill_switch_events] insert failed:", err.message));
  res.json({ killSwitch: killSwitchState });
});

app.get("/api/paper/mark-to-market", (_req, res) => {
  const prices = Object.fromEntries(demoAssets.map(a => [a.symbol, a.price]));
  res.json({ equity: markToMarket(paperAccount, prices) });
});

app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  recordError("unhandled_request_error", { method: req.method, path: req.path, message: err instanceof Error ? err.message : String(err) });
  if (res.headersSent) return;
  res.status(500).json({ error: "internal server error", requestId: res.getHeader("X-Request-Id") });
});

marketEngine.refresh().catch(err => console.error("[engine] initial refresh failed", err));
const engineTimer = setInterval(() => {
  marketEngine.refresh().catch(err => console.error("[engine] scheduled refresh failed", err));
}, 60_000);
engineTimer.unref?.();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`TER API listening on http://0.0.0.0:${PORT}`);
});
