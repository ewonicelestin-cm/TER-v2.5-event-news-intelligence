export interface MetricSnapshot {
  name: string;
  value: number;
  unit: string;
  timestamp: string;
  tags: Record<string, string>;
}

export interface ProviderHealth {
  name: string;
  status: "available" | "degraded" | "unavailable";
  latencyMs: number;
  errorRate: number;
  lastCheckAt: string;
  circuitBreakerOpen: boolean;
}

export class ObservabilityEngine {
  private static metrics: MetricSnapshot[] = [];
  private static providerHealth: Record<string, ProviderHealth> = {};

  static recordMetric(name: string, value: number, unit: string, tags: Record<string, string> = {}) {
    const snapshot = { name, value, unit, tags, timestamp: new Date().toISOString() };
    this.metrics.push(snapshot);
    if (this.metrics.length > 1000) this.metrics.shift();
  }

  static updateProviderHealth(name: string, health: Partial<ProviderHealth>) {
    this.providerHealth[name] = {
      ...(this.providerHealth[name] || {
        name,
        status: "available",
        latencyMs: 0,
        errorRate: 0,
        lastCheckAt: new Date().toISOString(),
        circuitBreakerOpen: false
      }),
      ...health,
      lastCheckAt: new Date().toISOString()
    };
  }

  static getMetrics(name?: string) {
    return name ? this.metrics.filter(m => m.name === name) : [...this.metrics];
  }

  static getProviderHealth() {
    return { ...this.providerHealth };
  }

  static getSummary() {
    return {
      totalMetrics: this.metrics.length,
      activeProviders: Object.keys(this.providerHealth).length,
      errorsLastHour: this.metrics.filter(m => m.name === "error" && Date.now() - Date.parse(m.timestamp) < 3600000).length,
      avgLatency: this.calculateAvgLatency()
    };
  }

  private static calculateAvgLatency() {
    const latencies = this.metrics.filter(m => m.name === "latency");
    if (!latencies.length) return 0;
    return latencies.reduce((a, b) => a + b.value, 0) / latencies.length;
  }
}
