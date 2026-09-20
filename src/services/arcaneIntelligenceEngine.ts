import { randomUUID } from "node:crypto";
import type { ImpactLevel, SentimentLabel } from "./eventNewsEngine.js";

export interface PowerArcanaGem {
  id: string;
  source: string;
  title: string;
  body: string;
  sentiment: SentimentLabel;
  importance: ImpactLevel;
  timestamp: string;
  actors: string[];
  geopoliticalWeight: number; // 0 to 100
  isLeaked: boolean;
}

const ARCANE_SOURCES = [
  { name: "White House Press Office", region: "USA", weight: 95 },
  { name: "European Central Bank (ECB)", region: "Europe", weight: 90 },
  { name: "People's Bank of China (PBoC)", region: "China", weight: 92 },
  { name: "Bank of Japan (BoJ)", region: "Asia", weight: 88 },
  { name: "South African Reserve Bank (SARB)", region: "Africa", weight: 75 },
  { name: "Kremlin Intelligence Service", region: "Eurasia", weight: 85 },
  { name: "10 Downing Street", region: "UK", weight: 80 }
];

const GEM_TEMPLATES = [
  { title: "Nouveau cadre de régulation des flux transfrontaliers", sentiment: "NEUTRAL", body: "Des discussions internes suggèrent un durcissement des contrôles sur les sorties de capitaux.", importance: "HIGH", leaked: true },
  { title: "Accord bilatéral secret sur l'approvisionnement en semi-conducteurs", sentiment: "BULLISH", body: "Une alliance stratégique se dessine pour garantir la priorité des livraisons vers les hubs technologiques.", importance: "HIGH", leaked: false },
  { title: "Révision surprise des taux de réserve obligatoire", sentiment: "BEARISH", body: "La structure monétaire s'apprête à injecter ou retirer massivement des liquidités pour contrer l'inflation.", importance: "HIGH", leaked: false },
  { title: "Déclaration conjointe sur la stabilité des métaux précieux", sentiment: "BULLISH", body: "L'or et l'argent sont réaffirmés comme piliers de la réserve monétaire nationale.", importance: "MEDIUM", leaked: false }
];

let gemsBuffer: PowerArcanaGem[] = [];

export function scanPowerArcana(): PowerArcanaGem[] {
  // Simulate AI finding a "gem" every few scans
  if (Math.random() > 0.7) {
    const source = ARCANE_SOURCES[Math.floor(Math.random() * ARCANE_SOURCES.length)];
    const template = GEM_TEMPLATES[Math.floor(Math.random() * GEM_TEMPLATES.length)];

    const newGem: PowerArcanaGem = {
      id: randomUUID(),
      source: source.name,
      title: template.title,
      body: template.body,
      sentiment: template.sentiment as SentimentLabel,
      importance: template.importance as ImpactLevel,
      timestamp: new Date().toISOString(),
      actors: [source.region, "Gouvernement", "Banque Centrale"],
      geopoliticalWeight: source.weight,
      isLeaked: template.leaked
    };

    gemsBuffer.unshift(newGem);
    if (gemsBuffer.length > 50) gemsBuffer.pop();
  }
  return [...gemsBuffer];
}

export function getArcaneGems() {
  return [...gemsBuffer];
}
