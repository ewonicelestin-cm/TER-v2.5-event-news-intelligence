import type { AIModel, Signal } from "../types";

export const aiModels: AIModel[] = [
  { name: "TER Ensemble", role: "Orchestrateur", specialty: "Fusion des signaux", score: 92, status: "active" },
  { name: "FinGPT", role: "NLP financier", specialty: "News, rapports, sentiment", score: 88, status: "planned" },
  { name: "Claude", role: "Reasoning", specialty: "Analyse qualitative / scénarios", score: 86, status: "planned" },
  { name: "Gemini", role: "Research", specialty: "Recherche multi-source", score: 85, status: "planned" },
  { name: "GPT", role: "Research + reasoning", specialty: "Synthèse et vérification", score: 90, status: "planned" }
];

export function ensembleExplanation(signal: Signal) {
  return `TER agrège momentum, qualité des sources, sentiment et règles de risque. Le score ${signal.score}/100 est un signal probabiliste, pas une garantie de résultat.`;
}