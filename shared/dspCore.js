export const Q15_MAX = 32767;
export const Q15_MIN = -32768;
export const Q15_SCALE = 32768.0;

export const q15Sat = (x) => Math.max(Q15_MIN, Math.min(Q15_MAX, Math.round(x)));
export const bankersRound = (x) => {
  const fl = Math.floor(x);
  const d = x - fl;
  if (d < 0.5) return fl;
  if (d > 0.5) return fl + 1;
  return fl % 2 === 0 ? fl : fl + 1;
};

export const floatToQ15 = (f) => {
  const clamped = Math.max(-1, Math.min(1 - 1 / Q15_SCALE, f));
  return q15Sat(bankersRound(clamped * Q15_SCALE));
};

export const q15ToFloat = (q) => q / Q15_SCALE;
export const q15Mul = (a, b) => q15Sat((a * b + 0x4000) >> 15);

const genSine = (fHz, fs, amp, n) =>
  Array.from({ length: n }, (_, i) => parseFloat((amp * Math.sin(((2 * Math.PI * fHz) / fs) * i)).toFixed(6)));

const snr = (ref, apx) => {
  let s = 0;
  let e = 0;
  ref.forEach((v, i) => {
    s += v * v;
    e += (v - apx[i]) ** 2;
  });
  return e === 0 ? Infinity : 10 * Math.log10(s / e);
};

const mae = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

export const runA1 = ({ freqHz, fsHz, amplitude, nSamples }) => {
  const f = genSine(freqHz, fsHz, amplitude, nSamples);
  const q = f.map(floatToQ15);
  const r = q.map(q15ToFloat);
  return { snr: snr(f, r), mae: mae(f, r), pass: mae(f, r) <= 0.5 / Q15_SCALE + 1e-12 };
};

export const runA2 = ({ freqHz, fsHz, amplitude, nSamples, gain }) => {
  const f = genSine(freqHz, fsHz, amplitude, nSamples);
  const gQ14 = Math.round(gain * (1 << 14));
  const fG = f.map((v) => Math.max(-1, Math.min(1, v * gain)));
  const qIn = f.map(floatToQ15);
  const qOut = qIn.map((x) => q15Sat((x * gQ14 + (1 << 13)) >> 14));
  const r = qOut.map(q15ToFloat);
  return { snr: snr(fG, r), mae: mae(fG, r), pass: mae(fG, r) < 2 / Q15_SCALE, gainQ14: gQ14 };
};

export const runA3 = ({ freqHz, fsHz, nSamples, clipLevel }) => {
  const f = genSine(freqHz, fsHz, 1.0, nSamples);
  const cP = Math.round(clipLevel * Q15_SCALE + 0.5);
  const cN = Math.round(-clipLevel * Q15_SCALE - 0.5);
  const fC = f.map((v) => Math.max(-clipLevel, Math.min(clipLevel, v)));
  const qIn = f.map(floatToQ15);
  const qC = qIn.map((x) => Math.max(cN, Math.min(cP, x)));
  const r = qC.map(q15ToFloat);
  return { mae: mae(fC, r), pass: mae(fC, r) < 2 / Q15_SCALE, clipPos: cP, clipNeg: cN };
};

export const runA4 = ({ freqHz, fsHz, amplitude, nSamples, B0, B1, A1 }) => {
  const f = genSine(freqHz, fsHz, amplitude, nSamples);
  let x1f = 0;
  let y1f = 0;
  const fOut = f.map((x) => {
    const y = B0 * x + B1 * x1f - A1 * y1f;
    x1f = x;
    y1f = y;
    return y;
  });
  const B0q = floatToQ15(B0);
  const B1q = floatToQ15(B1);
  const A1q = floatToQ15(-A1);
  let x1q = 0;
  let y1q = 0;
  const qF = [];
  f.forEach((v) => {
    const xq = floatToQ15(v);
    const yq = q15Sat(q15Mul(B0q, xq) + q15Mul(B1q, x1q) + q15Mul(A1q, y1q));
    qF.push(q15ToFloat(yq));
    x1q = xq;
    y1q = yq;
  });
  return { snr: snr(fOut, qF), mae: mae(fOut, qF), pass: snr(fOut, qF) > 60 };
};

export const DSP_TOOLS = { runA1, runA2, runA3, runA4 };
