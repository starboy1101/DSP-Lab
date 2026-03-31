import { DSP_TOOLS } from '../../shared/dspCore.js';

const tests = [
  { tool: 'runA2', args: { freqHz: 1000, fsHz: 48000, amplitude: 0.9, nSamples: 64, gain: 1.1 } },
  { tool: 'runA2', args: { freqHz: 1000, fsHz: 48000, amplitude: 0.9, nSamples: 64, gain: 1.5 } },
  { tool: 'runA3', args: { freqHz: 1000, fsHz: 48000, nSamples: 64, clipLevel: 0.7 } }
];

for (const t of tests) {
  const out = DSP_TOOLS[t.tool](t.args);
  if (!Number.isFinite(out.mae)) {
    throw new Error(`Invalid MAE for ${t.tool}`);
  }
}

console.log(`Generated-case smoke test passed for ${tests.length} cases.`);
