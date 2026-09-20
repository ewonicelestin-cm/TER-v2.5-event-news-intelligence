export type EvidenceDomain = "TECHNICAL" | "MACRO" | "FUNDAMENTAL" | "NEWS" | "RISK" | "LIQUIDITY";
export interface Contradiction { id:string; domains:[EvidenceDomain,EvidenceDomain]; severity:"LOW"|"MEDIUM"|"HIGH"; description:string; resolution:string; }
export function detectContradictions(input:{technical:number; macro:number; fundamental:number; news:number; risk:number}): Contradiction[] {
  const pairs:Array<[EvidenceDomain,number,EvidenceDomain,number]>=[
    ["TECHNICAL",input.technical,"MACRO",input.macro],["TECHNICAL",input.technical,"FUNDAMENTAL",input.fundamental],["TECHNICAL",input.technical,"NEWS",input.news],["MACRO",input.macro,"FUNDAMENTAL",input.fundamental]
  ];
  return pairs.filter(([,a,,b])=>Math.abs(a-b)>=.55).map(([a,x,b,y],i)=>({id:`CON-${i+1}`,domains:[a,b],severity:Math.abs(x-y)>=.8?"HIGH":"MEDIUM",description:`Divergence entre ${a.toLowerCase()} (${x.toFixed(2)}) et ${b.toLowerCase()} (${y.toFixed(2)}).`,resolution:"Conserver les deux lectures et réduire la confiance agrégée plutôt que forcer une direction unique."}));
}
