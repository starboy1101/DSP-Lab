import { createServer } from 'node:http';
import { DSP_TOOLS } from '../shared/dspCore.js';

const port = Number(process.env.PORT || 3001);
const corsOrigin = process.env.CORS_ORIGIN || '*';
const AI_MODEL = process.env.AI_MODEL;
const AI_BASE_URL = process.env.AI_BASE_URL;

const defaultArgs = {
  runA1: { freqHz: 1000, fsHz: 48000, amplitude: 0.8, nSamples: 64 },
  runA2: { freqHz: 1000, fsHz: 48000, amplitude: 0.8, nSamples: 64, gain: 1.25 },
  runA3: { freqHz: 1000, fsHz: 48000, nSamples: 64, clipLevel: 0.7 },
  runA4: { freqHz: 1000, fsHz: 48000, amplitude: 0.8, nSamples: 64, B0: 0.2929, B1: 0.2929, A1: 0.4142 }
};

const normalize = (message = '') => message.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();

const parseControlIntent = (message = '') => {
  const m = normalize(message);
  if (!m) return null;
  if (m.includes('start')) return { tool: 'controlA7', args: { action: 'start' } };
  if (m.includes('stop')) return { tool: 'controlA7', args: { action: 'stop' } };
  if (m.includes('reset')) return { tool: 'controlA7', args: { action: 'reset' } };
    if (m.includes('bench')) return { tool: 'controlA7', args: { action: 'run_bench' } };

  if (m.includes('set mode gain') || m.includes('mode gain')) return { tool: 'controlA7', args: { action: 'set_mode', mode: 'gain' } };
  if (m.includes('set mode clip') || m.includes('mode clip') || m.includes('hard clip')) {
    return { tool: 'controlA7', args: { action: 'set_mode', mode: 'clip' } };
  }
  if (m.includes('set mode iir') || m.includes('mode iir')) return { tool: 'controlA7', args: { action: 'set_mode', mode: 'iir' } };
  if (m.includes('set mode designer') || m.includes('mode designer') || m.includes('set mode filter')) {
    return { tool: 'controlA7', args: { action: 'set_mode', mode: 'designer' } };
  }

  if (m.includes('set lo fi') || m.includes('set lofi') || m.includes('lo fi clip') || m.includes('lofi clip')) {
    return { tool: 'controlA7', args: { action: 'set_preset', preset: 'lofi' } };
  }
  if (m.includes('speech')) return { tool: 'controlA7', args: { action: 'set_preset', preset: 'speech' } };
  if (m.includes('podcast')) return { tool: 'controlA7', args: { action: 'set_preset', preset: 'podcast' } };
  if (m.includes('phone') || m.includes('telephone')) return { tool: 'controlA7', args: { action: 'set_preset', preset: 'phone' } };
  if (m.includes('hum')) return { tool: 'controlA7', args: { action: 'set_preset', preset: 'hum' } };
  if (m.includes('stable')) return { tool: 'controlA7', args: { action: 'set_preset', preset: 'stable' } };
  if (m.includes('bright')) return { tool: 'controlA7', args: { action: 'set_preset', preset: 'bright' } };

  if (m.includes('source mic') || m.includes('use mic') || m.includes('microphone')) {
    return { tool: 'controlA7', args: { action: 'set_source', source: 'mic' } };
  }
  if (m.includes('source file') || m.includes('use file')) return { tool: 'controlA7', args: { action: 'set_source', source: 'file' } };

  if (m.includes('monitor on') || m.includes('unmute monitor')) return { tool: 'controlA7', args: { action: 'toggle_monitor', monitor: true } };
  if (m.includes('monitor off') || m.includes('mute monitor')) return { tool: 'controlA7', args: { action: 'toggle_monitor', monitor: false } };

  return null;
};

