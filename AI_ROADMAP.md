# DSP Lab AI Implementation (Phase 0–1 Bootstrap)

This repository now includes a bootstrap implementation for:

1. DSP Copilot chat endpoint and UI
2. Voice-agent UX hooks (browser STT + TTS)
3. Recommendation endpoint for tuning gain by SNR/MAE goals
5. AI-generated testcase endpoint + smoke test runner

## Local run

### 1) Install frontend deps
```bash
npm install
```

### 2) Install API deps
```bash
npm install --prefix api
```

### 3) Start both services
```bash
npm run dev:all
```

- Frontend: http://localhost:5173
- API: http://localhost:3001

Set optional API URL in frontend `.env`:
```bash
VITE_AI_API_URL=http://localhost:3001
```

Set optional backend AI provider env in `api/.env`:
```bash
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4.1-mini
```
If no API key is set, `/ai/chat` falls back to local deterministic intent rules.

## Deployment

- Deploy web app to Vercel/Netlify.
- Deploy `api/` to Render/Railway/Fly as a Node service.
- Set `VITE_AI_API_URL` in web deployment to API URL.
- Set `CORS_ORIGIN` in API deployment to web domain.

## API routes

- `GET /health`
- `POST /ai/chat`
- `POST /ai/recommend`
- `POST /ai/testcases/generate`
- `POST /ai/voice/transcribe` (stub)
- `POST /ai/voice/speak` (stub)

## Notes

This keeps deterministic DSP execution (`shared/dspCore.js`) as the trusted path. When `OPENAI_API_KEY` is present, `/ai/chat` uses OpenAI tool-calling and then executes only allowed local DSP/control tools.
