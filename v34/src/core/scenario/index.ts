export interface Scenario { id:string; name:string; probability:number; impact:string; trigger:string; invalidation:string; }
export function buildScenarios(regime:string, confidence:number):Scenario[] {
  const base=Math.max(0.35,Math.min(0.65,confidence/100)); return [
    {id:"BASE",name:`Base · ${regime}`,probability:Math.round(base*100),impact:"Poursuite conditionnelle du régime observé",trigger:"Facteurs actuels inchangés",invalidation:"Rupture de régime ou dégradation forte des données"},
    {id:"ALT",name:"Alternatif",probability:Math.round((1-base)*60),impact:"Rotation vers un régime différent",trigger:"Divergence macro/technique",invalidation:"Retour de confluence"},
    {id:"TAIL",name:"Stress",probability:Math.round((1-base)*40),impact:"Choc de volatilité/liquidité",trigger:"Saut de volatilité ou corrélation",invalidation:"Normalisation progressive"}
  ];
}