const parseIntent = (message = '') => {
  const control = parseControlIntent(message);
  if (control) return control;
  const m = normalize(message);
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

const sameControl = (a = {}, b = {}) =>
  a.action === b.action && a.mode === b.mode && a.preset === b.preset && a.source === b.source && a.monitor === b.monitor;

const mergeToolCalls = (forcedControl, toolCalls = []) => {
  if (!forcedControl) return toolCalls;
  const forcedCall = { name: 'controlA7', arguments: forcedControl.args || {} };
  const hasSame = toolCalls.some((call) => call?.name === 'controlA7' && sameControl(call.arguments || {}, forcedCall.arguments));
  return hasSame ? toolCalls : [forcedCall, ...toolCalls];
};

const describeControl = (args = {}) => {
  if (args.action === 'set_mode' && args.mode) return `Queued realtime action: set_mode (${args.mode}).`;
  if (args.action === 'set_preset' && args.preset) return `Queued realtime action: set_preset (${args.preset}).`;
  if (args.action === 'set_source' && args.source) return `Queued realtime action: set_source (${args.source}).`;
  if (args.action === 'toggle_monitor') return `Queued realtime action: toggle_monitor (${args.monitor ? 'on' : 'off'}).`;
  return `Queued realtime action: ${args.action || 'unknown'}.`;
};

const isQuestionLike = (message = '') => {
  const m = normalize(message);
  return message.includes('?') || /^(why|how|what|when|where|which|can you|could you|explain)\b/.test(m) || m.includes(' explain ');
};

const localQuestionAnswer = (message = '', realtimeState = {}) => {
  const m = normalize(message);
  if (m.includes('distort') || m.includes('clipp')) {
    return 'Distortion usually means clipping or too much gain. Try clip mode with a higher clip level, or reduce gain. If realtime is running, compare input/output levels to confirm overload.';
  }
  if (m.includes('snr')) return 'Higher SNR usually comes from moderate gain, avoiding clipping, and reducing noise (HPF/notch/gate presets can help).';
  if (m.includes('preset')) return 'Use commands like: set lo-fi clip, set podcast preset, or set speech preset. I can also switch mode/source directly.';
  if (realtimeState?.isRunning) return `Realtime is running in ${realtimeState.mode || 'unknown'} mode. Ask me to change mode/preset/source or run a benchmark.`;
  return 'I can answer DSP questions and control realtime audio. Try: "start realtime", "set lo-fi clip", "set mode designer", or ask "why is my signal distorted?"';
};

const callOpenAI = async (message, realtimeState = {}) => {
  if (!process.env.AI_API_KEY) return null;
  const resp = await fetch(`${AI_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.AI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: AI_MODEL,
      input: [
        {
          role: 'system',
          content:
            'You are DSP Lab Copilot. Prefer tool-calls. Use controlA7 for realtime control (start/stop/reset, set_mode, set_preset, set_source, toggle_monitor). If user asks for lo-fi, use set_preset with preset="lofi". If user asks a question, answer it clearly while still issuing needed tool-calls. Keep responses concise and practical.'
        },
        {
          role: 'user',
          content: `User message: ${message}\nRealtime state: ${JSON.stringify(realtimeState)}`
        }
      ],
      tools: toolsForModel
    })
  });
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`AI request failed: ${resp.status}${detail ? ` ${detail}` : ''}`);
  }
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
    const controlIntent = parseControlIntent(message);
    const fallback = () => {
      const intent = parseIntent(message);
      if (intent.tool === 'controlA7' || controlIntent?.tool === 'controlA7') {
        const args = controlIntent?.args || intent.args;
        return json(res, 200, {
          ok: true,
          provider: 'local-rule',
          model: null,
          controls: [args],
          dsp: [],
          assistant: describeControl(args)
        });
      }
      if (isQuestionLike(message)) {
        return json(res, 200, {
          ok: true,
          provider: 'local-rule',
          model: null,
          controls: [],
          dsp: [],
          assistant: localQuestionAnswer(message, realtimeState)
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
      const toolCalls = mergeToolCalls(controlIntent, ai.toolCalls);
      const exec = executeToolCalls(toolCalls);
      return json(res, 200, {
        ok: true,
        provider: 'openai',
        model: ai.model,
        controls: exec.control,
        dsp: exec.dsp,
        assistant: ai.text || (controlIntent ? describeControl(controlIntent.args) : 'Done. I applied the requested controls and DSP checks.')
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