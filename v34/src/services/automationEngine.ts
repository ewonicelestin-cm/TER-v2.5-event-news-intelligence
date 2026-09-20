import type { MarketAsset, Signal } from "../types";

export type RuleMetric = "SIGNAL_SCORE" | "CONFIDENCE" | "CHANGE_24H" | "DATA_QUALITY_SCORE" | "PRICE";
export type RuleOperator = ">" | ">=" | "<" | "<=" | "=";
export type RuleLogic = "ALL" | "ANY";
export interface AutomationCondition { metric: RuleMetric; operator: RuleOperator; value: number; }
export interface AutomationRule { id: string; name: string; symbol: string | "*"; logic: RuleLogic; conditions: AutomationCondition[]; severity: "INFO" | "MEDIUM" | "HIGH"; enabled: boolean; cooldownMinutes: number; createdAt: string; lastTriggeredAt?: string; triggerCount: number; }
export interface RuleEvaluation { ruleId: string; ruleName: string; symbol: string; matched: boolean; matchedConditions: number; totalConditions: number; message: string; severity: AutomationRule["severity"]; }

let rules: AutomationRule[] = [
  { id: "RULE-default-signal", name: "Signal fort", symbol: "*", logic: "ALL", conditions: [{ metric: "SIGNAL_SCORE", operator: ">=", value: 80 }], severity: "HIGH", enabled: true, cooldownMinutes: 15, createdAt: new Date().toISOString(), triggerCount: 0 },
  { id: "RULE-default-move", name: "Mouvement inhabituel", symbol: "*", logic: "ANY", conditions: [{ metric: "CHANGE_24H", operator: ">=", value: 5 }, { metric: "CHANGE_24H", operator: "<=", value: -5 }], severity: "MEDIUM", enabled: true, cooldownMinutes: 15, createdAt: new Date().toISOString(), triggerCount: 0 },
  { id: "RULE-default-quality", name: "Qualité dégradée", symbol: "*", logic: "ALL", conditions: [{ metric: "DATA_QUALITY_SCORE", operator: "<", value: 70 }], severity: "MEDIUM", enabled: true, cooldownMinutes: 30, createdAt: new Date().toISOString(), triggerCount: 0 }
];

function compare(value: number, op: RuleOperator, target: number) { if (op === ">") return value > target; if (op === ">=") return value >= target; if (op === "<") return value < target; if (op === "<=") return value <= target; return value === target; }
function metricValue(metric: RuleMetric, asset: MarketAsset, signal?: Signal) { if (metric === "SIGNAL_SCORE") return signal?.score ?? NaN; if (metric === "CONFIDENCE") return signal?.confidence ?? NaN; if (metric === "CHANGE_24H") return asset.change24h; if (metric === "DATA_QUALITY_SCORE") return asset.dataQualityScore ?? (asset.dataSource === "synthetic" ? 45 : 0); return asset.price; }

export function getAutomationRules() { return [...rules]; }
export function addAutomationRule(input: Omit<AutomationRule, "id" | "createdAt" | "triggerCount">) { const row: AutomationRule = { ...input, id: `RULE-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, createdAt: new Date().toISOString(), triggerCount: 0 }; rules.unshift(row); return row; }
export function updateAutomationRule(id: string, patch: Partial<Pick<AutomationRule, "name" | "logic" | "conditions" | "severity" | "enabled" | "cooldownMinutes">>) { const row = rules.find(r => r.id === id); if (!row) return null; Object.assign(row, patch); return row; }
export function deleteAutomationRule(id: string) { rules = rules.filter(r => r.id !== id); return rules; }

export function evaluateAutomationRules(assets: MarketAsset[], signals: Signal[]): RuleEvaluation[] {
  const results: RuleEvaluation[] = [];
  for (const asset of assets) {
    const signal = signals.find(s => s.symbol === asset.symbol);
    for (const rule of rules) {
      if (!rule.enabled || (rule.symbol !== "*" && rule.symbol !== asset.symbol)) continue;
      const checks = rule.conditions.map(c => compare(metricValue(c.metric, asset, signal), c.operator, c.value));
      const matched = rule.logic === "ALL" ? checks.every(Boolean) : checks.some(Boolean);
      const due = !rule.lastTriggeredAt || Date.now() - new Date(rule.lastTriggeredAt).getTime() >= rule.cooldownMinutes * 60_000;
      if (matched && due) {
        rule.lastTriggeredAt = new Date().toISOString(); rule.triggerCount += 1;
        results.push({ ruleId: rule.id, ruleName: rule.name, symbol: asset.symbol, matched, matchedConditions: checks.filter(Boolean).length, totalConditions: checks.length, message: `${rule.name} déclenchée sur ${asset.symbol} (${checks.filter(Boolean).length}/${checks.length} conditions).`, severity: rule.severity });
      }
    }
  }
  return results;
}
