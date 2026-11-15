/**
 * Client-side rate limiter for the Ask tab (sliding windows). The chat server
 * enforces its own per-IP limit too; this keeps the app polite and stops
 * accidental floods (double taps, stuck keys, scripted input).
 */
export interface RateRule {
  /** Window length in ms. */
  windowMs: number;
  /** Max requests allowed within the window. */
  max: number;
  /** User-facing reason. */
  label: string;
}

export const ASK_RULES: RateRule[] = [
  { windowMs: 1_500, max: 1, label: 'one message at a time' },
  { windowMs: 60_000, max: 8, label: '8 messages a minute' },
  { windowMs: 60 * 60_000, max: 60, label: '60 messages an hour' },
];

export type RateResult = { ok: true } | { ok: false; retryInMs: number; label: string };

export class RateLimiter {
  private stamps: number[] = [];
  constructor(private rules: RateRule[] = ASK_RULES) {}

  /** Check without recording. */
  check(now = Date.now()): RateResult {
    let worst: RateResult = { ok: true };
    for (const r of this.rules) {
      const inWindow = this.stamps.filter((t) => now - t < r.windowMs);
      if (inWindow.length >= r.max) {
        // Next slot opens when the oldest stamp that still counts leaves the window.
        const oldest = inWindow[inWindow.length - r.max];
        const retryInMs = oldest + r.windowMs - now;
        if (worst.ok || retryInMs > worst.retryInMs) worst = { ok: false, retryInMs, label: r.label };
      }
    }
    return worst;
  }

  /** Record a request if allowed. */
  take(now = Date.now()): RateResult {
    const res = this.check(now);
    if (res.ok) {
      this.stamps.push(now);
      const longest = Math.max(...this.rules.map((r) => r.windowMs));
      this.stamps = this.stamps.filter((t) => now - t < longest);
    }
    return res;
  }
}
