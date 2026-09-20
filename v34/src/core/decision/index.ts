import type { ConfidenceBreakdown } from "../confidence";
import type { Contradiction } from "../contradiction";
export interface DecisionFrame { stance:"BULLISH"|"NEUTRAL"|"BEARISH"; probabilities:{bullish:number;neutral:number;bearish:number}; confidence:ConfidenceBreakdown; contradictions:Contradiction[]; scenario:{base:string;upside:string;downside:string;invalidation:string}; }
export function buildDecisionFrame(score:number, confidence:ConfidenceBreakdown, contradictions:Contradiction[]):DecisionFrame {
  const s=Math.max(-1,Math.min(1,score)); const uncertainty=Math.min(.45,contradictions.length*.08+(100-confidence.overall)/250);
  const bullish=Math.max(0,Math.min(1,(s+1)/2)); const bearish=1-bullish; const neutral=Math.min(.5,uncertainty); const remaining=1-neutral; const b=bullish*remaining, br=bearish*remaining;
  const p={bullish:Math.round(b*100),neutral:Math.round(neutral*100),bearish:Math.round(br*100)}; const stance=p.bullish>=p.bearish+8?"BULLISH":p.bearish>=p.bullish+8?"BEARISH":"NEUTRAL";
  return {stance,probabilities:p,confidence,contradictions,scenario:{base:"Maintien du régime observé avec incertitude explicite.",upside:"Les facteurs concordants renforcent le scénario dominant.",downside:"Une rupture de régime ou une dégradation des données invalide l'interprétation.",invalidation:"Réévaluer si qualité des données, régime ou confluence changent matériellement."}};
}
