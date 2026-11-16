/** Keep requests below the server byte limit, including non-ASCII questions/history. */
export function utf8Bytes(text: string): number {
  let length = 0;
  for (const character of text) {
    const point = character.codePointAt(0)!;
    length += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return length;
}
export function chatRequestBody(question: string, history: { role: 'user' | 'assistant'; text: string }[], context: unknown, limit = 30000): string {
  const turns = history.slice(-10).map(turn => ({ role: turn.role, text: turn.text.slice(0, 2000) }));
  let body = JSON.stringify({ question, history: turns, context });
  while (utf8Bytes(body) > limit && turns.length) {
    turns.shift();
    body = JSON.stringify({ question, history: turns, context });
  }
  if (utf8Bytes(body) > limit) throw new Error('chat_context_too_large');
  return body;
}
