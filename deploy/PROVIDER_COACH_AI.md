# Queless Provider Coach AI

Provider Coach is Gemini-first and always keeps a local rule-based fallback.

Configure these values only in the active backend environment:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=replace-with-server-side-key
GEMINI_MODEL=gemini-2.5-flash-lite
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
PROVIDER_COACH_DAILY_LIMIT=20
```

`GEMINI_API_KEY` must never be added to frontend Vite variables, mobile assets, source control, deployment archives, or logs.

OpenAI remains optional and is used only when `AI_PROVIDER=openai` is explicitly configured. Missing keys, invalid providers, quota limits, network errors, API errors, and empty AI responses automatically use rule-based Provider Coach advice.

After updating the active production backend `.env`:

```bash
cd /var/www/queless.org/current/barber-booking-app/backend
pm2 restart queless-backend --update-env
pm2 save
curl -i https://queless.org/api/health
```

Do not overwrite the production `.env` during source deployment.
