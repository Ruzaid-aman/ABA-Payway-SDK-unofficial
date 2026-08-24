import { readFileSync } from 'node:fs';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const t0 = Date.now();
const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${process.env.PAYWAY_AGENT_API_KEY}`,
  },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    model: 'google/gemma-4-31b-it',
    chat_template_kwargs: { enable_thinking: false },
    max_tokens: 16,
    stream: false,
    temperature: 1,
    top_p: 0.95,
  }),
});
const data: any = await response.json();
console.log('HTTP', response.status, 'latency', Date.now() - t0, 'ms');
console.log('content:', JSON.stringify(data.choices?.[0]?.message?.content));
console.log('reasoning:', JSON.stringify(data.choices?.[0]?.message?.reasoning_content)?.slice(0, 200));
console.log('usage:', JSON.stringify(data.usage));
