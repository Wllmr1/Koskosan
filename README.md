# chatbotDEMO

WhatsApp customer-service chatbot powered by Claude. A small Express backend answers
customer questions using a per-business "knowledge base" file, then replies either through
the WhatsApp Business Cloud API or through the included browser demo.

## Structure

- `backend/` — Express server
  - `server.js` — entry point
  - `routes/webhook.js` — WhatsApp Cloud API webhook (verification + incoming messages)
  - `routes/chat.js` — `POST /chat` used by the local browser demo
  - `lib/claude.js` — calls the Claude API
  - `lib/whatsapp.js` — sends replies via the WhatsApp Cloud API
  - `lib/sessionStore.js` — in-memory per-user conversation history (resets on restart)
  - `knowledge/*.md` — business info the bot answers from; pick one with `ACTIVE_BUSINESS`
- `frontend/` — static browser chat UI for local testing (talks to `POST /chat`)

## Setup

```bash
cd backend
npm install
cp .env.example .env
```

Fill in `.env`:

- `ANTHROPIC_API_KEY` — from https://console.anthropic.com
- `ACTIVE_BUSINESS` — name of a file in `backend/knowledge/` (without `.md`), e.g. `restaurant` or `kos`
- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` — only needed once you connect a real WhatsApp Business Cloud API app (see below)

Run it:

```bash
node server.js
```

## Try it locally (no WhatsApp needed)

Open `frontend/index.html` in a browser — it talks to `POST http://localhost:3000/chat`.

## Connecting to WhatsApp

1. Create a Meta developer account and a WhatsApp Business app at https://developers.facebook.com.
2. Get a temporary (or permanent, via System User) access token and the test phone number's `Phone Number ID`.
3. Deploy this backend somewhere with a public HTTPS URL (or tunnel `localhost:3000` with a tool like ngrok while testing).
4. In the Meta app's WhatsApp > Configuration page, set the webhook URL to `https://<your-domain>/webhook` and the verify token to whatever you set as `WHATSAPP_VERIFY_TOKEN`.
5. Subscribe the webhook to the `messages` field.

Once connected, incoming WhatsApp messages hit `POST /webhook`, get answered by Claude using the active `knowledge/*.md` file, and the reply is sent back through the WhatsApp Cloud API.

## Editing what the bot knows

Edit the relevant file under `backend/knowledge/`. There's no retraining step — the file's
content is fed to Claude as context on every message, so changes take effect on the next
message (after a server restart).
