import "dotenv/config";
import Retell from "retell-sdk";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function ensureWebsocketBaseUrl(value) {
  const normalized = value.trim();

  if (!normalized.startsWith("wss://")) {
    throw new Error("RETELL_LLM_WEBSOCKET_URL must start with wss://");
  }

  if (!normalized.includes("/llm-websocket")) {
    throw new Error(
      "RETELL_LLM_WEBSOCKET_URL must point to the custom LLM websocket base path, for example wss://your-domain/llm-websocket/"
    );
  }

  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function buildClonePayload(agent, llmWebsocketUrl) {
  const payload = {
    agent_name: `${agent.agent_name || "Retell Agent"} (Grok)`,
    version_description: agent.version_description || undefined,
    response_engine: {
      type: "custom-llm",
      llm_websocket_url: llmWebsocketUrl
    },
    voice_id: agent.voice_id
  };

  const optionalKeys = [
    "allow_user_dtmf",
    "ambient_sound",
    "ambient_sound_volume",
    "analysis_successful_prompt",
    "analysis_summary_prompt",
    "analysis_user_sentiment_prompt",
    "begin_message_delay_ms",
    "boosted_keywords",
    "custom_stt_config",
    "data_storage_retention_days",
    "data_storage_setting",
    "denoising_mode",
    "enable_backchannel",
    "enable_dynamic_responsiveness",
    "enable_dynamic_voice_speed",
    "end_call_after_silence_ms",
    "fallback_voice_ids",
    "guardrail_config",
    "handbook_config",
    "interruption_sensitivity",
    "ivr_option",
    "language",
    "max_call_duration_ms",
    "normalize_for_speech",
    "opt_in_signed_url",
    "pii_config",
    "post_call_analysis_data",
    "post_call_analysis_model",
    "pronunciation_dictionary",
    "reminder_max_count",
    "reminder_trigger_ms",
    "responsiveness",
    "ring_duration_ms",
    "signed_url_expiration_ms",
    "stt_mode",
    "timezone",
    "user_dtmf_options",
    "version_description",
    "vocab_specialization",
    "voice_emotion",
    "voice_model",
    "voice_speed",
    "voice_temperature",
    "voicemail_detection_timeout_ms",
    "voicemail_message",
    "voicemail_option",
    "volume",
    "webhook_events"
  ];

  for (const key of optionalKeys) {
    if (agent[key] !== undefined && agent[key] !== null) {
      payload[key] = agent[key];
    }
  }

  return payload;
}

async function main() {
  const apiKey = required("RETELL_API_KEY");
  const agentId =
    process.argv[2]?.trim() ||
    process.env.RETELL_AGENT_ID?.trim() ||
    "agent_170021b0a59062fbed300329b6";
  const llmWebsocketUrl = ensureWebsocketBaseUrl(required("RETELL_LLM_WEBSOCKET_URL"));

  const client = new Retell({ apiKey });
  let agent;

  try {
    agent = await client.agent.update(agentId, {
      response_engine: {
        type: "custom-llm",
        llm_websocket_url: llmWebsocketUrl
      }
    });
  } catch (error) {
    const message = String(error?.message || "");
    if (!message.includes("Cannot update response engine to different version or different response engine type")) {
      throw error;
    }

    const current = await client.agent.retrieve(agentId);
    agent = await client.agent.create(buildClonePayload(current, llmWebsocketUrl));
  }

  console.log(
    JSON.stringify(
      {
        agent_id: agent.agent_id,
        agent_name: agent.agent_name,
        response_engine: agent.response_engine,
        is_published: agent.is_published
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
