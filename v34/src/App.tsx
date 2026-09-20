import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Activity, Bell, BrainCircuit, CalendarDays, Globe2, Radar, ShieldCheck, Users, Zap, BarChart3, BriefcaseBusiness, ChartNoAxesCombined, CircleDollarSign, Database, FileText, Gauge, Landmark, Newspaper, Settings, SlidersHorizontal, Sparkles, Target, TriangleAlert, WalletCards, X, Menu, Network, ScrollText, Workflow } from "lucide-react";
import type { MarketAsset, OHLCVBar, Signal } from "./types";
import { getMarkets, getHistory } from "./services/marketData";
import { demoTraders, rankTraders } from "./services/socialIntelligence";
import { generateSignals, rankSignals } from "./services/signalEngine";
import { aiModels, ensembleExplanation } from "./services/aiOrchestrator";
import { backtest, monteCarloSimulation, runWalkForward, type BacktestTrade, type BacktestReport } from "./services/backtest";
import { computeSnapshot, type IndicatorSnapshot } from "./services/technicalIndicators";
import { validateByRegime, type RegimeValidationReport } from "./services/regimeValidation";
import { createKillSwitchState, recordTradeResult, type KillSwitchState } from "./services/riskEngine";
import type { PaperAccount } from "./services/paperTrading";
import { getPaperAccount, getSignals, getCalibration, getPortfolioRisk, getPortfolioOptimization, getAssetIntelligence, getIntelligenceOverview, openPaperPosition, closePaperPosition, resetKillSwitch, type CalibrationReport, type PortfolioRiskReport, type PortfolioOptimizationReport, type IntelligenceOverviewResponse } from "./services/apiClient";

/**
 * Demo trade generator used only to feed the backtest/walk-forward/Monte
 * Carlo machinery with something real: long entries taken every time
 * EMA20 crosses above EMA50, held for a fixed number of bars. This is a
 * placeholder strategy, not the production signal engine's execution logic —
 * see server/index.ts's crossoverStrategy for the same approach server-side.
 */
function demoTrades(bars: OHLCVBar[], holdBars = 5): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  for (let i = 50; i < bars.length - holdBars; i++) {
    const snapshot = computeSnapshot(bars.slice(0, i + 1));
    if (!snapshot || snapshot.ema20 <= snapshot.ema50) continue;
    trades.push({ entry: bars[i].close, exit: bars[i + holdBars].close, direction: "LONG", entryTs: bars[i].ts, exitTs: bars[i + holdBars].ts });
  }
  return trades;
}


type RouteKey = "dashboard" | "intelligence" | "notifications" | "institutional" | "watchlist" | "alerts" | "research" | "asset" | "markets" | "signals" | "analysis" | "portfolio" | "risk" | "optimizer" | "stress" | "macro" | "events" | "news" | "fundamentals" | "journal" | "ai" | "backtest" | "social" | "data" | "settings" | "workflow";

const NAV_GROUPS: Array<{ title: string; items: Array<{ key: RouteKey; label: string; icon: ReactNode; badge?: string }> }> = [
  { title: "TERMINAL", items: [
    { key: "dashboard", label: "Tableau de bord", icon: <Gauge size={17}/> },
    { key: "intelligence", label: "Intelligence Control Plane", icon: <BrainCircuit size={17}/>, badge: "v3.6" },
    { key: "research", label: "Research Terminal", icon: <FileText size={17}/>, badge: "CORE" },
    { key: "markets", label: "Marchés", icon: <ChartNoAxesCombined size={17}/> },
    { key: "signals", label: "Signaux IA", icon: <Target size={17}/> },
    { key: "analysis", label: "Analyse & Prédictions", icon: <BrainCircuit size={17}/> },
    { key: "institutional", label: "Institutional Core", icon: <Network size={17}/>, badge: "CORE" },
    { key: "watchlist", label: "Watchlists", icon: <Zap size={17}/> },
    { key: "alerts", label: "Alertes", icon: <Activity size={17}/> },
    { key: "notifications", label: "Centre de notifications", icon: <Bell size={17}/>, badge: "MONITOR" },
  ]},
  { title: "PORTEFEUILLE", items: [
    { key: "portfolio", label: "Portefeuille", icon: <WalletCards size={17}/> },
    { key: "risk", label: "Risk & Portfolio", icon: <ShieldCheck size={17}/> },
    { key: "optimizer", label: "Optimiseur", icon: <SlidersHorizontal size={17}/> },
    { key: "stress", label: "Stress Tests", icon: <TriangleAlert size={17}/> },
  ]},
  { title: "INTELLIGENCE", items: [
    { key: "macro", label: "Régimes & Macro", icon: <Landmark size={17}/> },
    { key: "fundamentals", label: "Fondamentaux", icon: <CircleDollarSign size={17}/>, badge: "FUND" },
    { key: "events", label: "Événements", icon: <CalendarDays size={17}/>, badge: "EVENT" },
    { key: "news", label: "News & NLP", icon: <Newspaper size={17}/>, badge: "NLP" },
    { key: "journal", label: "Journal des décisions", icon: <ScrollText size={17}/> },
    { key: "social", label: "Social Intelligence", icon: <Users size={17}/> },
  ]},
  { title: "ORCHESTRATION", items: [
    { key: "workflow", label: "Workflow Builder", icon: <Workflow size={17}/>, badge: "FLOW" },
  ]},
  { title: "LABORATOIRE", items: [
    { key: "ai", label: "AI Lab", icon: <Sparkles size={17}/> },
    { key: "backtest", label: "Backtesting", icon: <BarChart3 size={17}/> },
    { key: "data", label: "Données & Qualité", icon: <Database size={17}/> },
    { key: "settings", label: "Paramètres", icon: <Settings size={17}/> },
  ]}
];

