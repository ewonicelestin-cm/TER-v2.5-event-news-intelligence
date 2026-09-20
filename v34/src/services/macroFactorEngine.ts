import type { AssetClass, MarketAsset, OHLCVBar } from "../types";

export type MacroRegime = "RISK_ON" | "RISK_OFF" | "INFLATION_PRESSURE" | "DEFLATION_PRESSURE" | "MIXED";
export type FactorName = "EQUITY_MOMENTUM" | "CRYPTO_MOMENTUM" | "USD_STRENGTH" | "COMMODITY_PRESSURE" | "RATE_PRESSURE" | "VOLATILITY";

export interface MacroFactor { name: FactorName; value: number; contribution: number; confidence: number; interpretation: string; }
export interface MacroRegimeReport {
  generatedAt: string; regime: MacroRegime; score: number; confidence: number;
  factors: MacroFactor[]; assetClassHeatmap: { assetClass: AssetClass; score: number; label: "POSITIVE" | "NEUTRAL" | "NEGATIVE" }[];
  rotation: { from: AssetClass; to: AssetClass; strength: number; rationale: string }[];
  warnings: string[]; methodology: string;
}

function returns(bars: OHLCVBar[]) {
  const s=[...bars].sort((a,b)=>Date.parse(a.ts)-Date.parse(b.ts));
  const r:number[]=[]; for(let i=1;i<s.length;i++) if(s[i-1].close>0&&s[i].close>0) r.push(s[i].close/s[i-1].close-1);
  return r.slice(-60);
}
function momentum(bars: OHLCVBar[]) { const r=returns(bars); if(!r.length)return 0; return Math.max(-1,Math.min(1,r.reduce((a,b)=>a+b,0)/Math.max(0.0001,Math.sqrt(r.map(x=>x*x).reduce((a,b)=>a+b,0)/r.length))*0.35)); }
function volatility(bars: OHLCVBar[]) { const r=returns(bars); if(r.length<2)return 0; const m=r.reduce((a,b)=>a+b,0)/r.length; return Math.sqrt(r.reduce((a,b)=>a+(b-m)**2,0)/r.length)*100; }
function latest(assetClass: AssetClass, assets: MarketAsset[]) { return assets.filter(a=>a.assetClass===assetClass); }
function avgMomentum(cls: AssetClass, assets: MarketAsset[], histories: Record<string,OHLCVBar[]>) { const xs=latest(cls,assets).map(a=>momentum(histories[a.symbol]??[])).filter(Number.isFinite); return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0; }

export function buildMacroRegime(assets: MarketAsset[], histories: Record<string,OHLCVBar[]>): MacroRegimeReport {
  const equity=avgMomentum("Equities",assets,histories); const indices=avgMomentum("Indices",assets,histories); const crypto=avgMomentum("Crypto",assets,histories);
  const fx=avgMomentum("Forex",assets,histories); const commodities=avgMomentum("Commodities",assets,histories); const rates=avgMomentum("Rates",assets,histories);
  const usd=assets.find(a=>a.symbol==="EURUSD") ? -momentum(histories.EURUSD??[]) : fx;
  const avgVol=assets.map(a=>volatility(histories[a.symbol]??[])).filter(v=>v>0); const vol=avgVol.length?Math.min(1,Math.max(0,((avgVol.reduce((a,b)=>a+b,0)/avgVol.length)-1)/6)):0;
  const riskOn=0.35*equity+0.2*indices+0.2*crypto-0.15*usd-0.1*vol;
  const inflation=0.45*commodities+0.3*usd+0.25*rates;
  const deflation=-inflation;
  let regime:MacroRegime="MIXED"; let score=riskOn;
  if(riskOn>0.22) regime="RISK_ON"; else if(riskOn<-0.22) regime="RISK_OFF"; else if(inflation>0.28) { regime="INFLATION_PRESSURE"; score=inflation; } else if(deflation>0.28) { regime="DEFLATION_PRESSURE"; score=deflation; }
  const factors:MacroFactor[]=[
    {name:"EQUITY_MOMENTUM",value:equity,contribution:equity*.35,confidence:.75,interpretation:equity>0.15?"Momentum actions favorable":"Momentum actions faible ou négatif"},
    {name:"CRYPTO_MOMENTUM",value:crypto,contribution:crypto*.2,confidence:.65,interpretation:crypto>0.15?"Appétit pour le risque élevé":"Crypto sous pression"},
    {name:"USD_STRENGTH",value:usd,contribution:-usd*.15,confidence:.7,interpretation:usd>0.15?"Dollar relativement ferme":"Dollar relativement faible"},
    {name:"COMMODITY_PRESSURE",value:commodities,contribution:commodities*.45,confidence:.6,interpretation:commodities>0.15?"Pression haussière des matières premières":"Matières premières sous pression"},
    {name:"RATE_PRESSURE",value:rates,contribution:rates*.25,confidence:.55,interpretation:rates>0.15?"Pression sur les taux":"Momentum taux faible"},
    {name:"VOLATILITY",value:vol,contribution:-vol*.2,confidence:.65,interpretation:vol>.55?"Volatilité agrégée élevée":"Volatilité agrégée contenue"}
  ];
  const heat=(cls:AssetClass, value:number) => ({assetClass:cls,score:Math.max(-1,Math.min(1,value)),label:(value>.12?"POSITIVE":value<-.12?"NEGATIVE":"NEUTRAL") as "POSITIVE"|"NEUTRAL"|"NEGATIVE"});
  const assetClassHeatmap=[heat("Equities",equity),heat("Indices",indices),heat("Crypto",crypto),heat("Forex",-usd),heat("Commodities",commodities),heat("Rates",-rates)];
  const sorted=[...assetClassHeatmap].sort((a,b)=>b.score-a.score);
  const weakest = sorted[sorted.length - 1];
  const rotation=sorted.length>=2&&weakest&&sorted[0].score-weakest.score>.2?[{from:weakest.assetClass,to:sorted[0].assetClass,strength:sorted[0].score-weakest.score,rationale:"Écart de momentum relatif entre classes d'actifs."}]:[];
  const warnings:string[]=[]; if(avgVol.length<3)warnings.push("Couverture factorielle limitée : certaines classes d'actifs n'ont pas assez d'historique."); if(Math.abs(score)<.12)warnings.push("Régime peu marqué : les facteurs donnent des indications contradictoires.");
  return {generatedAt:new Date().toISOString(),regime,score:Math.max(-1,Math.min(1,score)),confidence:Math.min(.95,Math.max(.35,factors.reduce((a,b)=>a+b.confidence,0)/factors.length*(.7+Math.min(1,assets.length/10)*.3))),factors,assetClassHeatmap,rotation,warnings,methodology:"Agrégation de momentum, pression relative et volatilité sur les historiques disponibles. Le régime est descriptif et ne constitue pas une prévision."};
}
