import express from 'express';
import cors from 'cors';
import { DSP_TOOLS } from '../shared/dspCore.js';

const app = express();
const port = process.env.PORT || 3001;
const corsOrigin = process.env.CORS_ORIGIN || '*';

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '1mb' }));

const defaultArgs = {
  runA1: { freqHz: 1000, fsHz: 48000, amplitude: 0.8, nSamples: 64 },
  runA2: { freqHz: 1000, fsHz: 48000, amplitude: 0.8, nSamples: 64, gain: 1.25 },
  runA3: { freqHz: 1000, fsHz: 48000, nSamples: 64, clipLevel: 0.7 },
  runA4: { freqHz: 1000, fsHz: 48000, amplitude: 0.8, nSamples: 64, B0: 0.2929, B1: 0.2929, A1: 0.4142 }
};

const safeExecute = (tool, args = {}) => {
  const fn = DSP_TOOLS[tool];
  if (!fn) {
    return { ok: false, error: `Unknown tool: ${tool}` };
  }
  try {
    const merged = { ...(defaultArgs[tool] || {}), ...args };
    return { ok: true, data: fn(merged), args: merged };
  } catch (error) {
    return { ok: false, error: error.message };
  }
};

const parseIntent = (message = '') => {
  const m = message.toLowerCase();
  if (m.includes('clip')) return { tool: 'runA3', args: { clipLevel: 0.6 } };
  if (m.includes('gain')) return { tool: 'runA2', args: { gain: 1.3 } };
  if (m.includes('filter') || m.includes('iir')) return { tool: 'runA4', args: {} };
  return { tool: 'runA1', args: {} };
};

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'dsp-lab-ai-api' });
});

app.post('/ai/chat', (req, res) => {
  const message = req.body?.message || '';
  const intent = parseIntent(message);
  const exec = safeExecute(intent.tool, intent.args);
  if (!exec.ok) return res.status(400).json(exec);

  res.json({
    ok: true,
    intent,
    result: exec.data,
    assistant: `Executed ${intent.tool}. Pass=${exec.data.pass ? 'yes' : 'no'}, MAE=${exec.data.mae?.toExponential?.(3) ?? 'n/a'}${exec.data.snr ? `, SNR=${exec.data.snr.toFixed(2)} dB` : ''}.`
  });
});

app.post('/ai/recommend', (req, res) => {
  const goal = (req.body?.goal || 'maximize_snr').toLowerCase();
  const candidates = [0.7, 0.9, 1.0, 1.15, 1.3, 1.5].map((gain) => {
    const out = safeExecute('runA2', { gain });
    return { gain, ...out.data };
  });
  const sorted = [...candidates].sort((a, b) => goal.includes('mae') ? a.mae - b.mae : b.snr - a.snr);
  res.json({ ok: true, goal, top: sorted.slice(0, 3), all: candidates });
});

app.post('/ai/testcases/generate', (req, res) => {
  const count = Math.min(100, Math.max(5, Number(req.body?.count || 20)));
  const tests = Array.from({ length: count }, (_, i) => ({
    id: `edge-${i + 1}`,
    tool: i % 2 === 0 ? 'runA2' : 'runA3',
    args: i % 2 === 0
      ? { gain: Number((0.6 + (i % 10) * 0.12).toFixed(2)), nSamples: 64 }
      : { clipLevel: Number((0.3 + (i % 10) * 0.06).toFixed(2)), nSamples: 64 },
    expectation: i % 2 === 0 ? 'mae_below_0.001' : 'pass_true'
  }));
  res.json({ ok: true, tests });
});

app.post('/ai/voice/transcribe', (req, res) => {
  const transcript = req.body?.transcript || '';
  res.json({ ok: true, transcript, note: 'Local stub endpoint: wire external STT provider for production.' });
});

app.post('/ai/voice/speak', (req, res) => {
  const text = req.body?.text || '';
  res.json({ ok: true, text, note: 'Use browser SpeechSynthesis locally; wire TTS provider for deployment if needed.' });
});

app.listen(port, () => {
  console.log(`DSP Lab AI API listening on :${port}`);
});
