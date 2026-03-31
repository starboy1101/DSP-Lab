import { useMemo, useState } from 'react';

const API_URL = import.meta.env.VITE_AI_API_URL || 'http://localhost:3001';

const shell = {
  border: '1px solid #173422',
  borderRadius: 12,
  background: 'linear-gradient(180deg,#03120a,#020a06)',
  overflow: 'hidden'
};

const bubbleBase = {
  maxWidth: '88%',
  borderRadius: 12,
  padding: '8px 10px',
  lineHeight: 1.4,
  fontSize: 12,
  whiteSpace: 'pre-wrap'
};

export default function AILabView({ floating = false, onControlCommand, realtimeState }) {
  const [message, setMessage] = useState('Start realtime mode, then run gain scenario and explain quality.');
  const [chatOut, setChatOut] = useState(null);
  const [chatLog, setChatLog] = useState([
    {
      role: 'assistant',
      text: 'Hi! I can control A7 in real time (start/stop/reset/mode/preset/source/monitor) and run DSP checks.'
    }
  ]);
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
    if (!message.trim()) return;
    const userText = message.trim();
    setBusy(true);
    setChatLog((prev) => [...prev, { role: 'user', text: userText }]);
    setMessage('');
    try {
      const out = await post('/ai/chat', { message: userText, realtimeState });
      setChatOut(out);
      if (Array.isArray(out.controls) && onControlCommand) out.controls.forEach((c) => onControlCommand(c));
      const details = [];
      if (out.model) details.push(`Model: ${out.model}`);
      if (Array.isArray(out.controls) && out.controls.length) details.push(`Controls: ${out.controls.map((c) => c.action).join(', ')}`);
      if (Array.isArray(out.dsp) && out.dsp.length) details.push(`DSP checks: ${out.dsp.map((d) => d.tool).join(', ')}`);
      setChatLog((prev) => [...prev, { role: 'assistant', text: `${out.assistant}\n${details.join(' · ')}`.trim() }]);
    } catch (error) {
      setChatLog((prev) => [...prev, { role: 'assistant', text: `Error: ${error.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  const runRecommend = async () => {
    setBusy(true);
    try {
      const out = await post('/ai/recommend', { goal });
      setRecommendOut(out);
      setChatLog((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Top recommendations (${goal}): ${out.top.map((r) => `gain ${r.gain} (SNR ${r.snr?.toFixed?.(2)} dB, MAE ${r.mae?.toExponential?.(2)})`).join(' | ')}`
        }
      ]);
    } finally {
      setBusy(false);
    }
  };

  const generateTests = async () => {
    setBusy(true);
    try {
      const out = await post('/ai/testcases/generate', { count: 20 });
      setTestsOut(out);
      setChatLog((prev) => [...prev, { role: 'assistant', text: `Generated ${out.tests?.length || 0} test cases.` }]);
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
    const txt = chatLog.at(-1)?.text;
    if (!txt || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(txt));
  };

  return (
    <div style={{ ...shell, maxHeight: floating ? '72vh' : 'none', display: 'grid', gridTemplateRows: 'auto 1fr auto auto' }}>
      <div style={{ padding: 10, borderBottom: '1px solid #173422', color: '#75f7b0', fontWeight: 700, fontSize: 12 }}>
        AI DSP Copilot Chat
      </div>

      <div style={{ padding: 10, overflowY: 'auto', display: 'grid', gap: 8, minHeight: 220 }}>
        {chatLog.map((item, idx) => (
          <div key={`${item.role}-${idx}`} style={{ display: 'flex', justifyContent: item.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div
              style={{
                ...bubbleBase,
                background: item.role === 'user' ? 'rgba(56,189,248,0.2)' : 'rgba(95,255,160,0.12)',
                border: `1px solid ${item.role === 'user' ? 'rgba(56,189,248,0.55)' : 'rgba(95,255,160,0.35)'}`,
                color: item.role === 'user' ? '#c7eeff' : '#b8f9d2'
              }}
            >
              {item.text}
            </div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px solid #173422', padding: 10, display: 'grid', gap: 8 }}>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder='Type command e.g. "start realtime", "set mode clip", "stop"'
          style={{ width: '100%', background: '#020704', color: '#a8e8c0', border: '1px solid #0f2416', borderRadius: 8, padding: 8 }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={runCopilot} disabled={busy}>Send</button>
          <button onClick={() => setVoiceEnabled((v) => !v)}>{voiceEnabled ? 'Voice ON' : 'Voice OFF'}</button>
          <button onClick={runVoiceInput} disabled={!voiceEnabled || !canUseSpeech}>🎙 Capture</button>
          <button onClick={speak} disabled={!chatLog.length}>🔊 Speak</button>
        </div>
        {!canUseSpeech && <div style={{ color: '#f59e0b', fontSize: 11 }}>SpeechRecognition not available in this browser.</div>}
      </div>

      <div style={{ borderTop: '1px solid #173422', padding: 10, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={goal} onChange={(e) => setGoal(e.target.value)}>
            <option value='maximize_snr'>Maximize SNR</option>
            <option value='minimize_mae'>Minimize MAE</option>
          </select>
          <button onClick={runRecommend} disabled={busy}>Recommend</button>
          <button onClick={generateTests} disabled={busy}>Generate Tests</button>
        </div>
        {(recommendOut || testsOut || chatOut) && (
          <details>
            <summary style={{ cursor: 'pointer', color: '#8dd8ff', fontSize: 11 }}>Debug JSON</summary>
            <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', color: '#8de7b6' }}>
              {JSON.stringify({ chatOut, recommendOut, testsOut }, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
