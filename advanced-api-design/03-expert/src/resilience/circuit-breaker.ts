/**
 * Circuit Breaker — protect callers from cascading failures
 * States: Closed → Open → Half-Open → Closed
 */
export type State = 'closed' | 'open' | 'half_open';

export interface CircuitOptions {
  failureThreshold: number;
  cooldownMs: number;
  halfOpenMaxProbes: number;
}

export class CircuitBreaker {
  state: State = 'closed';
  failures = 0;
  openedAt = 0;
  probes = 0;

  constructor(
    private readonly name: string,
    private readonly opts: CircuitOptions = {
      failureThreshold: 5,
      cooldownMs: 10_000,
      halfOpenMaxProbes: 1,
    },
  ) {}

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.openedAt >= this.opts.cooldownMs) {
        this.state = 'half_open';
        this.probes = 0;
        console.log(`[${this.name}] → half_open`);
      } else {
        throw new Error(`circuit_open:${this.name}`);
      }
    }

    if (this.state === 'half_open' && this.probes >= this.opts.halfOpenMaxProbes) {
      throw new Error(`circuit_open:${this.name}`);
    }

    if (this.state === 'half_open') this.probes++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (e) {
      this.onFailure();
      throw e;
    }
  }

  private onSuccess() {
    this.failures = 0;
    if (this.state !== 'closed') {
      console.log(`[${this.name}] → closed`);
    }
    this.state = 'closed';
  }

  private onFailure() {
    this.failures++;
    if (this.state === 'half_open' || this.failures >= this.opts.failureThreshold) {
      this.state = 'open';
      this.openedAt = Date.now();
      console.log(`[${this.name}] → open (failures=${this.failures})`);
    }
  }
}

/** Demo */
async function flakyPayment(failTimes: { n: number }): Promise<string> {
  if (failTimes.n > 0) {
    failTimes.n--;
    throw new Error('payment timeout');
  }
  return 'ok';
}

async function main() {
  const cb = new CircuitBreaker('payment');
  const bag = { n: 8 };

  for (let i = 0; i < 15; i++) {
    try {
      const r = await cb.exec(() => flakyPayment(bag));
      console.log(`call ${i}:`, r, 'state=', cb.state);
    } catch (e) {
      console.log(`call ${i}:`, (e as Error).message, 'state=', cb.state);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

main();
