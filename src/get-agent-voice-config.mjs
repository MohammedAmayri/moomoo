import "dotenv/config";
import Retell from "retell-sdk";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function main() {
  const apiKey = required("RETELL_API_KEY");
  const agentId = process.argv[2]?.trim();

  if (!agentId) {
    throw new Error("Usage: npm run agent:voice -- <agent_id>");
  }

  const client = new Retell({ apiKey });
  const agent = await client.agent.retrieve(agentId);

  const voiceConfig = {
    agent_id: agent.agent_id,
    agent_name: agent.agent_name,
    voice_id: agent.voice_id,
    voice_model: agent.voice_model ?? "",
    fallback_voice_ids: agent.fallback_voice_ids ?? [],
    voice_speed: agent.voice_speed ?? 1,
    voice_temperature: agent.voice_temperature ?? 1,
    enable_dynamic_voice_speed: agent.enable_dynamic_voice_speed ?? false,
    volume: agent.volume ?? 1,
    voice_emotion: agent.voice_emotion ?? "",
    language: agent.language ?? ""
  };

  console.log(JSON.stringify(voiceConfig, null, 2));
  console.log("");
  console.log("# Copy into .env");
  console.log(`RETELL_VOICE_ID=${voiceConfig.voice_id}`);
  console.log(`RETELL_VOICE_MODEL=${voiceConfig.voice_model}`);
  console.log(`RETELL_FALLBACK_VOICE_IDS=${voiceConfig.fallback_voice_ids.join(",")}`);
  console.log(`RETELL_VOICE_SPEED=${voiceConfig.voice_speed}`);
  console.log(`RETELL_VOICE_TEMPERATURE=${voiceConfig.voice_temperature}`);
  console.log(
    `RETELL_ENABLE_DYNAMIC_VOICE_SPEED=${String(voiceConfig.enable_dynamic_voice_speed)}`
  );
  console.log(`RETELL_VOLUME=${voiceConfig.volume}`);
  console.log(`RETELL_VOICE_EMOTION=${voiceConfig.voice_emotion}`);
  console.log(`RETELL_LANGUAGE=${voiceConfig.language || "sv-SE"}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
