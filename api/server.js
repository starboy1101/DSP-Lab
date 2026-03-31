import { createServer } from 'node:http';
import { DSP_TOOLS } from '../shared/dspCore.js';

const port = Number(process.env.PORT || 3001);
const corsOrigin = process.env.CORS_ORIGIN || '*';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

const defaultArgs = {
  runA1: { freqHz: 1000, fsHz: 48000, amplitude: 0.8, nSamples: 64 },
  runA2: { freqHz: 1000, fsHz: 48000, amplitude: 0.8, nSamples: 64, gain: 1.25 },
  runA3: { freqHz: 1000, fsHz: 48000, nSamples: 64, clipLevel: 0.7 },
  runA4: { freqHz: 1000, fsHz: 48000, amplitude: 0.8, nSamples: 64, B0: 0.2929, B1: 0.2929, A1: 0.4142 }
};

const parseIntent = (message = '') => {
  const m = message.toLowerCase();
  if (m.includes('start')) return { tool: 'controlA7', args: { action: 'start' } };
  if (m.includes('stop')) return { tool: 'controlA7', args: { action: 'stop' } };
  if (m.includes('reset')) return { tool: 'controlA7', args: { action: 'reset' } };
  if (m.includes('clip')) return { tool: 'runA3', args: { clipLevel: 0.6 } };
  if (m.includes('gain')) return { tool: 'runA2', args: { gain: 1.3 } };
  if (m.includes('filter') || m.includes('iir')) return { tool: 'runA4', args: {} };
  return { tool: 'runA1', args: {} };
};

const safeExecute = (tool, args = {}) => {
  const fn = DSP_TOOLS[tool];
  if (!fn) return { ok: false, error: `Unknown tool: ${tool}` };
  try {
    const merged = { ...(defaultArgs[tool] || {}), ...args };
    return { ok: true, data: fn(merged), args: merged };
  } catch (error) {
    return { ok: false, error: error.message };
  }
};

const toToolSchema = (name) => ({
  type: 'function',
  name,
  description: `Run deterministic DSP tool ${name}.`,
  strict: true,
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      freqHz: { type: 'number' },
      fsHz: { type: 'number' },
      amplitude: { type: 'number' },
      nSamples: { type: 'number' },
      gain: { type: 'number' },
      clipLevel: { type: 'number' },
      B0: { type: 'number' },
      B1: { type: 'number' },
      A1: { type: 'number' }
    }
  }
});

const toolsForModel = [
  toToolSchema('runA1'),
  toToolSchema('runA2'),
  toToolSchema('runA3'),
  toToolSchema('runA4'),
  {
    type: 'function',
    name: 'controlA7',
    description: 'Issue real-time control actions for Realtime Audio panel.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['start', 'stop', 'reset', 'run_bench', 'set_mode', 'set_preset', 'set_source', 'toggle_monitor'] },
        mode: { type: 'string', enum: ['gain', 'clip', 'iir', 'designer'] },
        preset: { type: 'string' },
        source: { type: 'string', enum: ['mic', 'file'] },
        monitor: { type: 'boolean' }
      },
      required: ['action']
    }
  }
];

const executeToolCalls = (toolCalls = []) => {
  const control = [];
  const dsp = [];
  for (const call of toolCalls) {
    const name = call?.name;
    const args = call?.arguments || {};
    if (!name) continue;
    if (name === 'controlA7') {
      control.push(args);
      continue;
    }
    const out = safeExecute(name, args);
    if (out.ok) dsp.push({ tool: name, args: out.args, result: out.data });
  }
  return { control, dsp };
};

const callOpenAI = async (message, realtimeState = {}) => {
  if (!process.env.OPENAI_API_KEY) return null;
  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: 'system',
          content:
            'You are DSP Lab Copilot. Prefer tool-calls. Use controlA7 when user asks to start/stop/reset/change realtime audio. Keep responses concise and practical.'
        },
        {
          role: 'user',
          content: `User message: ${message}\nRealtime state: ${JSON.stringify(realtimeState)}`
        }
      ],
      tools: toolsForModel
    })
  });
  if (!resp.ok) throw new Error(`OpenAI request failed: ${resp.status}`);
  const data = await resp.json();
  const outputs = Array.isArray(data.output) ? data.output : [];
  const toolCalls = outputs
    .filter((item) => item?.type === 'function_call')
    .map((item) => ({
      name: item.name,
      arguments: item.arguments ? JSON.parse(item.arguments) : {}
    }));
  const text = outputs
    .filter((item) => item?.type === 'message')
    .flatMap((item) => item.content || [])
    .map((c) => c?.text)
    .filter(Boolean)
    .join('\n')
    .trim();
  return { text, toolCalls, model: data.model };
};

