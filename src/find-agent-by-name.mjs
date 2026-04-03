import "dotenv/config";
import Retell from "retell-sdk";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function normalize(value) {
  return value.trim().toLowerCase();
}

async function main() {
  const apiKey = required("RETELL_API_KEY");
  const targetName = process.argv.slice(2).join(" ").trim();

  if (!targetName) {
    throw new Error('Usage: npm run agent:find -- "Agent Name"');
  }

  const client = new Retell({ apiKey });
  const agents = await client.agent.list();
  const match = agents.find(
    (agent) => agent.agent_name && normalize(agent.agent_name) === normalize(targetName)
  );

  if (!match) {
    throw new Error(`No agent found with exact name: ${targetName}`);
  }

  console.log(
    JSON.stringify(
      {
        agent_id: match.agent_id,
        agent_name: match.agent_name,
        voice_id: match.voice_id,
        voice_model: match.voice_model ?? "",
        fallback_voice_ids: match.fallback_voice_ids ?? [],
        voice_speed: match.voice_speed ?? 1,
        voice_temperature: match.voice_temperature ?? 1,
        enable_dynamic_voice_speed: match.enable_dynamic_voice_speed ?? false,
        volume: match.volume ?? 1,
        voice_emotion: match.voice_emotion ?? "",
        language: match.language ?? ""
      },
      null,
      2
    )
  );
  console.log("");
  console.log("# Copy into .env");
  console.log(`RETELL_VOICE_ID=${match.voice_id}`);
  console.log(`RETELL_VOICE_MODEL=${match.voice_model ?? ""}`);
  console.log(`RETELL_FALLBACK_VOICE_IDS=${(match.fallback_voice_ids ?? []).join(",")}`);
  console.log(`RETELL_VOICE_SPEED=${match.voice_speed ?? 1}`);
  console.log(`RETELL_VOICE_TEMPERATURE=${match.voice_temperature ?? 1}`);
  console.log(
    `RETELL_ENABLE_DYNAMIC_VOICE_SPEED=${String(match.enable_dynamic_voice_speed ?? false)}`
  );
  console.log(`RETELL_VOLUME=${match.volume ?? 1}`);
  console.log(`RETELL_VOICE_EMOTION=${match.voice_emotion ?? ""}`);
  console.log(`RETELL_LANGUAGE=${match.language ?? "sv-SE"}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
