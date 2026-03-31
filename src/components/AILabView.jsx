import { useMemo, useState } from 'react';

const API_URL = import.meta.env.VITE_AI_API_URL || 'http://localhost:3001';

const section = {
  border: '1px solid #0f2416',
  borderRadius: 8,
  padding: 12,
  background: '#040d07'
};

export default function AILabView() {
  const [message, setMessage] = useState('Run gain scenario and explain if quality is acceptable.');
  const [chatOut, setChatOut] = useState(null);
  const [goal, setGoal] = useState('maximize_snr');
  const [recommendOut, setRecommendOut] = useState(null);
  const [testsOut, setTestsOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  const canUseSpeech = useMemo(() => typeof window !== 'undefined' && 'webkitSpeechRecognition' in window, []);

  const post = async (path, body) => {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };

  const runCopilot = async () => {
    setBusy(true);
    try {
      const out = await post('/ai/chat', { message });
      setChatOut(out);
    } finally {
      setBusy(false);
    }
  };

  const runRecommend = async () => {
    setBusy(true);
    try {
      const out = await post('/ai/recommend', { goal });
      setRecommendOut(out);
    } finally {
      setBusy(false);
    }
  };

  const generateTests = async () => {
    setBusy(true);
    try {
      const out = await post('/ai/testcases/generate', { count: 20 });
      setTestsOut(out);
    } finally {
      setBusy(false);
    }
  };

  const runVoiceInput = () => {
    if (!canUseSpeech) return;
    const SR = window.webkitSpeechRecognition;
    const r = new SR();
    r.lang = 'en-US';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (event) => {
      const text = event.results?.[0]?.[0]?.transcript || '';
      setMessage(text);
    };
    r.start();
  };

  const speak = () => {
    if (!chatOut?.assistant || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(chatOut.assistant));
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={section}>
        <div style={{ color: '#5fffa0', fontWeight: 700, marginBottom: 6 }}>AI DSP Copilot (Idea #1)</div>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} style={{ width: '100%', background: '#020704', color: '#a8e8c0', border: '1px solid #0f2416', borderRadius: 6, padding: 8 }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button onClick={runCopilot} disabled={busy}>Run Copilot</button>
          <button onClick={() => setVoiceEnabled((v) => !v)}>{voiceEnabled ? 'Voice ON' : 'Voice OFF'} (Idea #2)</button>
          <button onClick={runVoiceInput} disabled={!voiceEnabled || !canUseSpeech}>🎙 Capture Voice</button>
          <button onClick={speak} disabled={!chatOut}>🔊 Speak Result</button>
        </div>
        {!canUseSpeech && <div style={{ color: '#f59e0b', marginTop: 6 }}>SpeechRecognition not available in this browser.</div>}
        {chatOut && <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{JSON.stringify(chatOut, null, 2)}</pre>}
      </div>

      <div style={section}>
        <div style={{ color: '#5fffa0', fontWeight: 700, marginBottom: 6 }}>Auto-Tuning Recommendations (Idea #3)</div>
        <select value={goal} onChange={(e) => setGoal(e.target.value)}>
          <option value='maximize_snr'>Maximize SNR</option>
          <option value='minimize_mae'>Minimize MAE</option>
        </select>
        <button onClick={runRecommend} disabled={busy} style={{ marginLeft: 8 }}>Run Recommendation</button>
        {recommendOut && <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{JSON.stringify(recommendOut, null, 2)}</pre>}
      </div>

      <div style={section}>
        <div style={{ color: '#5fffa0', fontWeight: 700, marginBottom: 6 }}>AI Generated Test Cases (Idea #5)</div>
        <button onClick={generateTests} disabled={busy}>Generate Cases</button>
        {testsOut && <pre style={{ marginTop: 8, maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(testsOut, null, 2)}</pre>}
      </div>
    </div>
  );
}