function routeFromHash(): RouteKey {
  const value = window.location.hash.replace(/^#\/?/, "").split("/")[0] as RouteKey;
  return value === "asset" || NAV_GROUPS.some(g => g.items.some(i => i.key === value)) ? value : "dashboard";
}

function Sidebar({ route, navigate }: { route: RouteKey; navigate: (r: RouteKey) => void }) {
  return <aside className="sidebar">
    <div className="sideBrand"><Radar size={25}/><div><strong>TER</strong><span>Market Intelligence</span></div></div>
    {NAV_GROUPS.map(group => <div className="navGroup" key={group.title}>
      <small>{group.title}</small>
      {group.items.map(item => <button key={item.key} className={route === item.key ? "navItem active" : "navItem"} onClick={() => navigate(item.key)}>
        {item.icon}<span>{item.label}</span>{item.badge && <em>{item.badge}</em>}
      </button>)}
    </div>)}
    <div className="sideFooter"><span className="dot"/> Engine online<div>TER v3.6 · Intelligence Core</div></div>
  </aside>;
}

function PageHeader({ icon, title, subtitle, action }: { icon: ReactNode; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="pageHeader"><div className="pageTitle"><span className="pageIcon">{icon}</span><div><p className="eyebrow">TER INTELLIGENCE PLATFORM</p><h1>{title}</h1><p>{subtitle}</p></div></div>{action}</div>;
}
function PageCard({ title, subtitle, children, className = "" }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return <section className={`pageCard ${className}`}><div className="pageCardHead"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>{children}</section>;
}
function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return <div className="tableWrap"><table><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;
}
const Pill = ({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral"|"up"|"down"|"warn" }) => <span className={`pill ${tone}`}>{children}</span>;


function NotificationsPage() {
  const [data,setData]=useState<any>({notifications:[],status:{}});
  const load=()=>fetch("/api/notifications").then(r=>r.json()).then(setData).catch(()=>{});
  useEffect(()=>{ load(); const t=window.setInterval(load,15000); return ()=>window.clearInterval(t); },[]);
  const readAll=()=>fetch("/api/notifications/read-all",{method:"POST"}).then(load);
  const read=(id:string)=>fetch(`/api/notifications/${encodeURIComponent(id)}/read`,{method:"POST"}).then(load);
  return <><PageHeader icon={<Bell/>} title="Centre de notifications" subtitle="Surveillance continue des signaux, anomalies et qualité des données." action={<button className="primaryBtn" onClick={readAll}>Tout marquer comme lu</button>}/><div className="metricTiles"><Stat label="Notifications" value={String(data.status?.total ?? 0)}/><Stat label="Non lues" value={String(data.status?.unread ?? 0)}/><Stat label="Dernière alerte" value={data.status?.lastNotificationAt ? new Date(data.status.lastNotificationAt).toLocaleTimeString() : "—"}/><Stat label="Rafraîchissement" value="15s"/></div><PageCard title="Flux de surveillance"><DataTable headers={["Heure","Type","Actif","Sévérité","Message","État"]} rows={(data.notifications ?? []).map((n:any)=>[new Date(n.createdAt).toLocaleString(),n.kind,n.symbol??"GLOBAL",<Pill tone={n.severity === "HIGH" ? "down" : n.severity === "MEDIUM" ? "warn" : "neutral"}>{n.severity}</Pill>,<span title={n.source}>{n.title} — {n.message}</span>,n.read ? "LUE" : <button className="linkBtn" onClick={()=>read(n.id)}>Marquer lue</button>])}/></PageCard><PageCard title="Méthode"><p className="muted">Les notifications sont générées par des règles déterministes à partir des signaux, de la watchlist, des anomalies et de la qualité des flux. Elles ne constituent pas une recommandation d'investissement.</p></PageCard></> }

function InstitutionalPage({ report }: { report: any }) { return <><PageHeader icon={<Network/>} title="Institutional Intelligence" subtitle="Facteurs cross-asset, anomalies, couverture et surveillance centralisée."/><div className="metricTiles"><Stat label="Couverture" value={String(report?.coverage ?? "—")}/><Stat label="Facteurs" value={String(report?.factors?.length ?? 0)}/><Stat label="Anomalies" value={String(report?.anomalies?.length ?? 0)}/><Stat label="Watchlist" value={String(report?.watchlist?.length ?? 0)}/></div><PageCard title="Factor Exposure Matrix"><DataTable headers={["Facteur","Classe","Exposition","Interprétation"]} rows={(report?.factors ?? []).map((f:any)=>[f.factor,f.assetClass,f.exposure.toFixed(2),f.interpretation])}/></PageCard><PageCard title="Anomalies détectées"><DataTable headers={["Actif","Type","Score","Sévérité","Observation"]} rows={(report?.anomalies ?? []).map((a:any)=>[a.symbol,a.type,`${a.score}/100`,<Pill tone={a.severity === "HIGH" ? "down" : "warn"}>{a.severity}</Pill>,a.observation])}/></PageCard></> }
function WatchlistPage({ assets }: { assets: MarketAsset[] }) { const [rows,setRows]=useState<any[]>([]); const [symbol,setSymbol]=useState(""); const load=()=>fetch("/api/watchlist").then(r=>r.json()).then(setRows).catch(()=>setRows([])); useEffect(load,[]); const add=async(e:React.FormEvent)=>{e.preventDefault(); if(!symbol.trim())return; await fetch("/api/watchlist",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbol})}); setSymbol(""); load();}; return <><PageHeader icon={<Zap/>} title="Watchlists" subtitle="Univers personnels de surveillance pour le terminal."/><PageCard title="Ajouter un actif"><form className="inlineForm" onSubmit={add}><input value={symbol} onChange={e=>setSymbol(e.target.value)} placeholder="Ex. BTCUSD"/><button className="primaryBtn">Ajouter</button></form></PageCard><PageCard title="Mes actifs"><DataTable headers={["Symbole","Prix","24h","Source","Action"]} rows={rows.map(r=>{const a=assets.find(x=>x.symbol===r.symbol); return [r.symbol,a?.price.toLocaleString("en-US")??"—",a?`${a.change24h>=0?"+":""}${a.change24h}%`:"—",a?.provider??"—",<button className="linkBtn" onClick={()=>fetch(`/api/watchlist/${encodeURIComponent(r.symbol)}`,{method:"DELETE"}).then(load)}>Retirer</button>]})}/></PageCard></> }
function AlertsPage() {
  const [rows,setRows]=useState<any[]>([]); const [rules,setRules]=useState<any[]>([]); const [symbol,setSymbol]=useState("*"); const [threshold,setThreshold]=useState("70");
  const [ruleName,setRuleName]=useState("Nouvelle règle"); const [metric,setMetric]=useState("SIGNAL_SCORE"); const [operator,setOperator]=useState(">="); const [value,setValue]=useState("80"); const [logic,setLogic]=useState("ALL"); const [severity,setSeverity]=useState("MEDIUM"); const [cooldown,setCooldown]=useState("15");
  const load=()=>{ fetch("/api/alerts").then(r=>r.json()).then(setRows).catch(()=>setRows([])); fetch("/api/automation/rules").then(r=>r.json()).then(setRules).catch(()=>setRules([])); }; useEffect(load,[]);
  const add=async(e:React.FormEvent)=>{e.preventDefault(); await fetch("/api/alerts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbol,threshold:Number(threshold),direction:"ANY"})}); load();};
  const addRule=async(e:React.FormEvent)=>{e.preventDefault(); await fetch("/api/automation/rules",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:ruleName,symbol,logic,conditions:[{metric,operator,value:Number(value)}],severity,cooldownMinutes:Number(cooldown),enabled:true})}); load();};
  const toggle=async(r:any)=>{await fetch(`/api/automation/rules/${r.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:!r.enabled})});load();};
  return <><PageHeader icon={<Activity/>} title="Alertes & Automation" subtitle="Règles simples et conditions composables déclenchées par le moteur de monitoring."/>
    <div className="metricTiles"><Stat label="Alertes classiques" value={String(rows.length)}/><Stat label="Règles automation" value={String(rules.length)}/><Stat label="Actives" value={String(rules.filter(r=>r.enabled).length)}/><Stat label="Déclenchements" value={String(rules.reduce((a,r)=>a+(r.triggerCount||0),0))}/></div>
    <div className="pageGrid"><PageCard title="Alerte score rapide" subtitle="Compatibilité avec le système historique de seuils."><form className="inlineForm" onSubmit={add}><input value={symbol} onChange={e=>setSymbol(e.target.value.toUpperCase())} placeholder="* ou BTCUSD"/><input type="number" min="0" max="100" value={threshold} onChange={e=>setThreshold(e.target.value)}/><button className="primaryBtn">Créer</button></form><p className="muted">Déclenche lorsque le score du signal atteint le seuil pour l'actif choisi.</p></PageCard>
    <PageCard title="Constructeur de règle" subtitle="Créez une condition déterministe ; l'exécution reste en mode analyse/notification."><form className="ruleBuilder" onSubmit={addRule}><input value={ruleName} onChange={e=>setRuleName(e.target.value)} placeholder="Nom de la règle"/><select value={symbol} onChange={e=>setSymbol(e.target.value)}><option value="*">Tous les actifs</option>{["BTCUSD","ETHUSD","NVDA","AAPL","MSFT","EURUSD","XAUUSD","SPX","NDX"].map(x=><option key={x}>{x}</option>)}</select><select value={metric} onChange={e=>setMetric(e.target.value)}><option value="SIGNAL_SCORE">Score signal</option><option value="CONFIDENCE">Confiance</option><option value="CHANGE_24H">Variation 24h</option><option value="DATA_QUALITY_SCORE">Qualité données</option><option value="PRICE">Prix</option></select><select value={operator} onChange={e=>setOperator(e.target.value)}><option>&gt;</option><option>&gt;=</option><option>&lt;</option><option>&lt;=</option><option>=</option></select><input type="number" value={value} onChange={e=>setValue(e.target.value)}/><select value={logic} onChange={e=>setLogic(e.target.value)}><option>ALL</option><option>ANY</option></select><select value={severity} onChange={e=>setSeverity(e.target.value)}><option>INFO</option><option>MEDIUM</option><option>HIGH</option></select><input type="number" min="1" value={cooldown} onChange={e=>setCooldown(e.target.value)} placeholder="Cooldown min"/><button className="primaryBtn">Ajouter la règle</button></form><p className="muted">Métriques : score, confiance, variation, qualité et prix. Les règles sont évaluées toutes les 60 secondes.</p></PageCard></div>
    <PageCard title="Règles automation actives"><DataTable headers={["Nom","Actif","Conditions","Sévérité","Cooldown","Déclenchements","Actions"]} rows={rules.map(r=>[r.name,r.symbol,r.conditions.map((c:any)=>`${c.metric} ${c.operator} ${c.value}`).join(` ${r.logic} `),<Pill tone={r.severity === "HIGH" ? "down" : r.severity === "MEDIUM" ? "warn" : "neutral"}>{r.severity}</Pill>,`${r.cooldownMinutes} min`,r.triggerCount,<><button className="linkBtn" onClick={()=>toggle(r)}>{r.enabled?"Désactiver":"Activer"}</button>{" · "}<button className="linkBtn" onClick={()=>fetch(`/api/automation/rules/${r.id}`,{method:"DELETE"}).then(load)}>Supprimer</button></>])}/></PageCard>
    <PageCard title="Alertes historiques"><DataTable headers={["ID","Actif","Seuil","Direction","État","Action"]} rows={rows.map(r=>[r.id,r.symbol,r.threshold,r.direction,r.enabled?"ACTIVE":"OFF",<button className="linkBtn" onClick={()=>fetch(`/api/alerts/${r.id}`,{method:"DELETE"}).then(load)}>Supprimer</button>])}/></PageCard>
    <PageCard title="Cycle d'exécution"><div className="scenarioGrid"><div className="scenarioCard"><strong>1 · Collecte</strong><span>Quotes et qualité des flux.</span></div><div className="scenarioCard"><strong>2 · Évaluation</strong><span>Signaux et conditions des règles.</span></div><div className="scenarioCard"><strong>3 · Cooldown</strong><span>Anti-répétition configurable.</span></div><div className="scenarioCard"><strong>4 · Notification</strong><span>Journalisation dans le centre de notifications.</span></div></div></PageCard></>
}

function MarketsPage({ assets, onSelect }: { assets: MarketAsset[]; onSelect: (a: MarketAsset) => void }) {
  return <><PageHeader icon={<ChartNoAxesCombined/>} title="Marchés" subtitle="Univers multi-actifs, provenance, fraîcheur et mouvements observés."/><PageCard title="Univers global" subtitle={`${assets.length} instruments actuellement suivis`}>
    <DataTable headers={["Actif","Classe","Prix","24h","Source","Qualité","Latence"]} rows={assets.map(a => [<button className="linkBtn" onClick={()=>onSelect(a)}>{a.symbol}</button>, a.assetClass, a.price.toLocaleString("en-US"), <span className={a.change24h>=0?"up":"down"}>{a.change24h>=0?"+":""}{a.change24h}%</span>, a.provider ?? "synthetic", <Pill tone={a.dataQuality === "FRESH" ? "up" : "warn"}>{a.dataQuality ?? "UNKNOWN"} · {a.dataQualityScore ?? "—"}</Pill>, a.latencyMs != null ? `${a.latencyMs} ms` : "—"])} />
  </PageCard></>;
}
function SignalsPage({ signals, setSelected }: { signals: Signal[]; setSelected: (s: Signal)=>void }) {
  return <><PageHeader icon={<Target/>} title="Signaux IA" subtitle="Signaux, confluence, confiance et traçabilité des données."/><PageCard title="Radar complet"><DataTable headers={["Symbole","Direction","Score","Confiance","Confluence","Timeframe","Horodatage"]} rows={signals.map(s => [<button className="linkBtn" onClick={()=>setSelected(s)}>{s.symbol}</button>, <Pill tone={s.direction === "LONG" ? "up" : s.direction === "SHORT" ? "down" : "warn"}>{s.direction}</Pill>, `${s.score}/100`, `${s.confidence}%`, s.intelligence?.confluence ?? "—", s.timeframe, new Date(s.timestamp).toLocaleTimeString()])}/></PageCard></>;
}
function AnalysisPage({ signals, calibration }: { signals: Signal[]; calibration: CalibrationReport | null }) {
  return <><PageHeader icon={<BrainCircuit/>} title="Analyse & Prédictions" subtitle="Scénarios probabilistes, incertitude et validation hors-échantillon."/><div className="pageGrid"><PageCard title="Synthèse des scénarios"><div className="scenarioGrid">{signals.slice(0,6).map(s=><div className="scenarioCard" key={s.id}><strong>{s.symbol}</strong><Pill tone={s.direction === "LONG" ? "up" : s.direction === "SHORT" ? "down" : "warn"}>{s.direction}</Pill><b>{s.confidence}%</b><span>{s.aiDecision?.scenario.primary ?? "Scénario technique en attente"}</span><small>Incertitude {s.aiDecision?.uncertainty ?? "—"}% · accord {s.aiDecision?.agreement ?? "—"}</small></div>)}</div></PageCard><PageCard title="Calibration probabiliste" subtitle="Mesure de la qualité des probabilités lorsqu'un historique suffisant existe.">{calibration ? <div className="metricTiles"><Stat label="Échantillon" value={String(calibration.sampleSize)}/><Stat label="Résolus" value={String(calibration.resolved)}/><Stat label="Brier" value={calibration.brierScore?.toFixed(3) ?? "—"}/><Stat label="Log Loss" value={calibration.logLoss?.toFixed(3) ?? "—"}/></div> : <p className="muted">Sélectionnez un signal pour afficher sa calibration.</p>}</PageCard></div></>;
}
function PortfolioPage({ account, risk }: { account: PaperAccount | null; risk: PortfolioRiskReport | null }) {
  return <><PageHeader icon={<WalletCards/>} title="Portefeuille" subtitle="Paper portfolio, positions, liquidités et performance simulée."/><div className="metricTiles"><Stat label="Capital initial" value={account?.startingEquity.toLocaleString("en-US") ?? "—"}/><Stat label="Liquidités" value={account?.cash.toLocaleString("en-US") ?? "—"}/><Stat label="Positions" value={String(account?.positions.length ?? 0)}/><Stat label="Trades clôturés" value={String(account?.closedTrades.length ?? 0)}/></div><PageCard title="Positions ouvertes"><DataTable headers={["Symbole","Direction","Taille","Entrée","PnL"]} rows={(risk?.positions ?? []).map(p=>[p.symbol,p.direction,p.size,p.entry.toFixed(2),<span className={p.pnl>=0?"up":"down"}>{p.pnl.toFixed(2)}</span>])}/></PageCard></>;
}
function RiskPage({ risk }: { risk: PortfolioRiskReport | null }) { return <><PageHeader icon={<ShieldCheck/>} title="Risk & Portfolio" subtitle="Exposition, volatilité, corrélations, VaR indicative et alertes."/><div className="metricTiles"><Stat label="Exposition brute" value={`${risk?.grossExposure.toFixed(2) ?? "—"}`}/><Stat label="Exposition nette" value={`${risk?.netExposure.toFixed(2) ?? "—"}`}/><Stat label="Volatilité" value={`${risk?.portfolioVolatilityPercent.toFixed(2) ?? "—"}%`}/><Stat label="VaR 95% indicative" value={`${risk?.estimatedDailyVaRPercent.toFixed(2) ?? "—"}%`}/></div><PageCard title="Exposition par classe"><DataTable headers={["Classe","Notional","Poids"]} rows={(risk?.byAssetClass ?? []).map(x=>[x.assetClass,x.notional.toFixed(2),`${x.percent.toFixed(1)}%`])}/></PageCard><PageCard title="Corrélations"><div className="tagCloud">{(risk?.correlations ?? []).filter(c=>c.a!==c.b).map(c=><Pill key={`${c.a}-${c.b}`}>{c.a}/{c.b} · {c.value.toFixed(2)}</Pill>)}</div></PageCard></> }
function OptimizerPage({ optimization }: { optimization: PortfolioOptimizationReport | null }) { return <><PageHeader icon={<SlidersHorizontal/>} title="Optimiseur" subtitle="Allocation théorique sous contraintes d'exposition et de risque."/><PageCard title={optimization ? `Méthode ${optimization.method}` : "Optimisation"}>{optimization ? <DataTable headers={["Actif","Poids actuel","Poids cible","Delta","Rationale"]} rows={optimization.positions.map(p=>[p.symbol,`${p.currentWeight.toFixed(1)}%`,`${p.targetWeight.toFixed(1)}%`,`${p.deltaWeight>=0?"+":""}${p.deltaWeight.toFixed(1)}%`,p.rationale])}/> : <p className="muted">Calcul…</p>}</PageCard></> }
function StressPage({ report }: { report: any }) { return <><PageHeader icon={<TriangleAlert/>} title="Stress Tests" subtitle="Scénarios déterministes et vulnérabilité du portefeuille."/><PageCard title="Scénarios"><div className="scenarioGrid">{(report?.scenarios ?? []).map((x:any)=><div className="scenarioCard"><strong>{x.name}</strong><b className={x.pnlAmount>=0?"up":"down"}>{x.pnlAmount.toFixed(2)}</b><span>{x.pnlPercent.toFixed(2)}% · {x.shockedPositions} positions</span></div>)}</div></PageCard></> }
function MacroPage({ report }: { report: any }) { return <><PageHeader icon={<Landmark/>} title="Régimes & Macro" subtitle="Facteurs communs, régime de marché et rotation inter-classes."/><div className="metricTiles"><Stat label="Régime" value={report?.regime ?? "—"}/><Stat label="Score" value={report ? `${report.score}/100` : "—"}/><Stat label="Confiance" value={report ? `${report.confidence}%` : "—"}/><Stat label="Facteurs" value={String(report?.factors?.length ?? 0)}/></div><PageCard title="Facteurs"><DataTable headers={["Facteur","Valeur","Contribution","Confiance","Lecture"]} rows={(report?.factors ?? []).map((f:any)=>[f.name,f.value.toFixed(2),f.contribution.toFixed(2),`${f.confidence}%`,f.interpretation])}/></PageCard><PageCard title="Heatmap des classes"><div className="heatmap">{(report?.assetClassHeatmap ?? []).map((x:any)=><div key={x.assetClass}><strong>{x.assetClass}</strong><b>{x.score.toFixed(2)}</b><span>{x.label}</span></div>)}</div></PageCard></> }
function EventsPage({ report }: { report: any }) { return <><PageHeader icon={<CalendarDays/>} title="Événements" subtitle="Calendrier macro, banques centrales, résultats et événements sectoriels."/><PageCard title="Calendrier"><DataTable headers={["Date","Événement","Région","Importance","Actifs"]} rows={(report?.events ?? []).map((e:any)=>[new Date(e.scheduledAt).toLocaleString(),e.title,e.region,<Pill tone={e.importance === "HIGH" ? "down" : "warn"}>{e.importance}</Pill>,e.symbols.join(", ")])}/></PageCard></> }
function NewsPage({ nlp }: { nlp: any }) { return <><PageHeader icon={<Newspaper/>} title="News & NLP" subtitle="Entités, thèmes, sentiment, nouveauté, urgence et attribution d'impact."/><div className="metricTiles"><Stat label="News" value={String(nlp?.news?.length ?? 0)}/><Stat label="Entités" value={String(nlp?.entities?.length ?? 0)}/><Stat label="Thèmes" value={String(nlp?.topics?.length ?? 0)}/><Stat label="Doublons" value={String(nlp?.duplicateGroups ?? 0)}/></div><PageCard title="Analyse NLP"><DataTable headers={["Publication","Sentiment","Impact","Nouveauté","Urgence","Entités"]} rows={(nlp?.news ?? []).map((n:any)=>[n.title,<Pill tone={n.sentimentLabel === "BULLISH" ? "up" : n.sentimentLabel === "BEARISH" ? "down" : "neutral"}>{n.sentimentLabel} {n.sentimentScore>0?"+":""}{n.sentimentScore}</Pill>,n.impact,`${Math.round(n.noveltyScore*100)}%`,`${Math.round(n.urgencyScore*100)}%`,n.entities.map((e:any)=>e.text).join(", ") || "—"])}/></PageCard><PageCard title="Thèmes"><div className="tagCloud">{(nlp?.topics ?? []).map((t:any)=><Pill key={t.topic}>{t.topic} · {t.mentions} · {t.sentiment>0?"+":""}{t.sentiment}</Pill>)}</div></PageCard></> }

function ResearchPage({ assets, selectedSymbol, onSelect }: { assets: MarketAsset[]; selectedSymbol: string; onSelect: (symbol: string) => void }) {
  const [query, setQuery] = useState(selectedSymbol || assets[0]?.symbol || "");
  const [report, setReport] = useState<any>(null);
  const [bars, setBars] = useState<OHLCVBar[]>([]);
  const [loading, setLoading] = useState(false);
  const symbol = selectedSymbol || assets[0]?.symbol || "";

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getAssetIntelligence(symbol),
      getHistory(assets.find(a => a.symbol === symbol) ?? assets[0], 180)
    ]).then(([r, h]) => {
      if (cancelled) return;
      if (r.ok) setReport(r.data);
      setBars(h);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, assets]);

  const submit = (e: React.FormEvent) => { e.preventDefault(); const normalized = query.trim().toUpperCase(); if (normalized) onSelect(normalized); };
  const closes = bars.slice(-90).map(b => b.close);
  const min = Math.min(...closes, 0), max = Math.max(...closes, 1);
  const points = closes.map((v, i) => `${(i / Math.max(closes.length - 1, 1)) * 100},${92 - ((v - min) / Math.max(max - min, 1)) * 82}`).join(" ");
  const exportReport = () => {
    if (!report) return;
    const text = [
      `TER v3.6 — Research Report ${report.asset.symbol}`,
      `Généré: ${report.generatedAt}`,
      `Prix: ${report.asset.price}`,
      `Qualité: ${report.dataHealth.status} ${report.dataHealth.score}/100`,
      `Régime: ${report.macro.regime} · confiance ${report.macro.confidence}%`,
      `News: ${report.news.sentimentLabel} · impact ${report.news.impactScore}`,
      `Fondamentaux: qualité ${report.fundamental.qualityScore}/100`,
      `IA: ${report.ai?.stance ?? "NEUTRAL"} · bullish ${report.ai?.probability?.bullish ?? "—"}% · neutre ${report.ai?.probability?.neutral ?? "—"}% · bearish ${report.ai?.probability?.bearish ?? "—"}%`,
      "",
      "Facteurs:", ...report.factors.map((f:any) => `- ${f.name}: ${f.value} ${f.direction} — ${f.note}`),
      "",
      "Limites:", ...report.warnings.map((w:string) => `- ${w}`)
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `TER-${report.asset.symbol}-research.txt`; a.click(); URL.revokeObjectURL(url);
  };
  return <>
    <PageHeader icon={<FileText/>} title="Research Terminal" subtitle="Recherche approfondie, chronologie des facteurs, comparaison et rapport exportable." action={<button className="smallBtn" onClick={exportReport} disabled={!report}>Exporter le rapport</button>}/>
    <form className="researchSearch" onSubmit={submit}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher un symbole…"/><button className="smallBtn" type="submit">Analyser</button><div className="researchQuick">{assets.slice(0,8).map(a=><button type="button" className={a.symbol===symbol?"active":""} key={a.symbol} onClick={()=>{setQuery(a.symbol);onSelect(a.symbol)}}>{a.symbol}</button>)}</div></form>
    {loading && <PageCard title="Analyse en cours"><p className="muted">Agrégation des données techniques, fondamentales, macro, news et IA…</p></PageCard>}
    {report && <>
      <div className="metricTiles"><Stat label="Prix" value={Number(report.asset.price).toLocaleString("en-US")}/><Stat label="Qualité données" value={`${report.dataHealth.score}/100`}/><Stat label="Régime" value={report.macro.regime}/><Stat label="Confluence IA" value={report.ai?.agreement ?? "—"}/></div>
      <PageCard title={`${report.asset.symbol} · Price Action`} subtitle="Historique disponible pour contextualiser les signaux ; la visualisation reste descriptive."><div className="researchChart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Historique de prix"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.4" vectorEffect="non-scaling-stroke"/></svg><div className="chartLabels"><span>{closes.length ? closes[0].toLocaleString("en-US") : "—"}</span><span>{closes.length ? closes[closes.length-1].toLocaleString("en-US") : "—"}</span></div></div></PageCard>
      <div className="pageGrid"><PageCard title="Attribution des facteurs"><DataTable headers={["Facteur","Valeur","Direction","Poids","Lecture"]} rows={report.factors.map((f:any)=>[f.name,Number(f.value).toFixed(2),<Pill tone={f.direction==="POSITIVE"?"up":f.direction==="NEGATIVE"?"down":"neutral"}>{f.direction}</Pill>,`${f.weight}%`,f.note])}/></PageCard><PageCard title="Timeline intelligence"><div className="timeline">{[...report.news.topItems.map((n:any)=>({date:n.publishedAt,title:n.title,meta:`${n.source} · ${n.impact}`})), ...report.events.map((e:any)=>({date:e.scheduledAt,title:e.title,meta:`${e.region} · ${e.category} · ${e.importance}`}))].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()).slice(0,10).map((x:any,i)=><div className="timelineItem" key={`${x.date}-${i}`}><small>{new Date(x.date).toLocaleString()}</small><strong>{x.title}</strong><span>{x.meta}</span></div>)}</div></PageCard></div>
      <PageCard title="Scénario et incertitude"><div className="assetSignal"><Stat label="Stance" value={report.ai?.stance ?? "NEUTRAL"}/><Stat label="Bullish" value={report.ai ? `${report.ai.probability.bullish}%` : "—"}/><Stat label="Neutre" value={report.ai ? `${report.ai.probability.neutral}%` : "—"}/><Stat label="Bearish" value={report.ai ? `${report.ai.probability.bearish}%` : "—"}/><Stat label="Incertitude" value={report.ai ? `${report.ai.uncertainty}%` : "—"}/><Stat label="Accord" value={report.ai?.agreement ?? "—"}/></div><p className="explain">{report.ai?.scenario?.primary ?? "Aucun scénario IA disponible."}</p><p className="muted"><b>Incertitude :</b> les probabilités sont des sorties analytiques et doivent être confrontées à la calibration historique et à la qualité des données.</p></PageCard>
      <PageCard title="Comparaison rapide de l’univers" subtitle="Comparaison descriptive, sans classement global ni recommandation."><DataTable headers={["Symbole","Classe","24h","Qualité","Source"]} rows={assets.filter(a=>a.symbol!==report.asset.symbol).slice(0,10).map(a=>[<button className="linkBtn" onClick={()=>{setQuery(a.symbol);onSelect(a.symbol)}}>{a.symbol}</button>,a.assetClass,`${a.change24h>=0?"+":""}${a.change24h}%`,`${a.dataQuality??"—"} · ${a.dataQualityScore??"—"}`,a.provider??"synthetic"])}/></PageCard>
      {report.warnings.length>0 && <PageCard title="Limites et qualité"><div className="assetWarnings">{report.warnings.map((w:string)=><div key={w}>{w}</div>)}</div></PageCard>}
    </>}
  </>;
}

function UnifiedAssetPage({ report, onBack }: { report: any; onBack: () => void }) {
  if (!report) return <><PageHeader icon={<Network/>} title="Intelligence actif" subtitle="Agrégation marché, technique, fondamentaux, macro, news et IA."/><PageCard title="Chargement"><p className="muted">Construction de la fiche d'intelligence unifiée…</p></PageCard></>;
  const a = report.asset;
  const t = report.technical;
  return <>
    <PageHeader icon={<Network/>} title={`${a.symbol} · Intelligence unifiée`} subtitle="Une vue transversale de l'actif, avec provenance, facteurs et incertitude explicites." action={<button className="smallBtn" onClick={onBack}>← Retour aux marchés</button>}/>
    <div className="healthBanner"><div><b>{a.dataQuality ?? "UNKNOWN"} · {report.dataHealth.score}/100</b><span> · {a.dataSource === "live" ? `Flux live · ${a.provider ?? "provider"}` : "Données synthétiques"}</span></div><span>{a.receivedAt ? `Réception ${new Date(a.receivedAt).toLocaleString()}` : "Réception inconnue"}{a.latencyMs != null ? ` · ${a.latencyMs} ms` : ""}</span></div>
    <div className="assetHero"><div className="assetHeroMain"><p className="eyebrow">{a.assetClass} · {a.market}</p><h1>{a.symbol}</h1><div className="assetPrice">{Number(a.price).toLocaleString("en-US")}</div><div className="assetMeta"><Pill tone={a.change24h >= 0 ? "up" : "down"}>24h {a.change24h >= 0 ? "+" : ""}{a.change24h}%</Pill><Pill>{report.macro.regime}</Pill><Pill tone={report.news.sentimentLabel === "BULLISH" ? "up" : report.news.sentimentLabel === "BEARISH" ? "down" : "neutral"}>News {report.news.sentimentLabel}</Pill></div></div><div className="assetHeroMain"><p className="eyebrow">ENSEMBLE IA</p><div className="assetPrice">{report.ai?.stance ?? "NEUTRAL"}</div><div className="detailGrid"><Stat label="Bullish" value={report.ai ? `${report.ai.probability.bullish}%` : "—"}/><Stat label="Neutre" value={report.ai ? `${report.ai.probability.neutral}%` : "—"}/><Stat label="Baissier" value={report.ai ? `${report.ai.probability.bearish}%` : "—"}/></div></div></div>
    <PageCard title="Facteurs unifiés" subtitle="Lecture descriptive : chaque facteur reste traçable à une source du moteur TER."><div className="factorGrid">{report.factors.map((f:any)=><div className={`factorCard ${f.direction.toLowerCase()}`} key={f.name}><strong>{f.name}</strong><b>{f.value >= 0 ? "+" : ""}{Number(f.value).toFixed(2)}</b><Pill tone={f.direction === "POSITIVE" ? "up" : f.direction === "NEGATIVE" ? "down" : "neutral"}>{f.direction}</Pill><small>{f.note}</small></div>)}</div></PageCard>
    <div className="pageGrid"><PageCard title="Technique" subtitle="Indicateurs adaptatifs sur l'historique disponible.">{t ? <div className="assetSignal"><Stat label="RSI" value={t.rsi.toFixed(1)}/><Stat label="ADX" value={t.adx.toFixed(1)}/><Stat label="ATR" value={`${(t.atrPct*100).toFixed(2)}%`}/><Stat label="Régime" value={t.regime}/><Stat label="Mode" value={t.oscillatorMode}/><Stat label="EMA20 / EMA50" value={`${t.ema20.toFixed(2)} / ${t.ema50.toFixed(2)}`}/></div> : <p className="muted">Historique insuffisant.</p>}</PageCard>
    <PageCard title="Fondamentaux" subtitle="Les données de démonstration restent identifiées comme synthétiques."><div className="assetSignal"><Stat label="Qualité" value={`${report.fundamental.qualityScore}/100`}/><Stat label="Croissance" value={`${report.fundamental.growthScore}/100`}/><Stat label="Bilan" value={`${report.fundamental.balanceSheetScore}/100`}/><Stat label="Valorisation" value={`${report.fundamental.valuationScore}/100`}/><Stat label="P/E" value={report.fundamental.pe == null ? "—" : report.fundamental.pe.toFixed(1)}/><Stat label="ROE" value={report.fundamental.roe == null ? "—" : `${report.fundamental.roe.toFixed(1)}%`}/></div></PageCard></div>
    <div className="pageGrid"><PageCard title="News & NLP"><div className="assetSignal"><Stat label="Publications" value={String(report.news.count)}/><Stat label="Sentiment" value={report.news.sentimentLabel}/><Stat label="Impact" value={report.news.impactScore.toFixed(2)}/><Stat label="Nouveauté" value={`${Math.round(report.news.noveltyScore*100)}%`}/><Stat label="Urgence" value={`${Math.round(report.news.urgencyScore*100)}%`}/><Stat label="Entités" value={String(report.news.topItems.reduce((n:any,x:any)=>n + 1, 0))}/></div><div className="timeline">{report.news.topItems.map((n:any)=><div className="timelineItem" key={`${n.publishedAt}-${n.title}`}><small>{new Date(n.publishedAt).toLocaleTimeString()}</small><strong>{n.title}</strong><span>{n.source} · {n.impact} · sentiment {n.sentimentScore >= 0 ? "+" : ""}{n.sentimentScore.toFixed(2)}</span></div>)}</div></PageCard>
    <PageCard title="Événements"><div className="timeline">{report.events.map((e:any)=><div className="timelineItem" key={e.id}><small>{new Date(e.scheduledAt).toLocaleDateString()}</small><strong>{e.title}</strong><span>{e.region} · {e.category} · {e.importance}</span></div>)}{report.events.length === 0 && <p className="muted">Aucun événement directement attribué.</p>}</div></PageCard></div>
    {report.ai && <PageCard title="Scénario IA" subtitle="Scénario probabiliste, pas une certitude ni une recommandation personnalisée."><div className="assetSignal"><Stat label="Stance" value={report.ai.stance}/><Stat label="Accord" value={report.ai.agreement}/><Stat label="Incertitude" value={`${report.ai.uncertainty}%`}/></div><p className="explain">{report.ai.scenario.primary}</p><p className="muted"><b>Invalidation :</b> {report.ai.scenario.invalidation}</p><p className="muted"><b>Alternatif :</b> {report.ai.scenario.alternative}</p></PageCard>}
    {report.warnings.length > 0 && <PageCard title="Limites & avertissements"><div className="assetWarnings">{report.warnings.map((w:string)=><div key={w}>{w}</div>)}</div></PageCard>}
  </>;
}

function FundamentalsPage({ report }: { report: any }) {
  return <><PageHeader icon={<CircleDollarSign/>} title="Fondamentaux" subtitle="Croissance, rentabilité, bilan et valorisation des actifs couverts."/><div className="metricTiles"><Stat label="Couverture" value={`${report?.coverage ?? 0}%`}/><Stat label="Sociétés couvertes" value={String((report?.snapshots ?? []).filter((x:any)=>x.revenueGrowthYoY !== null).length)}/><Stat label="Qualité moyenne" value={report?.snapshots?.length ? `${Math.round(report.snapshots.reduce((a:any,x:any)=>a+x.qualityScore,0)/report.snapshots.length)}/100` : "—"}/><Stat label="Source" value="Démo"/></div><PageCard title="Tableau fondamental" subtitle="Les valeurs ci-dessous sont explicitement synthétiques dans le jeu de démonstration."><DataTable headers={["Actif","Secteur","Croissance CA","Croissance BPA","Marge op.","D/E","P/E","Forward P/E","Qualité"]} rows={(report?.snapshots ?? []).map((x:any)=>[x.symbol,x.sector,x.revenueGrowthYoY == null ? "—" : `${x.revenueGrowthYoY.toFixed(1)}%`,x.earningsGrowthYoY == null ? "—" : `${x.earningsGrowthYoY.toFixed(1)}%`,x.operatingMargin == null ? "—" : `${x.operatingMargin.toFixed(1)}%`,x.debtToEquity == null ? "—" : x.debtToEquity.toFixed(2),x.pe == null ? "—" : x.pe.toFixed(1),x.forwardPe == null ? "—" : x.forwardPe.toFixed(1),<Pill tone={x.qualityScore >= 80 ? "up" : x.qualityScore < 55 ? "warn" : "neutral"}>{x.qualityScore}/100</Pill>])}/></PageCard><PageCard title="Lecture par facteur"><div className="scenarioGrid">{(report?.snapshots ?? []).filter((x:any)=>x.revenueGrowthYoY !== null).map((x:any)=><div className="scenarioCard" key={x.symbol}><strong>{x.symbol} · {x.sector}</strong><span>Croissance {x.growthScore}/100 · Bilan {x.balanceSheetScore}/100 · Valorisation {x.valuationScore}/100</span><b>Qualité {x.qualityScore}/100</b><small>{x.flags.join(" · ")}</small></div>)}</div></PageCard><p className="muted">{report?.methodology}</p></>;
}

function JournalPage() { const [rows,setRows]=useState<any[]>([]); useEffect(()=>{fetch("/api/ai/journal").then(r=>r.ok?r.json():[]).then(setRows).catch(()=>setRows([]));},[]); return <><PageHeader icon={<ScrollText/>} title="Journal des décisions" subtitle="Historique des scénarios IA et de leur résolution hors-échantillon."/><PageCard title="Observations"><DataTable headers={["Symbole","Généré","Horizon","Entrée","Outcome"]} rows={rows.map(r=>[r.symbol,new Date(r.generatedAt).toLocaleString(),`${r.horizonHours}h`,r.entryPrice.toFixed(2),r.outcome ?? "PENDING"])}/></PageCard></> }
function AIPage({ signals }: { signals: Signal[] }) { return <><PageHeader icon={<Sparkles/>} title="AI Lab" subtitle="Ensemble d'analystes, accord, incertitude et connecteurs de modèles."/><PageCard title="Analystes"><div className="aiModelGrid">{aiModels.map(m=><div className="scenarioCard"><strong>{m.name}</strong><span>{m.role}</span><small>{m.specialty}</small><Pill tone={m.status === "active" ? "up" : "neutral"}>{m.status === "active" ? "ACTIF" : "PLANIFIÉ"}</Pill></div>)}</div></PageCard><PageCard title="Décisions récentes"><DataTable headers={["Actif","Stance","Probabilités","Accord","Incertitude"]} rows={signals.slice(0,8).map(s=>[s.symbol,s.aiDecision?.stance ?? "—",s.aiDecision ? `${s.aiDecision.probability.bullish}/${s.aiDecision.probability.neutral}/${s.aiDecision.probability.bearish}` : "—",s.aiDecision?.agreement ?? "—",s.aiDecision ? `${s.aiDecision.uncertainty}%` : "—"])}/></PageCard></> }
function BacktestPage({ report, folds }: { report: BacktestReport | null; folds: BacktestReport[] }) { return <><PageHeader icon={<BarChart3/>} title="Backtesting" subtitle="Performance historique, walk-forward, Monte Carlo et validation par régime."/><PageCard title="Rapport principal">{report ? <div className="metricTiles"><Stat label="Trades" value={String(report.trades)}/><Stat label="Win rate" value={`${report.winRate.toFixed(1)}%`}/><Stat label="Expectancy" value={report.expectancy.toFixed(3)}/><Stat label="Max DD" value={report.maxDrawdown.toFixed(2)}/><Stat label="Sharpe" value={report.sharpe.toFixed(2)}/><Stat label="Sortino" value={report.sortino.toFixed(2)}/></div> : <p className="muted">Calcul…</p>}</PageCard><PageCard title="Walk-forward hors-échantillon"><DataTable headers={["Fold","Trades","Win rate","Sharpe","Drawdown"]} rows={folds.map((f,i)=>[i+1,f.trades,`${f.winRate.toFixed(1)}%`,f.sharpe.toFixed(2),f.maxDrawdown.toFixed(2)])}/></PageCard></> }
function SocialPage() { return <><PageHeader icon={<Users/>} title="Social Intelligence" subtitle="Profils publics, stratégies observées et qualité des échantillons."/><PageCard title="Profils suivis"><DataTable headers={["Profil","Plateforme","Stratégie","Échantillon","Win rate","Consistance"]} rows={rankTraders(demoTraders).map(t=>[t.handle,t.platform,t.strategy,t.sampleSize,`${t.winRate}%`,t.consistency])}/></PageCard></> }
function DataPage({ assets, engineStatus }: { assets: MarketAsset[]; engineStatus: any }) { return <><PageHeader icon={<Database/>} title="Données & Qualité" subtitle="Provenance, fraîcheur, latence, cache et santé du moteur temps réel."/><div className="metricTiles"><Stat label="Actifs" value={String(assets.length)}/><Stat label="Fresh" value={String(assets.filter(a=>a.dataQuality === "FRESH").length)}/><Stat label="Synthétiques" value={String(assets.filter(a=>a.dataQuality === "SYNTHETIC" || a.dataSource === "synthetic").length)}/><Stat label="Échecs fournisseurs" value={String(engineStatus?.failureCount ?? 0)}/></div><PageCard title="Santé des flux"><DataTable headers={["Actif","Provider","Source","Qualité","Score","Réception","Latence"]} rows={assets.map(a=>[a.symbol,a.provider??"—",a.dataSource??"—",a.dataQuality??"—",a.dataQualityScore??"—",a.receivedAt ? new Date(a.receivedAt).toLocaleTimeString() : "—",a.latencyMs != null ? `${a.latencyMs} ms` : "—"])}/></PageCard></> }

function WorkflowPage() {
  const [rows,setRows]=useState<any[]>([]); const [stats,setStats]=useState<any>({}); const [runs,setRuns]=useState<any[]>([]);
  const load=()=>Promise.all([fetch("/api/workflows").then(r=>r.json()),fetch("/api/workflows/stats").then(r=>r.json())]).then(([w,s])=>{setRows(w);setStats(s)}).catch(()=>{});
  useEffect(()=>{load();},[]);
  const add=async()=>{await fetch("/api/workflows",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Nouveau workflow",description:"Workflow configurable TER",status:"DRAFT",nodes:[{id:"trigger",type:"TRIGGER",label:"Déclencheur",config:{event:"SIGNAL_CREATED"}},{id:"condition",type:"CONDITION",label:"Condition",config:{metric:"SIGNAL_SCORE",operator:">=",value:70}},{id:"notification",type:"NOTIFICATION",label:"Notification",config:{severity:"MEDIUM"}}],edges:[{from:"trigger",to:"condition"},{from:"condition",to:"notification",when:"TRUE"}]})});load();};
  const run=async(id:string)=>{const r=await fetch(`/api/workflows/${id}/run`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dryRun:true})}); if(r.ok){const item=await r.json(); setRuns(x=>[item,...x]);} load();};
  return <><PageHeader icon={<Workflow/>} title="Workflow Builder" subtitle="Orchestration visuelle des conditions, validations, scénarios et notifications." action={<button className="primaryBtn" onClick={add}>+ Nouveau workflow</button>}/><div className="metricTiles"><Stat label="Workflows" value={String(stats.workflows??0)}/><Stat label="Actifs" value={String(stats.active??0)}/><Stat label="Brouillons" value={String(stats.drafts??0)}/><Stat label="Exécutions" value={String(stats.runs??0)}/></div><PageCard title="Workflows configurés"><DataTable headers={["Nom","Statut","Nœuds","Transitions","Exécutions","Action"]} rows={rows.map(w=>[w.name,<Pill tone={w.status==="ACTIVE"?"up":"neutral"}>{w.status}</Pill>,w.nodes.length,w.edges.length,w.runCount,<><button className="linkBtn" onClick={()=>run(w.id)}>Tester en simulation</button> <button className="linkBtn" onClick={()=>fetch(`/api/workflows/${w.id}`,{method:"DELETE"}).then(load)}>Supprimer</button></>])}/></PageCard><PageCard title="Architecture d'un workflow"><div className="workflowFlow">{["TRIGGER","CONDITION","LOGIC ALL/ANY","SCENARIO","JOURNAL","NOTIFICATION"].map((x,i)=><div className="scenarioCard" key={x}><strong>{i+1}. {x}</strong><span>Étape configurable</span></div>)}</div><p className="muted">Les workflows sont exécutés en mode simulation dans cette version. Aucune transmission d'ordre vers un courtier n'est implémentée.</p></PageCard></>
}

function IntelligencePage({ overview }: { overview: IntelligenceOverviewResponse | null }) {
  return <><PageHeader icon={<BrainCircuit/>} title="Intelligence Control Plane" subtitle="Couche d'orchestration v3.6 : provenance, confiance, contradictions, scénarios et cadre de décision." action={<button className="smallBtn" onClick={()=>window.location.reload()}>Rafraîchir</button>}/>
    {overview ? <><div className="metricTiles"><Stat label="Confiance globale" value={`${overview.globalConfidence}%`}/><Stat label="Couverture signaux" value={`${overview.coverage}%`}/><Stat label="Contradictions" value={String(overview.contradictions)}/><Stat label="Régime" value={overview.regime}/></div>
      <div className="pageGrid">
        <PageCard title="Decision Frame" subtitle="Synthèse conditionnelle — aucune certitude ni exécution réelle."><div className="metricTiles"><Stat label="Stance" value={overview.decision.stance}/><Stat label="Haussier" value={`${overview.decision.probabilities.bullish}%`}/><Stat label="Neutre" value={`${overview.decision.probabilities.neutral}%`}/><Stat label="Baissier" value={`${overview.decision.probabilities.bearish}%`}/></div><p className="muted">{overview.decision.scenario.base}</p><p className="muted">Upside : {overview.decision.scenario.upside}</p><p className="muted">Downside : {overview.decision.scenario.downside}</p><p className="warning">Invalidation : {overview.decision.scenario.invalidation}</p></PageCard>
        <PageCard title="Control Matrix" subtitle="Mesures qui pilotent la confiance agrégée."><DataTable headers={["Contrôle","Score","Lecture"]} rows={[["Qualité données",`${overview.controls.dataQuality}%`,overview.controls.dataQuality>=80?"solide":"à surveiller"],["Accord modèles",`${overview.controls.modelAgreement}%`,overview.controls.modelAgreement>=70?"convergent":"divergent"],["Fraîcheur",`${overview.controls.freshness}%`,overview.controls.freshness>=80?"fraîche":"dégradée"],["Incertitude",`${overview.controls.uncertainty}%`,overview.controls.uncertainty<=25?"contenue":"élevée"]]}/></PageCard>
      </div>
      <PageCard title="Contradiction Engine" subtitle="Les conflits inter-domaines sont conservés et pénalisent la confiance au lieu d'être masqués.">{overview.decision.contradictions.length ? <DataTable headers={["Sévérité","Domaines","Observation","Résolution"]} rows={overview.decision.contradictions.map(c=>[<Pill tone={c.severity==="HIGH"?"down":"warn"}>{c.severity}</Pill>,c.id,c.description,c.resolution])}/> : <p className="muted">Aucune contradiction forte détectée sur le snapshot courant.</p>}</PageCard>
      <PageCard title="Provenance & Audit" subtitle="Chaque synthèse indique sa source, son origine et sa qualité."><DataTable headers={["Évidence","Source","Origine","Qualité","Méthodologie"]} rows={overview.sources.map(x=>[x.value,x.provenance.source,x.provenance.origin,`${x.provenance.qualityScore}%`,x.provenance.methodology])}/></PageCard>
      <PageCard title="Evidence Graph" subtitle={`Graphe de dépendances inter-domaines · densité ${overview.graph.density}%`}><div className="tagCloud">{overview.graph.nodes.map(n=><Pill key={n.id} tone={n.quality>=75?"up":n.quality<60?"warn":"neutral"}>{n.kind} · {n.score}/100 · Q{n.quality}</Pill>)}</div><DataTable headers={["Origine","Relation","Cible","Force"]} rows={overview.graph.edges.map(e=>[e.from,e.relation,e.to,`${e.strength}%`])}/></PageCard>
      <PageCard title="Pipeline d'orchestration" subtitle="État observable de chaque étape du raisonnement TER." ><DataTable headers={["Étape","État","Latence","Dépendances"]} rows={overview.pipeline.map(p=>[p.stage,<Pill tone={p.status==="READY"?"up":p.status==="DEGRADED"?"warn":"down"}>{p.status}</Pill>,`${p.latencyMs} ms`,String(p.dependencies)])}/></PageCard>
      <PageCard title="Scénarios conditionnels"><div className="scenarioGrid">{overview.scenarios.map(s=><div className="scenarioCard" key={s.id}><strong>{s.name}</strong><b>{s.probability}%</b><span>{s.trigger}</span><small>{s.impact ?? "Lecture conditionnelle"}</small></div>)}</div></PageCard>
      {overview.warnings.map(w=><p className="warning" key={w}>{w}</p>)}
    </> : <PageCard title="Intelligence Core"><p className="muted">Calcul de l'orchestration v3.6…</p></PageCard>}
  </>;
}

function SettingsPage() { return <><PageHeader icon={<Settings/>} title="Paramètres" subtitle="Configuration de l'interface et des connecteurs TER."/><div className="pageGrid"><PageCard title="Fournisseurs"><div className="settingRow"><span>Twelve Data</span><Pill>Clé serveur uniquement</Pill></div><div className="settingRow"><span>Binance</span><Pill tone="up">Public · Crypto</Pill></div><div className="settingRow"><span>Frankfurter</span><Pill tone="up">Référence FX</Pill></div></PageCard><PageCard title="Sécurité"><div className="settingRow"><span>Paper Trading</span><Pill tone="up">Activé</Pill></div><div className="settingRow"><span>Exécution réelle</span><Pill>Non activée</Pill></div><p className="muted">TER reste un système d'analyse et de simulation. Les clés API sensibles doivent rester côté serveur.</p></PageCard></div></> }

function PageCompleteness({ route }: { route: RouteKey }) {
  const map: Record<RouteKey, string[]> = {
    dashboard: ["Vue globale", "Signaux actifs", "Performance", "Santé moteur"], intelligence: ["Provenance", "Confiance", "Contradictions", "Scénarios", "Decision Frame"], notifications: ["Flux d'alertes", "États lu/non lu", "Méthode de déduplication"], institutional: ["Facteurs cross-asset", "Anomalies", "Couverture", "Watchlist"], watchlist: ["Ajout/retrait", "Prix live", "Provenance"], alerts: ["Règles classiques", "Automation", "Cooldown", "Déclenchements"], research: ["Recherche symbole", "Historique", "Facteurs", "Rapport exportable"], asset: ["Marché", "Technique", "Fondamentaux", "Macro", "News", "IA", "Risques"], markets: ["Univers", "Prix", "Variation", "Qualité", "Latence"], signals: ["Direction", "Score", "Confiance", "Confluence", "Traçabilité"], analysis: ["Scénarios", "Probabilités", "Incertitude", "Calibration"], portfolio: ["Capital", "Liquidités", "Positions", "Trades"], risk: ["Exposition", "Volatilité", "VaR", "Corrélations"], optimizer: ["Méthode", "Poids actuels", "Poids cibles", "Contraintes"], stress: ["Scénarios", "P&L", "Impact", "Vulnérabilités"], macro: ["Régime", "Facteurs", "Rotation", "Confiance"], events: ["Calendrier", "Importance", "Classes affectées", "Avertissements"], news: ["NLP", "Sentiment", "Entités", "Urgence"], fundamentals: ["Croissance", "Rentabilité", "Bilan", "Valorisation"], journal: ["Historique", "Résolution", "Outcome"], social: ["Profils", "Échantillons", "Consistance"], ai: ["Analystes", "Ensemble", "Accord", "Incertitude"], backtest: ["Trades", "Walk-forward", "Monte Carlo", "Régimes"], data: ["Provenance", "Freshness", "Latence", "Cache"], settings: ["Fournisseurs", "Sécurité", "Mode simulation"], workflow: ["Déclencheurs", "Conditions ALL/ANY", "Scénarios", "Journal", "Notifications", "Simulation"]
  };
  return <PageCard title="Périmètre opérationnel" subtitle="Éléments couverts par cette rubrique dans le noyau évolutif TER v3.6."><div className="tagCloud">{(map[route] ?? []).map(x=><Pill key={x} tone="up">✓ {x}</Pill>)}</div><p className="muted" style={{marginBottom:0}}>Les données synthétiques sont toujours distinguées des données live. Les scénarios et alertes restent analytiques et ne déclenchent aucune exécution réelle.</p></PageCard>;
}

function App() {
  const [assets, setAssets] = useState<MarketAsset[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, IndicatorSnapshot>>({});
  const [selected, setSelected] = useState<Signal | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [report, setReport] = useState<BacktestReport | null>(null);
  const [walkForwardFolds, setWalkForwardFolds] = useState<BacktestReport[]>([]);
  const [monteCarlo, setMonteCarlo] = useState<ReturnType<typeof monteCarloSimulation> | null>(null);
  const [regimeReport, setRegimeReport] = useState<RegimeValidationReport | null>(null);
  const [killSwitch, setKillSwitch] = useState<KillSwitchState | null>(null);
  const [engineStatus, setEngineStatus] = useState<{ lastRefreshAt: string | null; refreshing: boolean; successCount: number; failureCount: number } | null>(null);
  const [calibration, setCalibration] = useState<CalibrationReport | null>(null);
  const [portfolioRisk, setPortfolioRisk] = useState<PortfolioRiskReport | null>(null);
  const [optimization, setOptimization] = useState<PortfolioOptimizationReport | null>(null);
  const [stressReport, setStressReport] = useState<any>(null);
  const [institutionalReport, setInstitutionalReport] = useState<any>(null);
  const [macroReport, setMacroReport] = useState<any>(null);
  const [eventReport, setEventReport] = useState<any>(null);
  const [nlpReport, setNlpReport] = useState<any>(null);
  const [fundamentalReport, setFundamentalReport] = useState<any>(null);
  const [assetIntelligence, setAssetIntelligence] = useState<any>(null);
  const [intelligenceOverview, setIntelligenceOverview] = useState<IntelligenceOverviewResponse | null>(null);
  const [route, setRoute] = useState<RouteKey>(routeFromHash());
  const [researchSymbol, setResearchSymbol] = useState<string>(assets[0]?.symbol ?? "");
  useEffect(() => { if (route === "research") { const parts = window.location.hash.replace(/^#\/?/, "").split("/"); if (parts[1]) setResearchSymbol(decodeURIComponent(parts[1]).toUpperCase()); } }, [route]);

  const [paperAccount, setPaperAccount] = useState<PaperAccount | null>(null);
  const [paperKillSwitch, setPaperKillSwitch] = useState<KillSwitchState | null>(null);
  const [paperError, setPaperError] = useState<string | null>(null);
  const [paperBusy, setPaperBusy] = useState<string | null>(null); // symbol currently being opened/closed, or "reset"

  useEffect(() => { const onHash = () => setRoute(routeFromHash()); window.addEventListener("hashchange", onHash); return () => window.removeEventListener("hashchange", onHash); }, []);
  const navigate = (next: RouteKey) => { window.location.hash = `/${next}`; setRoute(next); };
  const openAsset = (symbol: string) => { window.location.hash = `/asset/${encodeURIComponent(symbol)}`; setRoute("asset"); };

  useEffect(() => {
    let cancelled = false;
    if (!selected) { setCalibration(null); return; }
    getCalibration(selected.symbol).then(result => { if (!cancelled && result.ok) setCalibration(result.data); });
    return () => { cancelled = true; };
  }, [selected]);

  useEffect(() => {
    if (route !== "asset") return;
    const parts = window.location.hash.replace(/^#\/?/, "").split("/");
    const symbol = parts[1] ? decodeURIComponent(parts[1]).toUpperCase() : "";
    if (!symbol) { setAssetIntelligence(null); return; }
    let cancelled = false;
    setAssetIntelligence(null);
    getAssetIntelligence(symbol).then(r => { if (!cancelled && r.ok) setAssetIntelligence(r.data); });
    return () => { cancelled = true; };
  }, [route]);

  async function refreshPaperAccount() {
    const result = await getPaperAccount();
    if (result.ok) {
      setPaperAccount(result.data.account);
      setPaperKillSwitch(result.data.killSwitch);
      setPaperError(null);
    } else {
      setPaperError(result.error);
    }
  }

  async function handleOpenPaper(symbol: string) {
    setPaperBusy(symbol);
    const result = await openPaperPosition(symbol);
    if (result.ok) {
      setPaperAccount(result.data.account);
      setPaperError(result.data.opened ? null : result.data.reason);
      getPortfolioRisk().then(r => { if (r.ok) setPortfolioRisk(r.data); });
      getPortfolioOptimization().then(r => { if (r.ok) setOptimization(r.data); });
    } else {
      setPaperError(result.error);
    }
    setPaperBusy(null);
  }

  async function handleClosePaper(symbol: string) {
    setPaperBusy(symbol);
    const result = await closePaperPosition(symbol);
    if (result.ok) {
      setPaperAccount(result.data.account);
      setPaperKillSwitch(result.data.killSwitch);
      setPaperError(null);
      getPortfolioRisk().then(r => { if (r.ok) setPortfolioRisk(r.data); });
      getPortfolioOptimization().then(r => { if (r.ok) setOptimization(r.data); });
    } else {
      setPaperError(result.error);
    }
    setPaperBusy(null);
  }

  async function handleResetKillSwitch() {
    setPaperBusy("reset");
    const result = await resetKillSwitch();
    if (result.ok) setPaperKillSwitch(result.data.killSwitch);
    else setPaperError(result.error);
    setPaperBusy(null);
  }

  useEffect(() => {
    let cancelled = false;
    async function loadMarkets() {
      const data = await getMarkets();
      if (cancelled) return;

      setAssets(data);
      setResearchSymbol(current => current || data[0]?.symbol || "");
      const historyEntries = await Promise.all(data.map(async asset => [asset.symbol, await getHistory(asset)] as const));
      const historyBySymbol: Record<string, OHLCVBar[]> = Object.fromEntries(historyEntries);

      const nextSnapshots: Record<string, IndicatorSnapshot> = {};
      for (const asset of data) {
        const snapshot = computeSnapshot(historyBySymbol[asset.symbol], asset.assetClass, "1D");
        if (snapshot) nextSnapshots[asset.symbol] = snapshot;
      }
      setSnapshots(nextSnapshots);

      const apiSignals = await getSignals();
      if (apiSignals.ok) setSignals(rankSignals(apiSignals.data));
      else setSignals(rankSignals(generateSignals(data, demoTraders, historyBySymbol)));

      // Run the backtest / walk-forward / Monte Carlo pipeline on the first
      // asset's history as a representative demo sample.
      const sampleBars = historyBySymbol[data[0]?.symbol];
      if (sampleBars) {
        const trades = demoTrades(sampleBars);
        setReport(backtest(trades));
        const { perFold } = runWalkForward(sampleBars, (train, test) => demoTrades([...train, ...test].slice(train.length - 55)));
        setWalkForwardFolds(perFold);
        setMonteCarlo(monteCarloSimulation(trades, undefined, 500));
        if (data[0]) {
          const regimeResult = validateByRegime(sampleBars, data[0].assetClass, "1D", undefined, data[0].symbol);
          setRegimeReport(regimeResult);
        }

        let state = createKillSwitchState(10000);
        for (const t of trades) {
          const pnl = t.direction === "LONG" ? t.exit - t.entry : t.entry - t.exit;
          state = recordTradeResult(state, pnl, { maxDrawdownPercent: 10, maxConsecutiveLosses: 5 });
        }
        setKillSwitch(state);
      }
    }
    loadMarkets();
    const timer = window.setInterval(loadMarkets, 60_000);
    const statusTimer = window.setInterval(async () => {
      try {
        const r = await fetch("/api/engine/status");
        if (r.ok && !cancelled) setEngineStatus(await r.json());
      } catch {}
    }, 10_000);
    refreshPaperAccount();
    getPortfolioRisk().then(r => { if (!cancelled && r.ok) setPortfolioRisk(r.data); });
    getPortfolioOptimization().then(r => { if (!cancelled && r.ok) setOptimization(r.data); });
    fetch("/api/risk/stress").then(r => r.ok ? r.json() : null).then(r => { if (!cancelled && r) setStressReport(r); }).catch(() => {});
    fetch("/api/macro/regime").then(r => r.ok ? r.json() : null).then(r => { if (!cancelled && r) setMacroReport(r); }).catch(() => {});
    fetch("/api/news/intelligence").then(r => r.ok ? r.json() : null).then(r => { if (!cancelled && r) setEventReport(r); }).catch(() => {});
    fetch("/api/news/nlp").then(r => r.ok ? r.json() : null).then(r => { if (!cancelled && r) setNlpReport(r); }).catch(() => {});
    fetch("/api/fundamentals").then(r => r.ok ? r.json() : null).then(r => { if (!cancelled && r) setFundamentalReport(r); }).catch(() => {});
    fetch("/api/institutional/overview").then(r => r.ok ? r.json() : null).then(r => { if (!cancelled && r) setInstitutionalReport(r); }).catch(() => {});
    getIntelligenceOverview().then(r => { if (!cancelled && r.ok) setIntelligenceOverview(r.data); });
    const riskTimer = window.setInterval(() => { getPortfolioRisk().then(r => { if (!cancelled && r.ok) setPortfolioRisk(r.data); }); fetch("/api/risk/stress").then(r => r.ok ? r.json() : null).then(r => { if (!cancelled && r) setStressReport(r); }).catch(() => {}); fetch("/api/macro/regime").then(r => r.ok ? r.json() : null).then(r => { if (!cancelled && r) setMacroReport(r); }).catch(() => {}); fetch("/api/news/intelligence").then(r => r.ok ? r.json() : null).then(r => { if (!cancelled && r) setEventReport(r); }).catch(() => {}); fetch("/api/news/nlp").then(r => r.ok ? r.json() : null).then(r => { if (!cancelled && r) setNlpReport(r); }).catch(() => {});
    fetch("/api/fundamentals").then(r => r.ok ? r.json() : null).then(r => { if (!cancelled && r) setFundamentalReport(r); }).catch(() => {}); fetch("/api/institutional/overview").then(r => r.ok ? r.json() : null).then(r => { if (!cancelled && r) setInstitutionalReport(r); }).catch(() => {});
    getIntelligenceOverview().then(r => { if (!cancelled && r.ok) setIntelligenceOverview(r.data); }); }, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); window.clearInterval(statusTimer); window.clearInterval(riskTimer); };
  }, []);

  const visible = useMemo(
    () => filter === "ALL" ? signals : signals.filter(s => s.direction === filter),
    [signals, filter]
  );

  const best = visible[0];

  if (route !== "dashboard") {
    const page = route === "intelligence" ? <IntelligencePage overview={intelligenceOverview} />
      : route === "research" ? <ResearchPage assets={assets} selectedSymbol={researchSymbol} onSelect={symbol => { setResearchSymbol(symbol); window.location.hash = `/research/${encodeURIComponent(symbol)}`; setRoute("research"); }} />
      : route === "asset" ? <UnifiedAssetPage report={assetIntelligence} onBack={() => navigate("markets")} />
      : route === "markets" ? <MarketsPage assets={assets} onSelect={a => openAsset(a.symbol)} />
      : route === "signals" ? <SignalsPage signals={signals} setSelected={setSelected} />
      : route === "analysis" ? <AnalysisPage signals={signals} calibration={calibration} />
      : route === "notifications" ? <NotificationsPage />
      : route === "institutional" ? <InstitutionalPage report={institutionalReport} />
      : route === "watchlist" ? <WatchlistPage assets={assets} />
      : route === "alerts" ? <AlertsPage />
      : route === "portfolio" ? <PortfolioPage account={paperAccount} risk={portfolioRisk} />
      : route === "risk" ? <RiskPage risk={portfolioRisk} />
      : route === "optimizer" ? <OptimizerPage optimization={optimization} />
      : route === "stress" ? <StressPage report={stressReport} />
      : route === "macro" ? <MacroPage report={macroReport} />
      : route === "events" ? <EventsPage report={eventReport} />
      : route === "news" ? <NewsPage nlp={nlpReport} />
      : route === "fundamentals" ? <FundamentalsPage report={fundamentalReport} />
      : route === "journal" ? <JournalPage />
      : route === "ai" ? <AIPage signals={signals} />
      : route === "backtest" ? <BacktestPage report={report} folds={walkForwardFolds} />
      : route === "social" ? <SocialPage />
      : route === "data" ? <DataPage assets={assets} engineStatus={engineStatus} />
      : route === "workflow" ? <WorkflowPage />
      : <SettingsPage />;
    return <div className="app appShell"><Sidebar route={route} navigate={navigate}/><div className="contentArea"><header className="topbar"><div><div className="brand"><Radar size={24}/> TER</div><div className="subtitle">Terminal d'Exploration des Risques · Market Intelligence</div></div><div className="status"><span className="dot"/> ENGINE ONLINE</div></header><div className="engineHealth"><span className="dot"/> REAL-TIME ENGINE · 60s<span>{engineStatus?.lastRefreshAt ? `Dernière mise à jour ${new Date(engineStatus.lastRefreshAt).toLocaleTimeString()}` : "Initialisation…"}</span></div><main className="pageMain"><PageCompleteness route={route}/>{page}</main></div></div>;
  }

  return (
    <div className="app dashboardApp">
      <Sidebar route={route} navigate={navigate}/>
      <div className="dashboardContent">
      <header className="topbar">
        <div>
          <div className="brand"><Radar size={24} /> TER</div>
          <div className="subtitle">Terminal d'Exploration des Risques · Market Intelligence</div>
        </div>
        <div className="status"><span className="dot" /> ENGINE ONLINE</div>
      </header>

      <div className="engineHealth">
        <span className="dot" /> REAL-TIME ENGINE · refresh 60s
        <span>{engineStatus?.lastRefreshAt ? `Dernière mise à jour ${new Date(engineStatus.lastRefreshAt).toLocaleTimeString()}` : "Initialisation…"}</span>
        {engineStatus && <span>{engineStatus.failureCount} échec(s) fournisseur</span>}
      </div>

      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">GLOBAL MARKET SCANNER</p>
            <h1>Transformer le bruit des marchés en <span>confluence mesurable.</span></h1>
            <p className="lead">TER surveille les marchés, les informations publiques, les signaux techniques et les stratégies publiées afin de produire des scénarios probabilistes avec gestion du risque.</p>
          </div>
          <div className="heroCard">
            <Globe2 size={22} />
            <strong>{assets.length}</strong>
            <span>marchés suivis dans la démo</span>
          </div>
        </section>

        <section className="metrics">
          <Metric icon={<Zap />} label="Signaux actifs" value={String(signals.length)} />
          <Metric icon={<Activity />} label="Score moyen" value={`${Math.round(signals.reduce((a,s)=>a+s.score,0)/(signals.length||1))}/100`} />
          <Metric icon={<Users />} label="Profils évalués" value={String(demoTraders.length)} />
          <Metric icon={<ShieldCheck />} label="Risque" value="Contrôlé" />
        </section>

        <div className="grid">
          <section className="panel wide">
            <div className="panelHead">
              <div>
                <h2>Radar de signaux</h2>
                <p>Les scores ne sont pas des certitudes.</p>
              </div>
              <div className="filters">
                {["ALL","LONG","SHORT","WATCH"].map(x => (
                  <button className={filter===x ? "active" : ""} onClick={() => setFilter(x)} key={x}>{x}</button>
                ))}
              </div>
            </div>
            <div className="signalList">
              {visible.map(s => (
                <button className={`signal ${s.direction.toLowerCase()}`} key={s.id} onClick={() => setSelected(s)}>
                  <div className="signalMain">
                    <strong>{s.symbol}</strong>
                    <span>{s.market} · {s.timeframe}</span>
                  </div>
                  <div className="direction">{s.direction}</div>
                  <div className="score"><b>{s.score}</b><small>score</small></div>
                  <div className="confidence">{s.confidence}% {s.intelligence ? `· ${s.intelligence.confluence}` : ""}</div>
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panelHead"><h2>Performance engine</h2><BrainCircuit /></div>
            {report ? (
              <>
                <div className="detailGrid">
                  <Stat label="Trades (échantillon)" value={String(report.trades)} />
                  <Stat label="Win rate" value={`${report.winRate.toFixed(1)}%`} />
                  <Stat label="Expectancy" value={report.expectancy.toFixed(3)} />
                  <Stat label="Profit factor" value={report.profitFactor !== null ? report.profitFactor.toFixed(2) : "∞ (aucune perte)"} />
                  <Stat label="Max drawdown" value={report.maxDrawdown.toFixed(2)} />
                  <Stat label="Sharpe" value={report.sharpe.toFixed(2)} />
                  <Stat label="Sortino" value={report.sortino.toFixed(2)} />
                  <Stat label="Calmar" value={report.calmar !== null ? report.calmar.toFixed(2) : "∞ (drawdown nul)"} />
                  <Stat label="Frais payés" value={report.feesPaid.toFixed(2)} />
                  <Stat label="Coût slippage" value={report.slippageCost.toFixed(2)} />
                </div>
                {walkForwardFolds.length > 0 && (
                  <>
                    <h3>Walk-forward (hors-échantillon, {walkForwardFolds.length} folds)</h3>
                    <ul className="foldList">
                      {walkForwardFolds.map((f, i) => (
                        <li key={i}>Fold {i + 1} — {f.trades} trades, win rate {f.winRate.toFixed(0)}%, Sharpe {f.sharpe.toFixed(2)}</li>
                      ))}
                    </ul>
                  </>
                )}
                {monteCarlo && (
                  <>
                    <h3>Monte Carlo ({monteCarlo.iterations} tirages, ré-échantillonnage des trades)</h3>
                    <p className="muted">Équity finale — p5 {monteCarlo.finalEquity.p5.toFixed(2)} · médiane {monteCarlo.finalEquity.p50.toFixed(2)} · p95 {monteCarlo.finalEquity.p95.toFixed(2)}</p>
                    <p className="muted">Max drawdown — p5 {monteCarlo.maxDrawdown.p5.toFixed(2)} · médiane {monteCarlo.maxDrawdown.p50.toFixed(2)} · p95 {monteCarlo.maxDrawdown.p95.toFixed(2)}</p>
                  </>
                )}
                {regimeReport && (
                  <div className="regimeValidation">
                    <div className="subPanelHead">
                      <div>
                        <h3>Validation par régime</h3>
                        <span>{regimeReport.strategy} · {regimeReport.symbol}</span>
                      </div>
                      <small>{regimeReport.trades} trades adaptatifs</small>
                    </div>
                    <div className="regimeGrid">
                      {regimeReport.regimes.map(row => (
                        <div className="regimeCard" key={row.regime}>
                          <div className="regimeTitle"><strong>{row.regime}</strong><span>{row.bars} barres</span></div>
                          <div className="regimeStats">
                            <span>Trades <b>{row.report.trades}</b></span>
                            <span>Win rate <b>{row.report.winRate.toFixed(1)}%</b></span>
                            <span>Expectancy <b>{row.report.expectancy.toFixed(3)}</b></span>
                            <span>DD max <b>{row.report.maxDrawdown.toFixed(2)}</b></span>
                            <span>Sharpe <b>{row.report.sharpe.toFixed(2)}</b></span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="muted">Chaque régime est évalué séparément sur l'historique disponible. Les résultats historiques ne garantissent pas les performances futures.</p>
                  </div>
                )}
                {killSwitch && (
                  <p className={killSwitch.tripped ? "warning" : "muted"}>
                    Kill switch : {killSwitch.tripped ? `DÉCLENCHÉ (${killSwitch.trippedReason})` : "actif, aucune limite franchie"}
                  </p>
                )}
              </>
            ) : (
              <p className="muted">Calcul du backtest en cours…</p>
            )}
            <p className="muted">Stratégie de démonstration (croisement EMA20/EMA50) utilisée uniquement pour exercer le moteur de backtest / walk-forward / Monte Carlo — à remplacer par la logique réelle de génération de trades une fois un fournisseur de données licencié connecté.</p>
          </section>

          <section className="panel">
            <div className="panelHead">
              <h2>Paper Trading</h2>
              {paperKillSwitch && (
                <span className={paperKillSwitch.tripped ? "badge tripped" : "badge ok"}>
                  {paperKillSwitch.tripped ? "KILL SWITCH ACTIF" : "risque OK"}
                </span>
              )}
            </div>

            {!paperAccount && !paperError && <p className="muted">Connexion à l'API…</p>}

            {paperError && !paperAccount && (
              <p className="muted">API injoignable ({paperError}). Démarrer le serveur avec <code>cd server && npm run dev</code> pour activer le paper trading.</p>
            )}

            {paperAccount && (
              <>
                <div className="detailGrid">
                  <Stat label="Capital initial" value={paperAccount.startingEquity.toLocaleString("en-US")} />
                  <Stat label="Liquidités" value={paperAccount.cash.toLocaleString("en-US", { maximumFractionDigits: 2 })} />
                  <Stat label="Positions ouvertes" value={String(paperAccount.positions.length)} />
                  <Stat label="Trades clôturés" value={String(paperAccount.closedTrades.length)} />
                </div>

                {paperKillSwitch?.tripped && (
                  <p className="warning">
                    Kill switch déclenché : {paperKillSwitch.trippedReason}. Aucune nouvelle position ne peut être ouverte tant qu'il n'est pas réarmé manuellement.
                    <br />
                    <button className="smallBtn" disabled={paperBusy === "reset"} onClick={handleResetKillSwitch}>
                      {paperBusy === "reset" ? "…" : "Réarmer le kill switch"}
                    </button>
                  </p>
                )}

                {paperAccount.positions.length > 0 && (
                  <>
                    <h3>Positions ouvertes</h3>
                    <ul className="foldList">
                      {paperAccount.positions.map(p => (
                        <li key={p.id} className="positionRow">
                          <span><b>{p.symbol}</b> {p.direction} · entrée {p.entry.toFixed(2)} · taille {p.size.toFixed(4)}</span>
                          <button className="smallBtn" disabled={paperBusy === p.symbol} onClick={() => handleClosePaper(p.symbol)}>
                            {paperBusy === p.symbol ? "…" : "Fermer"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {paperAccount.closedTrades.length > 0 && (
                  <>
                    <h3>Derniers trades clôturés</h3>
                    <ul className="foldList">
                      {[...paperAccount.closedTrades].slice(-5).reverse().map(t => (
                        <li key={t.id}>
                          <span className={t.pnl >= 0 ? "up" : "down"}>{t.symbol} {t.direction} — PnL {t.pnl >= 0 ? "+" : ""}{t.pnl.toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {paperError && <p className="muted">{paperError}</p>}
                <p className="muted">Compte partagé de démonstration, dimensionnement et kill switch identiques à la logique réelle. Positions ouvertes en mémoire côté serveur (perdues à son redémarrage).</p>
              </>
            )}
          </section>

          <section className="panel wide">
            <div className="panelHead"><div><h2>Risk & Portfolio Intelligence</h2><p>Exposition, concentration, corrélations et stress tests du compte paper.</p></div><ShieldCheck /></div>
            {portfolioRisk ? (
              <>
                <div className="detailGrid">
                  <Stat label="Exposition brute" value={`${portfolioRisk.exposurePercent.toFixed(1)}%`} />
                  <Stat label="Exposition nette" value={`${portfolioRisk.equity ? (portfolioRisk.netExposure / portfolioRisk.equity * 100).toFixed(1) : "0.0"}%`} />
                  <Stat label="Concentration max" value={`${portfolioRisk.concentrationPercent.toFixed(1)}%`} />
                  <Stat label="Volatilité/j" value={`${portfolioRisk.portfolioVolatilityPercent.toFixed(2)}%`} />
                  <Stat label="VaR 95% / jour" value={`${portfolioRisk.estimatedDailyVaRPercent.toFixed(2)}%`} />
                  <Stat label="Positions" value={String(portfolioRisk.openPositions)} />
                </div>
                {portfolioRisk.byAssetClass.length > 0 && <div className="riskRows">{portfolioRisk.byAssetClass.map(x => <div key={x.assetClass}><span>{x.assetClass}</span><b>{x.percent.toFixed(1)}%</b><small>{x.notional.toLocaleString("en-US", { maximumFractionDigits: 0 })}</small></div>)}</div>}
                {portfolioRisk.correlations.filter(c => c.a !== c.b).length > 0 && <><h3>Corrélations observées</h3><div className="correlationGrid">{portfolioRisk.correlations.filter(c => c.a !== c.b).map(c => <span key={`${c.a}-${c.b}`}><b>{c.a}/{c.b}</b> {c.value.toFixed(2)}</span>)}</div></>}
                <h3>Stress tests</h3>
                {portfolioRisk.stress.map(x => <div className="stressRow" key={x.name}><span>{x.name}</span><b className={x.pnlAmount >= 0 ? "up" : "down"}>{x.pnlAmount >= 0 ? "+" : ""}{x.pnlAmount.toFixed(2)}</b></div>)}
                {portfolioRisk.warnings.map(w => <p className="warning" key={w}>{w}</p>)}
                <p className="muted">VaR et stress tests sont des estimations statistiques basées sur les historiques disponibles ; ils ne constituent pas une perte maximale garantie.</p>
              </>
            ) : <p className="muted">Calcul du risque portefeuille…</p>}
          </section>

          <section className="panel wide">
            <div className="panelHead"><div><h2>Historical Stress & Scenario Engine</h2><p>Chocs déterministes par classe d'actifs et lecture de la vulnérabilité du portefeuille.</p></div><ShieldCheck /></div>
            {stressReport ? (
              <>
                <div className="detailGrid">
                  <Stat label="Scénario le plus défavorable" value={stressReport.worstScenario ?? "—"} />
                  <Stat label="P&L stress max" value={`${stressReport.worstPnlAmount >= 0 ? "+" : ""}${Number(stressReport.worstPnlAmount).toFixed(2)}`} />
                  <Stat label="Récupération indicative" value={stressReport.recoveryDaysEstimate == null ? "—" : `~${stressReport.recoveryDaysEstimate} j`} />
                  <Stat label="Move historique" value={`${Number(stressReport.historicalWorstMove?.pnlPercent ?? 0).toFixed(2)}%`} />
                </div>
                <div className="stressGrid">
                  {stressReport.scenarios.map((x:any) => <div className="stressCard" key={x.scenario}><strong>{x.name}</strong><b className={x.pnlAmount >= 0 ? "up" : "down"}>{x.pnlAmount >= 0 ? "+" : ""}{Number(x.pnlAmount).toFixed(2)}</b><span>{Number(x.pnlPercent).toFixed(2)}% · {x.shockedPositions} position(s)</span></div>)}
                </div>
                {stressReport.warnings.map((w:string) => <p className="warning" key={w}>{w}</p>)}
                <p className="muted">Les chocs sont des hypothèses de stress, pas des prévisions. L'estimation de récupération suppose une volatilité stable et ne constitue pas une garantie.</p>
              </>
            ) : <p className="muted">Calcul des scénarios…</p>}
          </section>

          <section className="panel wide eventNewsPanel">
            <div className="panelHead"><div><h2>Event & News Intelligence</h2><p>Événements à venir, sentiment, impact potentiel et divergences avec le régime macro.</p></div><CalendarDays /></div>
            {eventReport ? (
              <>
                <div className="detailGrid">
                  <Stat label="Événements suivis" value={String(eventReport.events?.length ?? 0)} />
                  <Stat label="News analysées" value={String(eventReport.news?.length ?? 0)} />
                  <Stat label="Alertes régime" value={String(eventReport.regimeAlerts?.length ?? 0)} />
                  <Stat label="Dernière analyse" value={new Date(eventReport.generatedAt).toLocaleTimeString()} />
                </div>
                <div className="eventColumns">
                  <div><h3>Événements</h3><div className="eventList">
                    {eventReport.events.slice(0,5).map((e:any) => <div className="eventItem" key={e.id}><div><b>{new Date(e.scheduledAt).toLocaleDateString()}</b><span>{e.region} · {e.category}</span></div><p>{e.title}</p><em className={e.importance.toLowerCase()}>{e.importance}</em></div>)}
                  </div></div>
                  <div><h3>News à plus fort impact</h3><div className="newsList">
                    {eventReport.news.slice(0,5).map((n:any) => <div className="newsItem" key={n.id}><div className="newsTop"><b>{n.sentimentLabel}</b><span>{n.source}</span><em className={n.impact.toLowerCase()}>{n.impact}</em></div><p>{n.title}</p><small>Sentiment {n.sentimentScore > 0 ? "+" : ""}{n.sentimentScore.toFixed(2)} · confiance {n.confidence}% · {n.symbols.join(", ") || "marché global"}</small></div>)}
                  </div></div>
                </div>
                {eventReport.regimeAlerts?.map((w:string) => <p className="warning" key={w}>{w}</p>)}
                {eventReport.warnings?.map((w:string) => <p className="muted" key={w}>{w}</p>)}
              </>
            ) : <p className="muted">Analyse des événements et news…</p>}
          </section>

          <section className="panel">
            <div className="panelHead"><h2>Social Intelligence</h2><Users /></div>
            {rankTraders(demoTraders).map(t => (
              <div className="trader" key={t.handle}>
                <div><strong>{t.handle}</strong><span>{t.platform} · {t.strategy}</span></div>
                <div className="traderStats"><b>{t.winRate}%</b><span>WR</span><b>{t.consistency}</b><span>CONS.</span></div>
              </div>
            ))}
            <p className="muted">TER doit utiliser des données publiques et respecter les conditions des plateformes. Les performances passées ne prouvent pas les performances futures.</p>
          </section>

          <section className="panel">
            <div className="panelHead"><div><h2>AI Lab · Ensemble</h2><p>Fusion locale de plusieurs analystes spécialisés, avec incertitude explicite.</p></div><BrainCircuit /></div>
            {aiModels.map(m => <div className="aiRow" key={m.name}>
              <div><strong>{m.name}</strong><span>{m.specialty}</span></div>
              <em className={m.status}>{m.status === "active" ? "ACTIF" : "CONNECTEUR"}</em>
            </div>)}
          </section>

          <section className="panel wide">
            <div className="panelHead"><h2>Univers global</h2><span>{assets.length} actifs</span></div>
            <div className="assetGrid">
              {assets.map(a => <button className="asset" key={a.symbol} onClick={() => openAsset(a.symbol)}>
                <strong>{a.symbol}</strong><span>{a.name}</span><b>{a.price.toLocaleString("en-US")}</b><small className={a.dataSource === "live" ? "dataLive" : "dataSynthetic"}>{a.dataSource === "live" ? `LIVE · ${a.provider ?? "provider"}` : "SYNTHÉTIQUE"}</small>
                <em className={a.change24h >= 0 ? "up" : "down"}>{a.change24h >= 0 ? "+" : ""}{a.change24h}%</em>
              </button>)}
            </div>
          </section>
        </div>

        <section className="panel wide adaptivePanel">
          <div className="panelHead">
            <div>
              <h2>Oscillateurs adaptatifs</h2>
              <p>Paramètres ajustés à la classe d'actif, au timeframe et au régime détecté.</p>
            </div>
            <Activity />
          </div>
          <div className="adaptiveGrid">
            {assets.map(asset => {
              const s = snapshots[asset.symbol];
              if (!s) return null;
              return (
                <div className="adaptiveCard" key={asset.symbol}>
                  <div className="adaptiveTop"><strong>{asset.symbol}</strong><span>{s.regime}</span></div><small className={asset.dataQuality === "FRESH" ? "dataLive" : "dataSynthetic"}>{asset.dataSource === "live" ? `Données live · ${asset.provider ?? "provider"}` : "Données synthétiques"} · {asset.dataQuality ?? "UNKNOWN"} · {asset.dataQualityScore ?? "—"}/100</small>
                  <div className="adaptiveMode">Mode : <b>{s.oscillatorMode === "MEAN_REVERSION" ? "Mean Reversion" : s.oscillatorMode === "VOLATILITY" ? "Volatilité" : "Trend Following"}</b></div>
                  <div className="adaptiveStats">
                    <span>RSI <b>{s.rsi.toFixed(1)}</b></span>
                    <span>Stoch <b>{s.stochasticK.toFixed(1)}</b></span>
                    <span>CCI <b>{s.cci.toFixed(0)}</b></span>
                    <span>ADX <b>{s.adx.toFixed(1)}</b></span>
                  </div>
                  <small>RSI {s.profile.rsiOversold}/{s.profile.rsiOverbought} · ATR {(s.atrPct * 100).toFixed(2)}% · BB σ {s.profile.bollingerStd}</small>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {selected && <div className="modalBackdrop" onClick={() => setSelected(null)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modalTop"><div><span className="eyebrow">{selected.market}</span><h2>{selected.symbol} · {selected.direction}</h2></div><button onClick={() => setSelected(null)}>×</button></div>
          <div className="detailGrid">
            <Stat label="Score" value={`${selected.score}/100`} />
            <Stat label="Confiance" value={`${selected.confidence}%`} />
            <Stat label="Entrée indicative" value={selected.entry.toLocaleString("en-US")} />
            <Stat label="Stop" value={selected.stop.toLocaleString("en-US")} />
            <Stat label="Objectif" value={selected.targets[0].toLocaleString("en-US")} />
            <Stat label="R/R" value={`${selected.riskReward}:1`} />
          </div>
          <h3>Intelligence de signal</h3>
          {selected.intelligence ? (
            <div className="intelligenceBox">
              <div className="detailGrid">
                <Stat label="Confluence" value={`${selected.intelligence.confluence} · ${selected.intelligence.confluenceScore}/100`} />
                <Stat label="Divergences RSI" value={String(selected.intelligence.divergences.length)} />
                <Stat label="Breakout" value={selected.intelligence.structure.breakout} />
              </div>
              <div className="tfEvidence">
                {selected.intelligence.evidence.map(e => <div key={e.timeframe}><b>{e.timeframe}</b><span>{e.direction} · {e.score}/100 · RSI {e.rsi} · ADX {e.adx}</span></div>)}
              </div>
              {selected.intelligence.divergences.map(d => <p key={`${d.type}-${d.indicator}`} className="muted">{d.type} · {d.indicator} · {d.description}</p>)}
            </div>
          ) : <p className="muted">Analyse détaillée indisponible côté serveur.</p>}
          <h3>Raisons de la confluence</h3>
          <ul>{selected.reasons.map(r => <li key={r}>{r}</li>)}</ul>
          <p className="explain">{ensembleExplanation(selected)}</p>
          {calibration && (
            <div className="aiDecisionBox">
              <div className="detailGrid">
                <Stat label="Calibration" value={calibration.status === "CALIBRATING" ? "EN COURS" : "ÉCHANTILLON COURT"} />
                <Stat label="Observations" value={`${calibration.resolved}/${calibration.sampleSize}`} />
                <Stat label="Brier" value={calibration.brierScore === null ? "—" : calibration.brierScore.toFixed(3)} />
                <Stat label="Log loss" value={calibration.logLoss === null ? "—" : calibration.logLoss.toFixed(3)} />
                <Stat label="Exactitude" value={calibration.accuracy === null ? "—" : `${calibration.accuracy.toFixed(1)}%`} />
                <Stat label="Confiance moyenne" value={calibration.meanConfidence === null ? "—" : `${calibration.meanConfidence.toFixed(1)}%`} />
              </div>
              <p className="muted"><b>Calibration probabiliste :</b> {calibration.note}</p>
              {calibration.reliability.map(b => <div className="aiExpert" key={b.bucket}><b>{b.bucket}</b><span>prévu {b.predicted}% · observé {b.observed}% · écart {b.gap} pt · n={b.count}</span></div>)}
            </div>
          )}

          {selected.aiDecision && (
            <div className="aiDecisionBox">
              <div className="detailGrid">
                <Stat label="Stance ensemble" value={selected.aiDecision.stance} />
                <Stat label="Accord experts" value={selected.aiDecision.agreement} />
                <Stat label="Incertitude" value={`${selected.aiDecision.uncertainty}%`} />
                <Stat label="Prob. haussière" value={`${selected.aiDecision.probability.bullish}%`} />
                <Stat label="Prob. neutre" value={`${selected.aiDecision.probability.neutral}%`} />
                <Stat label="Prob. baissière" value={`${selected.aiDecision.probability.bearish}%`} />
              </div>
              <h4>Avis des experts</h4>
              {selected.aiDecision.experts.map(e => <div className="aiExpert" key={e.name}><b>{e.name}</b><span>{e.stance} · {e.score}/100 · confiance {e.confidence}%</span></div>)}
              <p className="muted"><b>Scénario :</b> {selected.aiDecision.scenario.primary}</p>
              <p className="muted"><b>Invalidation :</b> {selected.aiDecision.scenario.invalidation}</p>
              <p className="muted"><b>Alternatif :</b> {selected.aiDecision.scenario.alternative}</p>
              <p className="warning">{selected.aiDecision.disclaimer}</p>
            </div>
          )}
          {selected.direction !== "WATCH" && (
            <button
              className="smallBtn"
              disabled={paperBusy === selected.symbol || paperKillSwitch?.tripped}
              onClick={() => handleOpenPaper(selected.symbol)}
            >
              {paperBusy === selected.symbol ? "…" : `Ouvrir en paper trading (${selected.direction})`}
            </button>
          )}
          {paperKillSwitch?.tripped && <p className="muted">Kill switch actif — réarmer dans le panneau Paper Trading pour ouvrir de nouvelles positions.</p>}
          <button className="smallBtn" onClick={() => { setSelected(null); openAsset(selected.symbol); }}>Ouvrir la fiche d'intelligence unifiée</button>
          <p className="warning">Mode démonstration : aucune exécution d'ordre. Une version production doit connecter des données licenciées, un moteur de backtest et des contrôles réglementaires.</p>
        </div>
      </div>}
      </div>
    </div>
  );
}

function Metric({icon,label,value}:{icon:ReactNode,label:string,value:string}) {
  return <div className="metric"><span className="metricIcon">{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}
function Stat({label,value}:{label:string,value:string}) { return <div className="stat"><small>{label}</small><strong>{value}</strong></div>; }

export default App;