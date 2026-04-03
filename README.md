# Retell Swedish Agent Scaffold

This repo now contains a safe Retell scaffold for a Swedish multi-state voice agent.

It does not implement an abusive or harassing persona. The agent starts first, speaks Swedish, stays direct, and challenges weak reasoning without insulting the caller.

## Files

- `src/create-swedish-agent.mjs`: creates a Swedish multi-state Retell LLM and attaches it to a voice agent.
- `src/find-agent-by-name.mjs`: finds an existing agent by name and prints its id plus voice settings.
- `src/get-agent-voice-config.mjs`: retrieves voice settings from an existing Retell agent so you can reuse the same voice profile.
- `src/grok-server.mjs`: runs a Retell custom-LLM websocket bridge backed by xAI Grok.
- `src/switch-agent-to-grok.mjs`: updates an existing Retell agent to use the custom-LLM websocket bridge.

## Setup

1. Rotate the API key you pasted into chat and create a fresh one in Retell.
2. Copy `.env.example` to `.env`.
3. Put the new key into `RETELL_API_KEY`.
4. Install dependencies:

```bash
npm install
```

## Reuse `Contentor Test Agent` voice settings

If you only know the agent name, run:

```bash
npm run agent:find -- "Contentor Test Agent"
```

If you already know the agent id for `Contentor Test Agent`, run:

```bash
npm run agent:voice -- <agent_id>
```

Both commands print the current voice settings and ready-to-paste `.env` lines.

## Create the Swedish agent

After filling in `RETELL_VOICE_ID` and any optional voice settings:

```bash
npm run agent:create
```

The script prints the created `llm_id` and `agent_id`.

## Notes

- Retell language should be `sv-SE`.
- The prompt still explicitly forces Swedish, because Retell's language setting affects STT/TTS behavior but does not itself force the model to answer in that language.
- If you want a different safe persona, edit the prompt and states in `src/create-swedish-agent.mjs`.

## Using Grok Instead Of Retell LLM

Retell does not expose Grok as a built-in `retell-llm` model choice in the current SDK model list. The working path is Retell `custom-llm`, where Retell streams the call transcript to your websocket server and your server calls xAI.

This repo now includes that bridge.

1. Add `XAI_API_KEY` to `.env`.
2. Start the bridge locally:

```bash
npm install
npm run grok:start
```

3. Expose the server publicly as `wss://<your-domain>/llm-websocket/`.
4. Put that URL into `RETELL_LLM_WEBSOCKET_URL`.
5. Switch the existing agent to custom LLM:

```bash
npm run agent:switch-grok -- <agent_id>
```

### Important

- Retell must be able to reach your websocket server over `wss://`.
- The bridge keeps the same Swedish persona prompt and reuses the current node prompts as a local heuristic state machine.
- If you want production use, deploy the bridge instead of relying on localhost plus tunneling.

## Stable Public Hosting On Render

This repo now includes [render.yaml](c:\Users\mohammed.a\source\repos\RetellTjafs\render.yaml) and a [Dockerfile](c:\Users\mohammed.a\source\repos\RetellTjafs\Dockerfile) so the Grok bridge can live on a real public host instead of your machine.

Why Render:

- It supports normal long-lived Node web services and inbound WebSockets.
- It is a better fit for this bridge than serverless platforms like Vercel Functions.
- The app already exposes a health check at `/healthz`, which Render can use directly.

### Fast path

1. Push this repo to GitHub.
2. In Render, create a new Blueprint or Web Service from the repo.
3. Use the values from `render.yaml`.
4. Set these secrets in Render:
   - `XAI_API_KEY`
   - `RETELL_API_KEY`
   - `RETELL_AGENT_ID`
5. Deploy.

Render will give you a URL like:

```text
https://retell-grok-bridge.onrender.com
```

Your Retell custom LLM websocket URL should then be:

```text
wss://retell-grok-bridge.onrender.com/llm-websocket/
```

### Repoint the Retell agent

After deployment, update [`.env`](c:\Users\mohammed.a\source\repos\RetellTjafs\.env):

```env
RETELL_LLM_WEBSOCKET_URL=wss://retell-grok-bridge.onrender.com/llm-websocket/
RETELL_AGENT_ID=agent_397cf65b7e743c212dd8d3236f
```

Then run:

```bash
npm run agent:switch-grok -- <agent_id>
```

### Recommendation

Use Render `starter`, not `free`, for this agent. Free-tier sleeping and cold starts are the wrong failure mode for a voice-call websocket bridge.
