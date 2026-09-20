export interface Observation {
  outcomeR: number;
  publishedBeforeEntry: boolean;
  independentlyVerified: boolean;
}

export function scorePublicStrategy(observations: Observation[]) {
  const valid = observations.filter(o => o.publishedBeforeEntry && o.independentlyVerified);
  if (!valid.length) return { sample: 0, winRate: 0, expectancy: 0, quality: 0 };

  const wins = valid.filter(o => o.outcomeR > 0);
  const expectancy = valid.reduce((s,o)=>s+o.outcomeR,0) / valid.length;
  const winRate = wins.length / valid.length * 100;
  const quality = Math.max(0, Math.min(100, 45 + winRate * 0.35 + expectancy * 12));

  return { sample: valid.length, winRate, expectancy, quality };
}
