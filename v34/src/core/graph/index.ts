import type { MarketAsset, Signal } from "../../types";

export type EvidenceNodeKind = "MARKET" | "SIGNAL" | "MACRO" | "FUNDAMENTAL" | "NEWS" | "RISK" | "DECISION";
export interface EvidenceNode { id:string; kind:EvidenceNodeKind; label:string; score:number; quality:number; origin:"LIVE"|"SYNTHETIC"|"DERIVED"|"UNKNOWN"; }
export interface EvidenceEdge { from:string; to:string; relation:"SUPPORTS"|"CONTRADICTS"|"INFORMS"; strength:number; }
export interface EvidenceGraph { nodes:EvidenceNode[]; edges:EvidenceEdge[]; density:number; }

export function buildEvidenceGraph(args:{assets:MarketAsset[];signals:Signal[];regime:string;macroScore:number;fundamentalScore:number;newsScore:number;riskScore:number}):EvidenceGraph {
  const assetsQuality = args.assets.length ? args.assets.reduce((s,a)=>s+(a.dataQualityScore??50),0)/args.assets.length : 0;
  const origin = args.assets.some(a=>a.dataSource === "live") ? "LIVE" : "SYNTHETIC";
  const best = args.signals[0];
  const signed = (v:number) => Math.max(-1,Math.min(1,v));
  const nodes:EvidenceNode[] = [
    {id:"market",kind:"MARKET",label:`Marché · ${args.assets.length} actifs`,score:50,quality:Math.round(assetsQuality),origin},
    {id:"macro",kind:"MACRO",label:`Macro · ${args.regime}`,score:Math.round(50+50*signed(args.macroScore)),quality:75,origin:"DERIVED"},
    {id:"fundamental",kind:"FUNDAMENTAL",label:"Fondamentaux",score:Math.round(Math.max(0,Math.min(100,args.fundamentalScore))),quality:75,origin:"DERIVED"},
    {id:"news",kind:"NEWS",label:"News & NLP",score:Math.round(50+50*signed(args.newsScore)),quality:65,origin:"DERIVED"},
    {id:"risk",kind:"RISK",label:"Risk",score:Math.round(50+50*signed(-args.riskScore)),quality:70,origin:"DERIVED"},
    {id:"signal",kind:"SIGNAL",label:best ? `Signal · ${best.symbol}` : "Signal",score:best?.score??50,quality:best?.confidence??50,origin:"DERIVED"},
    {id:"decision",kind:"DECISION",label:"Decision Frame",score:best?.confidence??50,quality:best?.confidence??50,origin:"DERIVED"}
  ];
  const edges:EvidenceEdge[] = [
    {from:"market",to:"signal",relation:"INFORMS",strength:Math.round(assetsQuality)},
    {from:"macro",to:"signal",relation:Math.abs(args.macroScore)>=.55?"CONTRADICTS":"SUPPORTS",strength:Math.round(Math.abs(args.macroScore)*100)},
    {from:"fundamental",to:"signal",relation:Math.abs(args.fundamentalScore-50)>=27?"SUPPORTS":"INFORMS",strength:Math.round(Math.min(100,Math.abs(args.fundamentalScore-50)*2))},
    {from:"news",to:"signal",relation:Math.abs(args.newsScore)>=.55?"CONTRADICTS":"INFORMS",strength:Math.round(Math.abs(args.newsScore)*100)},
    {from:"risk",to:"decision",relation:"INFORMS",strength:Math.round(Math.min(100,Math.abs(args.riskScore)*100))},
    {from:"signal",to:"decision",relation:"SUPPORTS",strength:best?.confidence??50}
  ];
  return {nodes,edges,density:Math.round(edges.length/Math.max(1,nodes.length*(nodes.length-1))*100)};
}
