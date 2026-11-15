/**
 * Optional chat backend for the SPOT app's "Ask" tab.
 *
 * The phone sends the question, recent chat history and a compact summary of
 * the user's readings; this server asks Claude and returns a short reply.
 * The API key stays here, never in the app.
 *
 *   cd server && npm install
 *   ANTHROPIC_API_KEY=... npm start          # listens on :8787
 *   # in the app:  EXPO_PUBLIC_CHAT_URL=http://<host>:8787/chat npx expo start
 */
import Anthropic from '@anthropic-ai/sdk';
import { createServer } from 'node:http';

const client = new Anthropic();
const PORT = Number(process.env.PORT ?? 8787);

const SYSTEM = `You are the assistant inside SPOT, an oral-health monitoring app. A sensing strip in the user's retainer measures local pH, lactate, calcium, phosphate, fluoride and ammonium at specific tooth sites; a scanning case reads it.

Answer the user's question using only the data summary provided with each question. Keep replies short (2–5 sentences or a few bullets), plain and calm.
- These are research indicators. Never diagnose cavities, decay or gum disease, and never say a reading proves one.
- Separate what was measured from what it may suggest, and give practical, low-risk advice (cleaning, diet, fluoride routine).
- For pain, bleeding, swelling or new sensitivity, recommend seeing a dentist.
- If the summary doesn't contain the answer, say so.`;

type Turn = { role: 'user' | 'assistant'; text: string };

async function reply(question: string, history: Turn[], context: unknown): Promise<string> {
  // The API needs the conversation to start with a user turn.
  const turns = history.slice(history.findIndex((t) => t.role === 'user'));
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...(turns[0]?.role === 'user' ? turns : []).map((t) => ({ role: t.role, content: t.text })),
    { role: 'user', content: `My data summary (JSON):\n${JSON.stringify(context)}\n\nQuestion: ${question}` },
  ];

  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: 'low' },
    // Server-side refusal fallback: if the model declines, the API re-runs on a fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages,
  });

  if (response.stop_reason === 'refusal') {
    return "I can't help with that one. Try asking about your readings, a tooth, or your strips.";
  }
  return response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') return void res.end();
  if (req.method !== 'POST' || !req.url?.startsWith('/chat')) {
    res.statusCode = 404;
    return void res.end();
  }
  let body = '';
  for await (const chunk of req) body += chunk;
  try {
    const { question, history = [], context = {} } = JSON.parse(body) as { question: string; history?: Turn[]; context?: unknown };
    const text = await reply(String(question ?? ''), history, context);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ reply: text }));
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) res.statusCode = 429;
    else if (err instanceof Anthropic.APIError) res.statusCode = 502;
    else res.statusCode = 400;
    console.error(err);
    res.end(JSON.stringify({ error: 'chat_failed' }));
  }
}).listen(PORT, () => console.log(`SPOT chat server on :${PORT}`));
