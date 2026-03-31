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

This is intentionally deterministic and local-first: the API currently uses DSP tools directly from `shared/dspCore.js` rather than a remote LLM call, so it can run offline and be deployed immediately. You can layer an LLM provider later while keeping the deterministic tool execution path.
