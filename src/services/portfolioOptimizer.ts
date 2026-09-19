import type { MarketAsset, OHLCVBar } from "../types";
import type { PaperPosition } from "./paperTrading";
import type { PortfolioRiskReport } from "./portfolioRisk";

export type AllocationMethod = "EQUAL_WEIGHT" | "INVERSE_VOL" | "RISK_PARITY_APPROX";
export interface OptimizerPosition { symbol:string; assetClass:string; currentWeight:number; targetWeight:number; deltaWeight:number; currentNotional:number; targetNotional:number; rationale:string; }
export interface PortfolioOptimizationReport {
  generatedAt:string; method:AllocationMethod; capital:number; investableCapital:number;
  maxPositionPercent:number; maxAssetClassPercent:number; grossTargetPercent:number;
  estimatedVolatilityPercent:number; estimatedConcentrationPercent:number;
  positions:OptimizerPosition[]; byAssetClass:{assetClass:string; currentPercent:number; targetPercent:number}[];
  changes:string[]; constraints:string[]; disclaimer:string;
}
function dailyReturns(bars:OHLCVBar[]):number[]{ const s=[...bars].sort((a,b)=>Date.parse(a.ts)-Date.parse(b.ts)); const r:number[]=[]; for(let i=1;i<s.length;i++){const p=s[i-1].close,c=s[i].close;if(p>0&&Number.isFinite(c)&&Number.isFinite(p))r.push(c/p-1);}return r.slice(-120); }
function std(x:number[]){if(x.length<2)return 0;const m=x.reduce((a,b)=>a+b,0)/x.length;return Math.sqrt(x.reduce((a,b)=>a+(b-m)**2,0)/x.length)}
function clamp(x:number,a:number,b:number){return Math.max(a,Math.min(b,x));}
export function optimizePortfolio(assets:MarketAsset[], positions:PaperPosition[], barsBySymbol:Record<string,OHLCVBar[]>, risk:PortfolioRiskReport, method:AllocationMethod="RISK_PARITY_APPROX"):PortfolioOptimizationReport{
  const capital=Math.max(risk.equity,1); const symbols=[...new Set(positions.map(p=>p.symbol))];
  const current=new Map(risk.positions.map(p=>[p.symbol,p.notional/capital]));
  const vols=new Map(symbols.map(s=>[s,Math.max(std(dailyReturns(barsBySymbol[s]??[])),0.005)]));
  const raw=new Map<string,number>();
  for(const s of symbols){ const v=vols.get(s)!; raw.set(s,method==="EQUAL_WEIGHT"?1:1/v); }
  const rawSum=[...raw.values()].reduce((a,b)=>a+b,0)||1;
  const unconstrained=new Map([...raw].map(([s,w])=>[s,w/rawSum]));
  const target=new Map<string,number>();
  for(const s of symbols) target.set(s,clamp(unconstrained.get(s)??0,0,0.25));
  let sum=[...target.values()].reduce((a,b)=>a+b,0);
  if(sum>0){ for(const s of symbols)target.set(s,(target.get(s)!/sum)*Math.min(sum,1)); }
  const byClassCurrent=new Map<string,number>(), byClassTarget=new Map<string,number>();
  for(const s of symbols){const a=assets.find(x=>x.symbol===s);const k=a?.assetClass??"Unknown";byClassCurrent.set(k,(byClassCurrent.get(k)??0)+(current.get(s)??0));byClassTarget.set(k,(byClassTarget.get(k)??0)+(target.get(s)??0));}
  // Cap asset-class exposure at 40%, then renormalize remaining target weights.
  const cappedClass=new Map<string,number>(); for(const [k,w] of byClassTarget)cappedClass.set(k,Math.min(w,0.40));
  const classScale=new Map<string,number>(); for(const [k,w] of byClassTarget)classScale.set(k,w>0?(cappedClass.get(k)!/w):0);
  for(const s of symbols){const k=assets.find(x=>x.symbol===s)?.assetClass??"Unknown";target.set(s,target.get(s)!*(classScale.get(k)??1));}
  sum=[...target.values()].reduce((a,b)=>a+b,0); if(sum>0)for(const s of symbols)target.set(s,target.get(s)!/sum);
  const rows=symbols.map(s=>{const a=assets.find(x=>x.symbol===s);const cw=(current.get(s)??0)*100,tw=(target.get(s)??0)*100;return {symbol:s,assetClass:a?.assetClass??"Unknown",currentWeight:cw,targetWeight:tw,deltaWeight:tw-cw,currentNotional:(current.get(s)??0)*capital,targetNotional:(target.get(s)??0)*capital,rationale:method==="EQUAL_WEIGHT"?"Répartition uniforme sous contraintes.":"Poids ajusté selon volatilité historique et plafonds."};}).sort((a,b)=>Math.abs(b.deltaWeight)-Math.abs(a.deltaWeight));
  const targetVol=Math.sqrt(rows.reduce((s,p)=>s+(p.targetWeight/100* (vols.get(p.symbol)??0.005))**2,0))*100;
  const classRows=[...new Set([...byClassCurrent.keys(),...byClassTarget.keys()])].map(k=>({assetClass:k,currentPercent:(byClassCurrent.get(k)??0)*100,targetPercent:(byClassTarget.get(k)??0)*100}));
  const changes=rows.filter(x=>Math.abs(x.deltaWeight)>=1).slice(0,8).map(x=>`${x.symbol}: ${x.currentWeight.toFixed(1)}% → ${x.targetWeight.toFixed(1)}%`);
  return {generatedAt:new Date().toISOString(),method,capital,investableCapital:capital-risk.estimatedDailyVaR,maxPositionPercent:25,maxAssetClassPercent:40,grossTargetPercent:rows.reduce((s,x)=>s+x.targetWeight,0),estimatedVolatilityPercent:targetVol,estimatedConcentrationPercent:Math.max(0,...rows.map(x=>x.targetWeight)),positions:rows,byAssetClass:classRows,changes,constraints:["Poids individuel plafonné à 25%.","Exposition par classe plafonnée à 40%.","Optimisation indicative, sans exécution automatique."],disclaimer:"Allocation théorique destinée à l'analyse et au paper trading. Elle ne constitue pas un conseil financier personnalisé."};
}
