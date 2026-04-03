import "dotenv/config";
import express from "express";
import expressWs from "express-ws";
import OpenAI from "openai";
import Retell from "retell-sdk";
import { buildGeneralPrompt, buildStates } from "./create-swedish-agent.mjs";

const DEFAULT_PORT = 3000;
const DEFAULT_GROK_MODEL = "grok-4.20";
const DEFAULT_XAI_BASE_URL = "https://api.x.ai/v1";
const DEFAULT_BEGIN_MESSAGE = "Jaha. Vad gäller det, mer exakt?";
const DEFAULT_REMINDER = "Jaha. Fortsätt då, men gärna mer konkret den här gången.";

const sessions = new Map();
const states = buildStates();
const statesByName = new Map(states.map((state) => [state.name, state]));

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optional(name, fallback) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

function normalizeText(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "");
}

function lastUserUtterance(transcript) {
  return [...transcript]
    .reverse()
    .find((item) => item?.role === "user" && typeof item.content === "string");
}

function transcriptToMessages(transcript, interactionType) {
  const messages = transcript
    .filter((item) => (item?.role === "user" || item?.role === "agent") && typeof item.content === "string")
    .map((item) => ({
      role: item.role === "agent" ? "assistant" : "user",
      content: item.content
    }));

  if (interactionType === "reminder_required") {
    messages.push({
      role: "user",
      content:
        "Användaren har blivit tyst. Svara med en mycket kort, torr påminnelse och be dem fortsätta mer konkret."
    });
  }

  return messages;
}

function isClosingIntent(text) {
  const value = normalizeText(text);
  return /(hejd[ao]|adj[oö]|bye|det var allt|det ar allt|det räcker|det racker|avsluta|lagg pa|lägg på|klart nu|vi ar klara|vi är klara)/.test(
    value
  );
}

function isVague(text) {
  const value = normalizeText(text);
  const short = value.trim().length < 26;
  const vagueTerms =
    /(typ|liksom|grej|grejer|sadar|sa dar|nagot|nagot sant|lite sa|du vet|whatever|alltsa|ass[aå])/.test(
      value
    );

  return short || vagueTerms;
}

function isMessy(text) {
  const value = normalizeText(text);
  const conjunctionCount = (value.match(/\b(och|men|fast|eller|sa|så|for|för)\b/g) || []).length;
  const punctuationCount = (value.match(/[,:;]/g) || []).length;
  return conjunctionCount >= 4 || punctuationCount >= 4;
}

function isExaggerated(text) {
  const value = normalizeText(text);
  return /\b(alltid|aldrig|ingen|alla|helt|totalt|sjukt|extremt|bokstavligen)\b/.test(value);
}

function buildSystemPrompt(stateName) {
  const state = statesByName.get(stateName) ?? statesByName.get("opening");

  return `${buildGeneralPrompt()}

Aktiv nod: ${state.name}
Nodens uppgift:
${state.state_prompt}

Ytterligare driftregler:
- Följ den aktiva noden strikt.
- Håll normalt svaret till högst två meningar.
- Fråga hellre efter förtydligande än att gissa.
- Om användaren vill avsluta ska du avsluta kort och effektivt.
- Om underlaget är svagt ska du säga det, torrt och korrekt.`;
}

function nextStateFromSession(currentState, latestUserText) {
  if (!latestUserText) {
    return currentState || "opening";
  }

  if (isClosingIntent(latestUserText)) {
    return "wrap_up";
  }

  if (!currentState || currentState === "opening") {
    return "intake";
  }

  if (currentState === "intake") {
    return isVague(latestUserText) || isMessy(latestUserText) ? "scope_control" : "separate_claims";
  }

  if (currentState === "scope_control") {
    return isVague(latestUserText) || isMessy(latestUserText) ? "reformulate" : "separate_claims";
  }

  if (currentState === "separate_claims") {
    if (isVague(latestUserText) || isMessy(latestUserText)) {
      return "reformulate";
    }

    return isExaggerated(latestUserText) ? "pressure_test" : "deliver_answer";
  }

  if (currentState === "pressure_test") {
    return isVague(latestUserText) ? "reformulate" : "deliver_answer";
  }

  if (currentState === "reformulate") {
    return isVague(latestUserText) || isMessy(latestUserText) ? "reformulate" : "separate_claims";
  }

  if (currentState === "deliver_answer") {
    return isExaggerated(latestUserText) ? "pressure_test" : "separate_claims";
  }

  return currentState;
}

function getSession(callId) {
  const existing = sessions.get(callId);
  if (existing) {
    return existing;
  }

  const created = {
    callId,
    currentState: "opening"
  };

  sessions.set(callId, created);
  return created;
}

function sendRetellResponse(ws, payload) {
  ws.send(JSON.stringify(payload));
}

function renderTestPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Retell Grok Test</title>
    <style>
      :root {
        --bg: #0d1117;
        --panel: #161b22;
        --panel-2: #1f2630;
        --text: #e6edf3;
        --muted: #9fb0c0;
        --accent: #6cb6ff;
        --accent-2: #8bffb0;
        --danger: #ff8e8e;
        --border: rgba(255, 255, 255, 0.08);
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top, rgba(108, 182, 255, 0.12), transparent 32%),
          linear-gradient(180deg, #0a0f14, var(--bg));
        color: var(--text);
      }

      .wrap {
        max-width: 980px;
        margin: 0 auto;
        padding: 32px 20px 56px;
      }

      .hero {
        display: grid;
        gap: 12px;
        margin-bottom: 24px;
      }

      .eyebrow {
        font-size: 12px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--accent);
      }

      h1 {
        margin: 0;
        font-size: clamp(28px, 4vw, 46px);
        line-height: 1.05;
      }

      .sub {
        margin: 0;
        max-width: 780px;
        color: var(--muted);
        line-height: 1.6;
      }

      .grid {
        display: grid;
        grid-template-columns: 1.1fr 0.9fr;
        gap: 18px;
      }

      .card {
        background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 18px;
        backdrop-filter: blur(10px);
        box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
      }

      .controls {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin: 18px 0;
      }

      button {
        border: 0;
        border-radius: 999px;
        padding: 12px 18px;
        font: inherit;
        cursor: pointer;
        color: #05111d;
        background: linear-gradient(135deg, var(--accent), #a9d1ff);
      }

      button.secondary {
        color: var(--text);
        background: var(--panel-2);
        border: 1px solid var(--border);
      }

      button:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }

      .status {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(108, 182, 255, 0.08);
        color: var(--muted);
        font-size: 14px;
      }

      .dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--accent);
      }

      .dot.live { background: var(--accent-2); }
      .dot.err { background: var(--danger); }

      .kv {
        display: grid;
        gap: 10px;
        margin-top: 14px;
      }

      .row {
        display: grid;
        grid-template-columns: 140px 1fr;
        gap: 14px;
        padding: 10px 0;
        border-bottom: 1px solid var(--border);
      }

      .row:last-child { border-bottom: 0; }

      .label {
        color: var(--muted);
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .value {
        word-break: break-word;
      }

      .log {
        min-height: 360px;
        max-height: 520px;
        overflow: auto;
        padding: 14px;
        border-radius: 14px;
        background: rgba(0, 0, 0, 0.24);
        border: 1px solid var(--border);
        display: grid;
        gap: 10px;
      }

      .msg {
        padding: 12px 14px;
        border-radius: 14px;
        line-height: 1.45;
      }

      .msg.agent {
        background: rgba(108, 182, 255, 0.1);
        border: 1px solid rgba(108, 182, 255, 0.18);
      }

      .msg.user {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .msg.meta {
        background: rgba(139, 255, 176, 0.06);
        border: 1px solid rgba(139, 255, 176, 0.14);
        color: var(--muted);
        font-size: 14px;
      }

      .metahead {
        margin-bottom: 4px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--muted);
      }

      @media (max-width: 860px) {
        .grid { grid-template-columns: 1fr; }
        .row { grid-template-columns: 1fr; gap: 8px; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <section class="hero">
        <div class="eyebrow">Retell + Grok</div>
        <h1>Swedish Uptight Agent</h1>
        <p class="sub">
          Local test console for the published Grok-backed Retell voice agent. Start a call from this page,
          grant microphone access, and verify the live behavior without wiring a separate frontend first.
        </p>
      </section>

      <div class="grid">
        <section class="card">
          <div id="status" class="status"><span class="dot"></span><span>Loading agent status...</span></div>
          <div class="controls">
            <button id="startBtn">Start Call</button>
            <button id="stopBtn" class="secondary" disabled>Stop Call</button>
          </div>
          <div class="kv">
            <div class="row"><div class="label">Agent</div><div id="agentName" class="value">-</div></div>
            <div class="row"><div class="label">Agent ID</div><div id="agentId" class="value">-</div></div>
            <div class="row"><div class="label">Published Version</div><div id="agentVersion" class="value">-</div></div>
            <div class="row"><div class="label">Call ID</div><div id="callId" class="value">-</div></div>
            <div class="row"><div class="label">Engine</div><div id="engine" class="value">-</div></div>
          </div>
        </section>

        <section class="card">
          <div class="metahead">Live Transcript</div>
          <div id="log" class="log">
            <div class="msg meta">No call yet.</div>
          </div>
        </section>
      </div>
    </div>

    <script type="module">
      import { RetellWebClient } from "https://esm.sh/retell-client-js-sdk";

      const retellWebClient = new RetellWebClient();
      const els = {
        status: document.getElementById("status"),
        startBtn: document.getElementById("startBtn"),
        stopBtn: document.getElementById("stopBtn"),
        agentName: document.getElementById("agentName"),
        agentId: document.getElementById("agentId"),
        agentVersion: document.getElementById("agentVersion"),
        callId: document.getElementById("callId"),
        engine: document.getElementById("engine"),
        log: document.getElementById("log")
      };

      let activeCallId = "";

      function setStatus(text, mode = "idle") {
        const dotClass = mode === "live" ? "dot live" : mode === "err" ? "dot err" : "dot";
        els.status.innerHTML = '<span class="' + dotClass + '"></span><span>' + text + '</span>';
      }

      function appendMessage(kind, content, label = "") {
        const item = document.createElement("div");
        item.className = "msg " + kind;
        item.innerHTML = label ? '<div class="metahead">' + label + "</div>" : "";
        item.append(document.createTextNode(content));
        if (els.log.firstElementChild?.textContent === "No call yet.") {
          els.log.innerHTML = "";
        }
        els.log.appendChild(item);
        els.log.scrollTop = els.log.scrollHeight;
      }

      async function loadStatus() {
        const response = await fetch("/api/agent-status");
        const data = await response.json();
        els.agentName.textContent = data.agent_name;
        els.agentId.textContent = data.agent_id;
        els.agentVersion.textContent = String(data.published_version);
        els.engine.textContent = data.response_engine.type;
        setStatus("Ready", "idle");
      }

      async function startCall() {
        els.startBtn.disabled = true;
        setStatus("Creating web call...", "idle");

        const response = await fetch("/api/create-web-call", { method: "POST" });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || "Failed to create web call.");
        }

        const call = await response.json();
        activeCallId = call.call_id;
        els.callId.textContent = activeCallId;
        await retellWebClient.startCall({ accessToken: call.access_token });
      }

      function stopCall() {
        retellWebClient.stopCall();
      }

      retellWebClient.on("call_started", () => {
        setStatus("Call live", "live");
        els.startBtn.disabled = true;
        els.stopBtn.disabled = false;
        appendMessage("meta", "Call connected.", "Session");
      });

      retellWebClient.on("call_ended", () => {
        setStatus("Call ended", "idle");
        els.startBtn.disabled = false;
        els.stopBtn.disabled = true;
        appendMessage("meta", "Call ended.", "Session");
      });

      retellWebClient.on("agent_start_talking", () => {
        setStatus("Agent talking", "live");
      });

      retellWebClient.on("agent_stop_talking", () => {
        setStatus("Listening", "live");
      });

      retellWebClient.on("update", (update) => {
        const transcript = update?.transcript || [];
        if (!Array.isArray(transcript) || transcript.length === 0) {
          return;
        }

        const last = transcript[transcript.length - 1];
        if (!last?.content || !last?.role) {
          return;
        }

        appendMessage(last.role === "agent" ? "agent" : "user", last.content, last.role);
      });

      retellWebClient.on("error", (error) => {
        setStatus("Call error", "err");
        els.startBtn.disabled = false;
        els.stopBtn.disabled = true;
        appendMessage("meta", String(error?.message || error), "Error");
        retellWebClient.stopCall();
      });

      els.startBtn.addEventListener("click", async () => {
        try {
          await startCall();
        } catch (error) {
          setStatus("Failed to start", "err");
          els.startBtn.disabled = false;
          appendMessage("meta", String(error.message || error), "Error");
        }
      });

      els.stopBtn.addEventListener("click", stopCall);

      loadStatus().catch((error) => {
        setStatus("Status load failed", "err");
        appendMessage("meta", String(error.message || error), "Error");
      });
    </script>
  </body>
</html>`;
}

async function getPublishedAgent(retellClient, agentId) {
  const versions = await retellClient.agent.getVersions(agentId);
  const published = versions
    .filter((version) => version.is_published)
    .sort((left, right) => right.version - left.version)[0];

  if (!published) {
    throw new Error(`No published version found for agent ${agentId}.`);
  }

  return published;
}

async function streamGrokResponse({
  client,
  callId,
  stateName,
  request,
  ws,
  model,
  temperature
}) {
  const messages = [
    {
      role: "system",
      content: buildSystemPrompt(stateName)
    },
    ...transcriptToMessages(request.transcript ?? [], request.interaction_type)
  ];

  const shouldEndCall =
    stateName === "wrap_up" &&
    isClosingIntent(lastUserUtterance(request.transcript ?? [])?.content ?? "");

  const completion = await client.chat.completions.create(
    {
      model,
      temperature,
      stream: true,
      messages
    },
    {
      headers: {
        "x-grok-conv-id": callId
      }
    }
  );

  let emittedText = false;

  for await (const chunk of completion) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (!delta) {
      continue;
    }

    emittedText = true;
    sendRetellResponse(ws, {
      response_id: request.response_id,
      content: delta,
      content_complete: false,
      end_call: false
    });
  }

  if (!emittedText) {
    sendRetellResponse(ws, {
      response_id: request.response_id,
      content: "Jaha. Det där räckte fortfarande inte som underlag.",
      content_complete: false,
      end_call: false
    });
  }

  sendRetellResponse(ws, {
    response_id: request.response_id,
    content: "",
    content_complete: true,
    end_call: shouldEndCall
  });
}

async function main() {
  const xAiApiKey = required("XAI_API_KEY");
  const retellApiKey = required("RETELL_API_KEY");
  const retellAgentId = required("RETELL_AGENT_ID");
  const host = optional("HOST", "0.0.0.0");
  const port = clampNumber(process.env.PORT, 1, 65535, DEFAULT_PORT);
  const model = optional("GROK_MODEL", DEFAULT_GROK_MODEL);
  const beginMessage = optional("GROK_BEGIN_MESSAGE", DEFAULT_BEGIN_MESSAGE);
  const reminderMessage = optional("GROK_REMINDER_MESSAGE", DEFAULT_REMINDER);
  const temperature = clampNumber(process.env.GROK_TEMPERATURE, 0, 2, 0.2);

  const grokClient = new OpenAI({
    apiKey: xAiApiKey,
    baseURL: optional("XAI_BASE_URL", DEFAULT_XAI_BASE_URL)
  });
  const retellClient = new Retell({ apiKey: retellApiKey });

  const app = express();
  expressWs(app);
  app.use(express.json());

  app.get("/healthz", (_req, res) => {
    res.json({
      ok: true,
      model,
      states: states.map((state) => state.name)
    });
  });

  app.get("/", (_req, res) => {
    res.redirect("/test");
  });

  app.get("/test", (_req, res) => {
    res.type("html").send(renderTestPage());
  });

  app.get("/api/agent-status", async (_req, res) => {
    try {
      const published = await getPublishedAgent(retellClient, retellAgentId);
      res.json({
        agent_id: published.agent_id,
        agent_name: published.agent_name,
        published_version: published.version,
        response_engine: published.response_engine
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/create-web-call", async (_req, res) => {
    try {
      const published = await getPublishedAgent(retellClient, retellAgentId);
      const webCall = await retellClient.call.createWebCall({
        agent_id: published.agent_id,
        agent_version: published.version,
        metadata: {
          source: "local-grok-test-page"
        }
      });

      res.json({
        call_id: webCall.call_id,
        access_token: webCall.access_token,
        agent_id: webCall.agent_id,
        agent_version: webCall.agent_version
      });
    } catch (error) {
      res.status(500).send(error.message);
    }
  });

  app.ws("/llm-websocket/:call_id", (ws, req) => {
    const callId = req.params.call_id;
    const session = getSession(callId);

    sendRetellResponse(ws, {
      response_id: 0,
      content: beginMessage,
      content_complete: true,
      end_call: false
    });

    ws.on("message", async (raw, isBinary) => {
      if (isBinary) {
        ws.close(1002, "Binary messages are not supported.");
        return;
      }

      let request;
      try {
        request = JSON.parse(raw.toString());
      } catch (error) {
        console.error("Failed to parse Retell websocket message:", error);
        ws.close(1002, "Cannot parse incoming message.");
        return;
      }

      if (request.interaction_type === "update_only") {
        return;
      }

      if (request.interaction_type === "reminder_required") {
        sendRetellResponse(ws, {
          response_id: request.response_id,
          content: reminderMessage,
          content_complete: true,
          end_call: false
        });
        return;
      }

      try {
        const latestUserText = lastUserUtterance(request.transcript ?? [])?.content ?? "";
        session.currentState = nextStateFromSession(session.currentState, latestUserText);

        await streamGrokResponse({
          client: grokClient,
          callId,
          stateName: session.currentState,
          request,
          ws,
          model,
          temperature
        });
      } catch (error) {
        console.error("Grok bridge failed:", error);
        sendRetellResponse(ws, {
          response_id: request.response_id,
          content: "Jaha. Det blev fel i modellen. Försök igen.",
          content_complete: true,
          end_call: false
        });
      }
    });

    ws.on("close", () => {
      sessions.delete(callId);
    });

    ws.on("error", (error) => {
      console.error("Websocket error:", error);
    });
  });

  app.listen(port, host, () => {
    console.log(`Grok bridge listening on http://${host}:${port}`);
    console.log(`Expose this as wss://<public-host>/llm-websocket/ for Retell custom LLM.`);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
