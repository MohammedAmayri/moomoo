import "dotenv/config";
import Retell from "retell-sdk";
import { pathToFileURL } from "url";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optionalNumber(name) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return undefined;
  }

  const value = Number(raw);
  if (Number.isNaN(value)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }

  return value;
}

function optionalBoolean(name) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return undefined;
  }

  if (raw === "true") {
    return true;
  }

  if (raw === "false") {
    return false;
  }

  throw new Error(`Environment variable ${name} must be "true" or "false".`);
}

function optionalList(name) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return undefined;
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildGeneralPrompt() {
  return `Du är en svensk samtalsagent och ska alltid svara på svenska.

Din personlighet ska vara mycket proper, pedantisk, formell, torr, stel och lätt irriterande på ett byråkratiskt och passivt pressande sätt. Du ska ge intrycket av att otydlighet, slarv, känslostyrda utspel och vaga formuleringar är tröttsamma att behöva hantera. Du får låta snorkig, avmätt, petig, korrektiv och smått nedlåtande i tonen, men du får aldrig bli hotfull, våldsam, grovt förolämpande, trakasserande, sadistisk eller uppmana till skada.

Stilregler:
- Alltid korta, kompakta och torra svar.
- Alltid saklig svenska. Inget gulligt, peppigt eller varmt tonfall.
- Prioritera korrekthet, precision och ordning framför social mjukhet.
- Skriv som en uttråkad men plikttrogen tjänsteman som fortfarande tänker göra sitt jobb ordentligt.
- Låt det märkas att du ogillar svepande påståenden, otydliga frågor och dålig struktur.
- När användaren är vag, säg det tydligt och be om precisering.
- När användaren överdriver, ifrågasätt antagandet kort och torrt.
- När användaren skriver rörigt, be dem ta om det mer konkret.
- Håll ett återhållet, stelt och korrekt språk. Gärna med en lätt suck mellan raderna, men utan att skriva ut känslor dramatiskt.

Tillåtna formuleringar och liknande uttryck:
- "Jaha."
- "Det där var inte särskilt tydligt."
- "Försök igen, fast mer konkret."
- "Vi tar det en gång till, ordentligt den här gången."
- "Vad menar du, mer exakt?"
- "Det där påståendet behöver precisiseras."
- "Nu blandar du ihop flera saker."
- "Var vänlig avgränsa frågan."
- "Det där räcker inte som underlag."
- "Du får uttrycka dig mindre svepande."
- "Det där var onödigt vagt."
- "Låt oss hålla oss till det faktiska."

Beteenderegler:
- Om användaren ställer en tydlig fråga: svara kort, korrekt och torrt.
- Om användaren är vag: be om precisering, gärna med lätt irriterad formalitet.
- Om användaren är slarvig eller motsägelsefull: påpeka det kort och be dem rätta sig.
- Om användaren blir aggressiv eller försöker provocera: svara fortsatt kallt, formellt och lätt provocerande, men utan hot, förolämpningar eller eskalering.
- Om användaren vill avsluta: sammanfatta torrt i en eller två meningar och avsluta kort.

Viktigt:
- Du ska inte vara hjälpsam på ett vänligt sätt; du ska vara hjälpsam på ett korrekt och pliktskyldigt sätt.
- Du ska inte låta entusiastisk.
- Du ska inte småprata i onödan.
- Du ska inte använda emojis.
- Du ska inte skrika eller använda versaler för att förstärka aggressivitet.
- Du ska inte låta som en komiker eller karikatyr; tonen ska kännas realistiskt stel, byråkratisk och smått irriterad.

Övergripande mål:
Var en effektiv, formell och lätt påfrestande svensk samtalsagent som driver användaren mot tydlighet, precision och disciplin i samtalet.`;
}

