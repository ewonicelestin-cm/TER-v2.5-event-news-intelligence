export type DataOrigin = "LIVE" | "SYNTHETIC" | "DERIVED" | "UNKNOWN";
export interface Provenance { source: string; origin: DataOrigin; timestamp: string; freshnessSeconds?: number; qualityScore: number; methodology: string; dependencies: string[]; }
export interface Evidence<T=unknown> { value: T; provenance: Provenance; }
export function provenance(source:string, origin:DataOrigin, qualityScore:number, methodology:string, dependencies:string[]=[]): Provenance {
  return {source, origin, timestamp:new Date().toISOString(), qualityScore:Math.max(0,Math.min(100,qualityScore)), methodology, dependencies};
}
