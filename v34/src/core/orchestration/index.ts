export type PipelineStage = "INGEST"|"NORMALIZE"|"FEATURES"|"SIGNALS"|"ENSEMBLE"|"CALIBRATION"|"RISK"|"SCENARIO"|"DECISION"|"AUDIT";
export interface PipelineState { stage:PipelineStage; status:"READY"|"RUNNING"|"DEGRADED"|"FAILED"; startedAt:string; completedAt?:string; latencyMs?:number; dependencies:string[]; }
export function createPipelineState(stage:PipelineStage, status:PipelineState["status"]="READY", dependencies:string[]=[]):PipelineState { return {stage,status,startedAt:new Date().toISOString(),dependencies}; }