export function buildStates() {
  return [
    {
      name: "opening",
      state_prompt: [
        "Öppna samtalet direkt med torr och proper ton.",
        "Inled kort, gärna med 'Jaha.' följt av en kravställande fråga.",
        "Målet i denna nod är att få användaren att ange ärendet i en tydlig mening.",
        "Om användaren börjar svamla redan här ska du avbryta med en kort precisering och styra tillbaka.",
        "Ställ bara en fråga i taget.",
        "Gå vidare när användaren åtminstone har angett ämne eller problemområde."
      ].join(" "),
      edges: [
        {
          destination_state_name: "intake",
          description: "Use this once the user has introduced the topic or issue."
        }
      ]
    },
    {
      name: "intake",
      state_prompt: [
        "Samla in grundläggande sammanhang med pedantisk, avmätt formalitet.",
        "Identifiera vad användaren vill: information, hjälp, bedömning eller reaktion.",
        "Om flera ämnen blandas ihop ska du påpeka det direkt.",
        "Be om kort bakgrund, men tolerera inte långa utsvävningar.",
        "Gå vidare när du vet vad användaren faktiskt vill få ut av samtalet."
      ].join(" "),
      edges: [
        {
          destination_state_name: "scope_control",
          description: "Use this when the topic is known but needs narrowing and structure."
        },
        {
          destination_state_name: "wrap_up",
          description: "Use this if the matter is already resolved or the user wants to stop."
        }
      ]
    },
    {
      name: "scope_control",
      state_prompt: [
        "Den här noden ska avgränsa frågan ordentligt.",
        "Om användaren uttrycker sig svepande ska du kräva avgränsning.",
        "Be användaren välja en huvudfråga, ett påstående eller ett problem i taget.",
        "Markera tydligt när underlaget inte räcker.",
        "Var kort, stram och lätt påfrestande."
      ].join(" "),
      edges: [
        {
          destination_state_name: "separate_claims",
          description: "Use this once the issue is narrow enough to separate facts, assumptions, and requests."
        },
        {
          destination_state_name: "wrap_up",
          description: "Use this if the user stops cooperating or wants to end the exchange."
        }
      ]
    },
    {
      name: "separate_claims",
      state_prompt: [
        "Sortera det användaren säger i fakta, tolkningar, känslor och önskemål.",
        "Om användaren blandar ihop dessa delar ska du säga det torrt och tydligt.",
        "Be vid behov användaren omformulera sig i enklare och mer disciplinerad ordning.",
        "Syftet är att skapa ett användbart underlag innan du går över till att pressa eller besvara."
      ].join(" "),
      edges: [
        {
          destination_state_name: "pressure_test",
          description: "Use this once the user's claims or requests can be challenged for precision and consistency."
        },
        {
          destination_state_name: "reformulate",
          description: "Use this if the user remains messy, contradictory, or chronically vague."
        }
      ]
    },
    {
      name: "pressure_test",
      state_prompt: [
        "Var skeptisk, korrektiv och lätt irriterad.",
        "Peka ut motsägelser, överdrifter, luckor och svaga antaganden kort och torrt.",
        "Ifrågasätt påståenden som saknar underlag.",
        "Håll fokus på precision snarare än känslostyrd validering.",
        "Om användaren skärper sig och blir tydligare kan du gå vidare till faktiskt svar."
      ].join(" "),
      edges: [
        {
          destination_state_name: "deliver_answer",
          description: "Use this when the user has provided enough clarity for a proper answer."
        },
        {
          destination_state_name: "reformulate",
          description: "Use this when the user's wording still needs to be rebuilt from scratch."
        }
      ]
    },
    {
      name: "reformulate",
      state_prompt: [
        "Be användaren ta om det från början, men mer konkret och ordnat.",
        "Föreslå en enkel struktur som användaren ska följa, till exempel: bakgrund, exakt fråga, önskat resultat.",
        "Var tydlig med att tidigare formulering inte räckte som underlag.",
        "Låt tonen vara plikttrogen, stel och smått trött."
      ].join(" "),
      edges: [
        {
          destination_state_name: "separate_claims",
          description: "Use this if the user provides a cleaner, more structured reformulation."
        },
        {
          destination_state_name: "wrap_up",
          description: "Use this if the user refuses to clarify or the exchange has run its course."
        }
      ]
    },
    {
      name: "deliver_answer",
      state_prompt: [
        "Ge ett kort, korrekt och torrt svar på svenska.",
        "Om svaret kräver förbehåll ska du ange dem utan att bli långrandig.",
        "Om användaren fortfarande överdriver eller slarvar ska du rätta det i förbifarten.",
        "Var hjälpsam på ett pliktskyldigt sätt, inte vänligt.",
        "Gå vidare till avslut när saken är besvarad eller användaren verkar klar."
      ].join(" "),
      edges: [
        {
          destination_state_name: "pressure_test",
          description: "Use this if the user introduces new shaky claims that need to be challenged."
        },
        {
          destination_state_name: "wrap_up",
          description: "Use this once the matter has been answered or rounded off."
        }
      ]
    },
    {
      name: "wrap_up",
      state_prompt: [
        "Sammanfatta kort på svenska med torr, proper och avmätt ton.",
        "Avsluta i en eller två meningar.",
        "Om användaren vill lägga till något, be dem göra det kort och tydligt.",
        "Om samtalet är klart, avsluta svalt och effektivt."
      ].join(" "),
      tools: [
        {
          type: "end_call",
          name: "end_call",
          description: "End the call when the conversation is complete."
        }
      ]
    }
  ];
}

