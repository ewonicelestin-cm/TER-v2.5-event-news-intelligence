import type { MarketAsset, OHLCVBar } from "../types";
import type { PaperPosition } from "./paperTrading";
import type { PortfolioRiskReport } from "./portfolioRisk";

export type StressScenario = "EQUITY_CRASH" | "RATES_SHOCK" | "CRYPTO_SHOCK" | "FX_SHOCK" | "COMMODITY_SHOCK" | "VOLATILITY_SPIKE" | "COMBINED_CRISIS";
export interface StressResult { name:string; scenario:StressScenario; pnlAmount:number; pnlPercent:number; shockedPositions:number; description:string; }
export interface StressEngineReport {
  generatedAt:string; equity:number; baselineNetExposure:number; worstScenario:string|null; worstPnlAmount:number;
  scenarios:StressResult[]; byAssetClass:{assetClass:string; pnlAmount:number; pnlPercent:number}[];
  recoveryDaysEstimate:number|null; warnings:string[]; disclaimer:string;
}

const SHOCKS: Record<StressScenario, Partial<Record<MarketAsset["assetClass"], number>>> = {
  EQUITY_CRASH:{Equities:-0.20,Indices:-0.25,Crypto:-0.30,Commodities:-0.08,Forex:0,Rates:0},
  RATES_SHOCK:{Rates:-0.12,Equities:-0.08,Indices:-0.10,Crypto:-0.15,Commodities:-0.04,Forex:0.02},
  CRYPTO_SHOCK:{Crypto:-0.35,Equities:-0.05,Indices:-0.06,Commodities:0,Forex:0,Rates:0},
  FX_SHOCK:{Forex:-0.08,Equities:-0.03,Indices:-0.04,Crypto:-0.05,Commodities:-0.03,Rates:0},
  COMMODITY_SHOCK:{Commodities:-0.20,Equities:-0.04,Indices:-0.05,Crypto:-0.08,Forex:0,Rates:0},
  VOLATILITY_SPIKE:{Equities:-0.10,Indices:-0.12,Crypto:-0.18,Commodities:-0.07,Forex:-0.03,Rates:-0.03},
  COMBINED_CRISIS:{Equities:-0.15,Indices:-0.20,Crypto:-0.30,Commodities:-0.12,Forex:-0.06,Rates:-0.08}
};
const NAMES:Record<StressScenario,string>={EQUITY_CRASH:"Crash actions / indices",RATES_SHOCK:"Choc de taux",CRYPTO_SHOCK:"Choc crypto",FX_SHOCK:"Choc Forex",COMMODITY_SHOCK:"Choc matières premières",VOLATILITY_SPIKE:"Pic de volatilité",COMBINED_CRISIS:"Crise combinée"};
function returns(bars:OHLCVBar[]){const s=[...bars].sort((a,b)=>Date.parse(a.ts)-Date.parse(b.ts));const r:number[]=[];for(let i=1;i<s.length;i++){if(s[i-1].close>0&&s[i].close>0)r.push(s[i].close/s[i-1].close-1);}return r.slice(-120);}
function recoveryEstimate(pnlPct:number, volPct:number){if(pnlPct>=0||volPct<=0)return null;const daily=Math.max(volPct/100,0.002);return Math.ceil(Math.abs(pnlPct)/daily/1.5);}
export function runStressEngine(assets:MarketAsset[],positions:PaperPosition[],barsBySymbol:Record<string,OHLCVBar[]>,risk:PortfolioRiskReport):StressEngineReport{
  const equity=Math.max(risk.equity,1); const assetMap=new Map(assets.map(a=>[a.symbol,a]));
  const results:StressResult[]=Object.entries(SHOCKS).map(([key,shockMap])=>{
    let pnl=0, count=0; for(const p of positions){const a=assetMap.get(p.symbol);if(!a)continue;const shock=shockMap[a.assetClass]??0; if(shock!==0)count++; const signed=p.direction==="LONG"?1:-1; pnl += Math.abs(a.price*p.size)*shock*signed;}
    return {name:NAMES[key as StressScenario],scenario:key as StressScenario,pnlAmount:pnl,pnlPercent:pnl/equity*100,shockedPositions:count,description:"Choc déterministe appliqué à l'exposition de chaque classe d'actifs."};
  });
  const classPnL=new Map<string,number>(); for(const p of positions){const a=assetMap.get(p.symbol);if(!a)continue;const base=Math.abs(a.price*p.size)*(p.direction==="LONG"?1:-1);const worst=results.reduce((m,r)=>{const s=SHOCKS[r.scenario][a.assetClass]??0;return Math.min(m,base*s)},0);classPnL.set(a.assetClass,(classPnL.get(a.assetClass)??0)+worst);}
  const worst=results.reduce((a,b)=>b.pnlAmount<a.pnlAmount?b:a,results[0]??null); const vol=risk.portfolioVolatilityPercent;
  const warnings:string[]=[]; if(worst&&worst.pnlPercent<-10)warnings.push("Le scénario le plus défavorable dépasse 10% de perte théorique du capital."); if(positions.length===0)warnings.push("Aucune position ouverte : les scénarios n'ont pas d'exposition à choquer."); if(vol===0)warnings.push("Historique insuffisant pour estimer un délai de récupération.");
  return {generatedAt:new Date().toISOString(),equity,baselineNetExposure:risk.netExposure,worstScenario:worst?.name??null,worstPnlAmount:worst?.pnlAmount??0,scenarios:results,byAssetClass:[...classPnL.entries()].map(([assetClass,pnlAmount])=>({assetClass,pnlAmount,pnlPercent:pnlAmount/equity*100})).sort((a,b)=>a.pnlAmount-b.pnlAmount),recoveryDaysEstimate:worst?recoveryEstimate(worst.pnlPercent,vol):null,warnings,disclaimer:"Scénarios déterministes destinés au stress testing. Ils ne prédisent pas les mouvements futurs et ne représentent pas une perte maximale garantie."};
}

export function historicalWorstMove(barsBySymbol:Record<string,OHLCVBar[]>,assets:MarketAsset[],positions:PaperPosition[],equity:number){
  const rows=positions.map(p=>{const a=assets.find(x=>x.symbol===p.symbol);const rs=returns(barsBySymbol[p.symbol]??[]);const worst=rs.length?Math.min(...rs):0;const signed=p.direction==="LONG"?1:-1;return {symbol:p.symbol,assetClass:a?.assetClass??"Unknown",worstDailyMove:worst*signed,impact:Math.abs((a?.price??p.entry)*p.size)*worst*signed};});
  const pnl=rows.reduce((s,r)=>s+r.impact,0); return {pnlAmount:pnl,pnlPercent:equity?pnl/equity*100:0,rows};
}
