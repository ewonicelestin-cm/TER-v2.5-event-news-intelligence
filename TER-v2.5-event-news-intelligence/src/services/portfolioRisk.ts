import type { MarketAsset, OHLCVBar } from "../types";
import type { PaperPosition } from "./paperTrading";

export interface CorrelationCell { a: string; b: string; value: number; }
export interface PortfolioRiskReport {
  generatedAt: string;
  equity: number;
  cash: number;
  grossExposure: number;
  netExposure: number;
  exposurePercent: number;
  concentrationPercent: number;
  openPositions: number;
  portfolioVolatilityPercent: number;
  estimatedDailyVaRPercent: number;
  estimatedDailyVaR: number;
  stress: { name: string; pnlPercent: number; pnlAmount: number }[];
  byAssetClass: { assetClass: string; notional: number; percent: number }[];
  positions: {
    symbol: string; direction: string; entry: number; currentPrice: number; size: number;
    notional: number; pnl: number; weightPercent: number; stopRisk: number; stopRiskPercent: number;
  }[];
  correlations: CorrelationCell[];
  warnings: string[];
}

function returns(bars: OHLCVBar[]): number[] {
  const sorted = [...bars].sort((a,b) => Date.parse(a.ts)-Date.parse(b.ts));
  const out: number[] = [];
  for (let i=1;i<sorted.length;i++) {
    const prev=sorted[i-1].close, cur=sorted[i].close;
    if (prev>0 && Number.isFinite(prev) && Number.isFinite(cur)) out.push(cur/prev-1);
  }
  return out.slice(-120);
}

function mean(xs:number[]) { return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0; }
function std(xs:number[]) {
  if (xs.length<2) return 0;
  const m=mean(xs); return Math.sqrt(mean(xs.map(x=>(x-m)**2)));
}
function correlation(a:number[],b:number[]) {
  const n=Math.min(a.length,b.length); if(n<3) return 0;
  const x=a.slice(-n), y=b.slice(-n), mx=mean(x), my=mean(y);
  let num=0, dx=0, dy=0;
  for(let i=0;i<n;i++){const vx=x[i]-mx,vy=y[i]-my;num+=vx*vy;dx+=vx*vx;dy+=vy*vy;}
  return dx&&dy ? Math.max(-1,Math.min(1,num/Math.sqrt(dx*dy))) : 0;
}

export function buildPortfolioRisk(
  assets: MarketAsset[],
  positions: PaperPosition[],
  barsBySymbol: Record<string, OHLCVBar[]>,
  equity: number,
  cash: number
): PortfolioRiskReport {
  const priceBySymbol = Object.fromEntries(assets.map(a=>[a.symbol,a.price]));
  const positionRows = positions.map(p=>{
    const currentPrice=priceBySymbol[p.symbol] ?? p.entry;
    const notional=Math.abs(currentPrice*p.size);
    const pnl=p.direction==='LONG'?(currentPrice-p.entry)*p.size:(p.entry-currentPrice)*p.size;
    const stopRisk=Math.abs(p.entry-p.stop)*p.size;
    return { symbol:p.symbol,direction:p.direction,entry:p.entry,currentPrice,size:p.size,notional,pnl,weightPercent:equity?notional/equity*100:0,stopRisk,stopRiskPercent:equity?stopRisk/equity*100:0 };
  });
  const grossExposure=positionRows.reduce((s,p)=>s+p.notional,0);
  const signed=positionRows.reduce((s,p)=>s+(p.direction==='LONG'?p.notional:-p.notional),0);
  const byClassMap=new Map<string,number>();
  for(const p of positionRows){const a=assets.find(x=>x.symbol===p.symbol);const k=a?.assetClass??'Unknown';byClassMap.set(k,(byClassMap.get(k)??0)+p.notional);}
  const byAssetClass=[...byClassMap.entries()].map(([assetClass,notional])=>({assetClass,notional,percent:equity?notional/equity*100:0})).sort((a,b)=>b.notional-a.notional);

  const portfolioReturns:number[]=[];
  const symbols=positions.map(p=>p.symbol).filter((s,i,arr)=>arr.indexOf(s)===i);
  const series=Object.fromEntries(symbols.map(s=>[s,returns(barsBySymbol[s]??[])]));
  const weights=Object.fromEntries(symbols.map(s=>[s,(positionRows.filter(p=>p.symbol===s).reduce((x,p)=>x+p.notional,0)/Math.max(equity,1))]));
  const maxLen=Math.max(0,...symbols.map(s=>series[s].length));
  for(let i=0;i<maxLen;i++){
    let r=0;
    for(const s of symbols){const xs=series[s]; if(i<xs.length) r+=(weights[s]??0)*xs[xs.length-1-i]*(positionRows.find(p=>p.symbol===s)?.direction==='SHORT'?-1:1);}
    portfolioReturns.push(r);
  }
  const dailyVol=std(portfolioReturns);
  const portfolioVolatilityPercent=dailyVol*100;
  const z=1.645;
  const estimatedDailyVaRPercent=dailyVol*z*100;
  const estimatedDailyVaR=equity*dailyVol*z;

  const stressBase = positionRows.reduce((s,p)=>s+(p.direction==='LONG'?p.notional:-p.notional),0);
  const stress=[
    {name:'Marché -5%',pnlPercent:stressBase/equity*5,pnlAmount:stressBase/equity*5*equity},
    {name:'Marché +5%',pnlPercent:-stressBase/equity*5,pnlAmount:-stressBase/equity*5*equity},
    {name:'Choc volatilité +50%',pnlPercent:-Math.min(100,portfolioVolatilityPercent*0.5),pnlAmount:-equity*Math.min(1,portfolioVolatilityPercent*0.5/100)}
  ];

  const correlations:CorrelationCell[]=[];
  for(let i=0;i<symbols.length;i++) for(let j=i;j<symbols.length;j++) correlations.push({a:symbols[i],b:symbols[j],value:i===j?1:correlation(series[symbols[i]],series[symbols[j]])});
  const concentrationPercent=equity?((positionRows[0]?.notional??0)/equity)*100:0;
  const warnings:string[]=[];
  if(grossExposure>equity) warnings.push('Exposition brute supérieure au capital de référence.');
  if(concentrationPercent>35) warnings.push('Concentration élevée sur la plus grosse position (>35%).');
  if(estimatedDailyVaRPercent>3) warnings.push('VaR journalière estimée élevée (>3% du capital).');
  if(positionRows.length>=2 && correlations.some(c=>c.a!==c.b && c.value>0.8)) warnings.push('Certaines positions présentent une corrélation historique élevée (>0,80).');
  if(!positions.length) warnings.push('Aucune position ouverte : le rapport mesure uniquement le risque du portefeuille actuel.');
  return {generatedAt:new Date().toISOString(),equity,cash,grossExposure,netExposure:signed,exposurePercent:equity?grossExposure/equity*100:0,concentrationPercent,openPositions:positions.length,portfolioVolatilityPercent,estimatedDailyVaRPercent,estimatedDailyVaR,stress,byAssetClass,positions:positionRows,correlations,warnings};
}