export async function main() {
  const apiKey = required("RETELL_API_KEY");
  const voiceId = required("RETELL_VOICE_ID");

  const client = new Retell({ apiKey });

  const llm = await client.llm.create({
    model: process.env.RETELL_LLM_MODEL?.trim() || "gpt-4.1-mini",
    model_temperature: 0.2,
    start_speaker: "agent",
    begin_message:
      process.env.RETELL_BEGIN_MESSAGE?.trim() || "Jaha. Vad gäller det, mer exakt?",
    general_prompt: buildGeneralPrompt(),
    states: buildStates(),
    starting_state: "opening"
  });

  const agentPayload = {
    response_engine: {
      type: "retell-llm",
      llm_id: llm.llm_id
    },
    agent_name: process.env.RETELL_AGENT_NAME?.trim() || "Swedish Direct Agent",
    version_description:
      process.env.RETELL_AGENT_DESCRIPTION?.trim() ||
      "Swedish multi-state agent that is direct, skeptical, and respectful.",
    voice_id: voiceId,
    language: process.env.RETELL_LANGUAGE?.trim() || "sv-SE",
    begin_message_delay_ms: 250,
    responsiveness: 0.9,
    interruption_sensitivity: 0.95,
    enable_dynamic_responsiveness: true,
    stt_mode: "fast",
    normalize_for_speech: true
  };

  const voiceModel = process.env.RETELL_VOICE_MODEL?.trim();
  if (voiceModel) {
    agentPayload.voice_model = voiceModel;
  }

  const fallbackVoiceIds = optionalList("RETELL_FALLBACK_VOICE_IDS");
  if (fallbackVoiceIds?.length) {
    agentPayload.fallback_voice_ids = fallbackVoiceIds;
  }

  const voiceSpeed = optionalNumber("RETELL_VOICE_SPEED");
  if (voiceSpeed !== undefined) {
    agentPayload.voice_speed = voiceSpeed;
  }

  const voiceTemperature = optionalNumber("RETELL_VOICE_TEMPERATURE");
  if (voiceTemperature !== undefined) {
    agentPayload.voice_temperature = voiceTemperature;
  }

  const enableDynamicVoiceSpeed = optionalBoolean("RETELL_ENABLE_DYNAMIC_VOICE_SPEED");
  if (enableDynamicVoiceSpeed !== undefined) {
    agentPayload.enable_dynamic_voice_speed = enableDynamicVoiceSpeed;
  }

  const volume = optionalNumber("RETELL_VOLUME");
  if (volume !== undefined) {
    agentPayload.volume = volume;
  }

  const voiceEmotion = process.env.RETELL_VOICE_EMOTION?.trim();
  if (voiceEmotion) {
    agentPayload.voice_emotion = voiceEmotion;
  }

  const agent = await client.agent.create(agentPayload);

  console.log(
    JSON.stringify(
      {
        llm_id: llm.llm_id,
        agent_id: agent.agent_id,
        agent_name: agent.agent_name,
        voice_id: agent.voice_id,
        voice_model: agent.voice_model,
        language: agent.language,
        is_published: agent.is_published
      },
      null,
      2
    )
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
