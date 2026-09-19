import { ObservabilityEngine } from "./observabilityEngine.js";

export interface CircuitBreakerConfig {
  errorThreshold: number;
  resetTimeoutMs: number;
}

export class CircuitBreaker {
  private failures = 0;
  private lastFailureAt = 0;
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";

  constructor(private name: string, private config: CircuitBreakerConfig = { errorThreshold: 5, resetTimeoutMs: 60000 }) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureAt > this.config.resetTimeoutMs) {
        this.state = "HALF_OPEN";
      } else {
        throw new Error(`CircuitBreaker[${this.name}] is OPEN`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = "CLOSED";
    ObservabilityEngine.updateProviderHealth(this.name, { circuitBreakerOpen: false, status: "available" });
  }

  private onFailure() {
    this.failures++;
    this.lastFailureAt = Date.now();
    if (this.failures >= this.config.errorThreshold) {
      this.state = "OPEN";
      ObservabilityEngine.updateProviderHealth(this.name, { circuitBreakerOpen: true, status: "unavailable" });
    } else {
      ObservabilityEngine.updateProviderHealth(this.name, { status: "degraded" });
    }
  }

  getState() { return this.state; }
  reset() { this.state = "CLOSED"; this.failures = 0; }
}

export async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    await new Promise(resolve => setTimeout(resolve, delay));
    return withRetry(fn, retries - 1, delay * 2); // Exponential backoff
  }
}