const json = (res, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(body));
};

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });

const server = createServer(async (req, res) => {
  if (!req.url) return json(res, 404, { ok: false, error: 'Not found' });
  if (req.method === 'OPTIONS') return json(res, 204, {});

  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, { ok: true, service: 'dsp-lab-ai-api' });
  }

  if (req.method !== 'POST') return json(res, 404, { ok: false, error: 'Not found' });

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return json(res, 400, { ok: false, error: error.message });
  }

  if (req.url === '/ai/chat') {
    const message = body?.message || '';
    const realtimeState = body?.realtimeState || {};
    const fallback = () => {
      const intent = parseIntent(message);
      if (intent.tool === 'controlA7') {
        return json(res, 200, {
          ok: true,
          provider: 'local-rule',
          model: null,
          controls: [intent.args],
          dsp: [],
          assistant: `Queued realtime action: ${intent.args.action}.`
        });
      }
      const exec = safeExecute(intent.tool, intent.args);
      if (!exec.ok) return json(res, 400, exec);
      return json(res, 200, {
        ok: true,
        provider: 'local-rule',
        model: null,
        controls: [],
        dsp: [{ tool: intent.tool, args: exec.args, result: exec.data }],
        assistant: `Executed ${intent.tool}. Pass=${exec.data.pass ? 'yes' : 'no'}, MAE=${exec.data.mae?.toExponential?.(3) ?? 'n/a'}${exec.data.snr ? `, SNR=${exec.data.snr.toFixed(2)} dB` : ''}.`
      });
    };

    try {
      const ai = await callOpenAI(message, realtimeState);
      if (!ai) return fallback();
      const exec = executeToolCalls(ai.toolCalls);
      return json(res, 200, {
        ok: true,
        provider: 'openai',
        model: ai.model || OPENAI_MODEL,
        controls: exec.control,
        dsp: exec.dsp,
        assistant: ai.text || 'Done. I applied the requested controls and DSP checks.'
      });
    } catch {
      return fallback();
    }
  }

  if (req.url === '/ai/recommend') {
    const goal = (body?.goal || 'maximize_snr').toLowerCase();
    const candidates = [0.7, 0.9, 1.0, 1.15, 1.3, 1.5].map((gain) => {
      const out = safeExecute('runA2', { gain });
      return { gain, ...out.data };
    });
    const sorted = [...candidates].sort((a, b) => (goal.includes('mae') ? a.mae - b.mae : b.snr - a.snr));
    return json(res, 200, { ok: true, goal, top: sorted.slice(0, 3), all: candidates });
  }

  if (req.url === '/ai/testcases/generate') {
    const count = Math.min(100, Math.max(5, Number(body?.count || 20)));
    const tests = Array.from({ length: count }, (_, i) => ({
      id: `edge-${i + 1}`,
      tool: i % 2 === 0 ? 'runA2' : 'runA3',
      args:
        i % 2 === 0
          ? { gain: Number((0.6 + (i % 10) * 0.12).toFixed(2)), nSamples: 64 }
          : { clipLevel: Number((0.3 + (i % 10) * 0.06).toFixed(2)), nSamples: 64 },
      expectation: i % 2 === 0 ? 'mae_below_0.001' : 'pass_true'
    }));
    return json(res, 200, { ok: true, tests });
  }

  if (req.url === '/ai/voice/transcribe') {
    const transcript = body?.transcript || '';
    return json(res, 200, {
      ok: true,
      transcript,
      note: 'Local stub endpoint: wire external STT provider for production.'
    });
  }

  if (req.url === '/ai/voice/speak') {
    const text = body?.text || '';
    return json(res, 200, {
      ok: true,
      text,
      note: 'Use browser SpeechSynthesis locally; wire TTS provider for deployment if needed.'
    });
  }

  return json(res, 404, { ok: false, error: 'Not found' });
});

server.listen(port, () => {
  console.log(`DSP Lab AI API listening on :${port}`);
});
