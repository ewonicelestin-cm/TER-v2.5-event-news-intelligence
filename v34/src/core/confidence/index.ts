export interface ConfidenceBreakdown { overall:number; data:number; model:number; agreement:number; freshness:number; penalties:string[]; }
export function computeConfidence(input:{dataQuality?:number; modelConfidence?:number; agreement?:number; freshness?:number; contradictions?:number}): ConfidenceBreakdown {
  const data=input.dataQuality ?? 50, model=input.modelConfidence ?? 50, agreement=input.agreement ?? 50, freshness=input.freshness ?? 50;
  const penalties:string[]=[]; const contradictionPenalty=Math.min(30,Math.max(0,input.contradictions ?? 0));
  if(data<60) penalties.push("qualité de données limitée"); if(freshness<60) penalties.push("fraîcheur limitée"); if(agreement<60) penalties.push("désaccord inter-modèles"); if(contradictionPenalty>0) penalties.push("contradictions détectées");
  const raw=.30*data+.30*model+.20*agreement+.20*freshness-contradictionPenalty;
  return {overall:Math.round(Math.max(0,Math.min(100,raw))),data,model,agreement,freshness,penalties};
}
