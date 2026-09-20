export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = Math.max(0, options.retries ?? 2);
  const base = Math.max(0, options.baseDelayMs ?? 150);
  const max = Math.max(base, options.maxDelayMs ?? 2_000);
  const shouldRetry = options.shouldRetry ?? (() => true);
  let attempt = 0;
  while (true) {
    try { return await fn(); }
    catch (error) {
      if (attempt >= retries || !shouldRetry(error, attempt)) throw error;
      const delay = Math.min(max, base * (2 ** attempt)) + Math.floor(Math.random() * Math.max(1, base));
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt += 1;
    }
  }
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures = 0;
  private openedAt = 0;
  private successes = 0;
  constructor(private readonly threshold = 3, private readonly resetTimeoutMs = 30_000) {}
  getStatus() { return { state: this.state, failures: this.failures, successes: this.successes, openedAt: this.openedAt || null, threshold: this.threshold, resetTimeoutMs: this.resetTimeoutMs }; }
  private canAttempt() { if (this.state !== "OPEN") return true; if (Date.now() - this.openedAt >= this.resetTimeoutMs) { this.state = "HALF_OPEN"; return true; } return false; }
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canAttempt()) throw new Error("circuit breaker open");
    try { const result = await fn(); this.successes += 1; this.failures = 0; this.state = "CLOSED"; return result; }
    catch (error) { this.failures += 1; if (this.failures >= this.threshold) { this.state = "OPEN"; this.openedAt = Date.now(); } throw error; }
  }
}
