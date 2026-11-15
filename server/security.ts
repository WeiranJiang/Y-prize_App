export const LIMITS = { question: 2000, turn: 4000, history: 10, body: 32768 };
export type Turn = { role: 'user' | 'assistant'; text: string };
export function validateInput(value: unknown): { question: string; history: Turn[]; context: Record<string, unknown> } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
  const { question, history = [], context = {} } = value as Record<string, unknown>;
  if (typeof question !== 'string' || !question.trim() || question.length > LIMITS.question) throw new Error('invalid');
  if (!Array.isArray(history) || history.length > LIMITS.history || history.some(t => !t || !['user', 'assistant'].includes(t.role) || typeof t.text !== 'string' || !t.text.trim() || t.text.length > LIMITS.turn)) throw new Error('invalid');
  if (!context || typeof context !== 'object' || Array.isArray(context)) throw new Error('invalid');
  return { question: question.trim(), history, context: context as Record<string, unknown> };
}

// Fixed windows and bounded storage; never trust caller-supplied forwarded IPs.
export class RateLimiter {
  private windows = new Map<string, { count: number; expires: number }>();
  constructor(private maximum: number, private duration: number, private capacity = 10000) {}
  take(key: string, now = Date.now()): number {
    for (const [id, window] of this.windows) if (window.expires <= now) this.windows.delete(id);
    let window = this.windows.get(key);
    if (!window) {
      if (this.windows.size >= this.capacity) return Math.ceil(this.duration / 1000);
      window = { count: 0, expires: now + this.duration };
      this.windows.set(key, window);
    }
    if (window.count >= this.maximum) return Math.max(1, Math.ceil((window.expires - now) / 1000));
    window.count++;
    return 0;
  }
}
