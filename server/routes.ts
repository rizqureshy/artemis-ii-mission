import type { Express } from "express";
import { createServer, type Server } from "http";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface WaypointCommentaryRequest {
  waypointId: string;
  label: string;
  description: string;
  day: string;
  details: string;
  progress: number;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // AI commentary endpoint for mission waypoints
  app.post("/api/mission/commentary", async (req, res) => {
    try {
      const { waypointId, label, description, day, details, progress }: WaypointCommentaryRequest = req.body;

      const systemPrompt = `You are a concise NASA mission commentator. Keep all text SHORT — spoken aloud, each response should be under 12 seconds. State what's happening and what the pilot is doing. No filler.`;

      const userPrompt = `Artemis II checkpoint — be brief:

WAYPOINT: ${label}
EVENT: ${description}
TIMING: ${day}
CONTEXT: ${details}
PROGRESS: ${Math.round(progress * 100)}%

Return JSON:
{
  "headline": "3-5 word ALL CAPS headline",
  "subtitle": "One short sentence — what is happening right now",
  "commentary": "2 sentences max: what this waypoint means and what the pilot is doing right now. Keep under 30 words total.",
  "riskLevel": "LOW | MEDIUM | HIGH | CRITICAL",
  "riskDescription": "5-8 words on the primary risk",
  "shipStatus": {
    "heatShield": "NOMINAL | WARM | HOT | CRITICAL",
    "oxygenLevel": ${Math.round(96 - progress * 12)},
    "propellantRemaining": ${Math.round(95 - progress * 45)},
    "powerOutput": ${Math.round(92 + Math.sin(progress * 10) * 3)},
    "communicationSignal": "${progress > 0.55 && progress < 0.63 ? 'BLACKOUT' : 'STRONG'}",
    "crewStatus": "NOMINAL | ELEVATED | ALERT",
    "trajectoryDeviation": "${(0.01 + progress * 0.03).toFixed(2)} km"
  },
  "technicalNote": "One technical fact, max 10 words"
}

Keep commentary brief but informative — it will be read aloud in under 15 seconds.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 350,
      });

      const choice = response.choices[0];
      console.log("AI response choice:", JSON.stringify(choice?.message));
      const content = choice?.message?.content;
      if (!content) throw new Error(`No response from AI. finish_reason=${choice?.finish_reason}`);

      const commentary = JSON.parse(content);
      res.json(commentary);
    } catch (error) {
      console.error("AI commentary error:", error);
      res.status(500).json({ error: "Failed to generate commentary" });
    }
  });

  async function elevenLabsTTS(res: any, text: string, voiceId: string, settings: any) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "ElevenLabs API key not configured" });

    const elevRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: settings,
        }),
      }
    );

    if (!elevRes.ok) {
      const errText = await elevRes.text();
      console.error("ElevenLabs error:", elevRes.status, errText);
      return res.status(502).json({ error: "ElevenLabs TTS failed" });
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    const buf = await elevRes.arrayBuffer();
    res.send(Buffer.from(buf));
  }

  app.post("/api/mission/narrate", async (req, res) => {
    try {
      const { text } = req.body as { text: string };
      if (!text) return res.status(400).json({ error: "text is required" });
      await elevenLabsTTS(res, text, "nPczCjzI2devNBz1zQrb", {
        stability: 0.48,
        similarity_boost: 0.78,
        style: 0.12,
        use_speaker_boost: true,
      });
    } catch (err) {
      console.error("Narration error:", err);
      res.status(500).json({ error: "Narration failed" });
    }
  });

  const soundCache = new Map<string, Buffer>();

  async function generateSound(prompt: string, durationSeconds: number): Promise<Buffer | null> {
    const cacheKey = `${prompt}::${durationSeconds}`;
    if (soundCache.has(cacheKey)) return soundCache.get(cacheKey)!;

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return null;

    const elevRes = await fetch(
      "https://api.elevenlabs.io/v1/sound-generation",
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: prompt,
          duration_seconds: durationSeconds,
        }),
      }
    );

    if (!elevRes.ok) {
      console.error("Sound gen error:", elevRes.status, await elevRes.text());
      return null;
    }

    const buf = Buffer.from(await elevRes.arrayBuffer());
    soundCache.set(cacheKey, buf);
    return buf;
  }

  let compositeMusic: Buffer | null = null;

  app.get("/api/mission/background-music", async (_req, res) => {
    try {
      if (compositeMusic) {
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Cache-Control", "no-cache");
        return res.send(compositeMusic);
      }

      const prompts = [
        "Cinematic uplifting orchestral soundtrack, soaring strings and brass, triumphant hopeful melody, epic space exploration theme, majestic and inspiring, building crescendo",
        "Sweeping orchestral space theme, warm piano melody with layered strings, gentle timpani pulse, hopeful and adventurous, cinematic wonder and awe",
        "Grand orchestral crescendo, powerful brass fanfare with delicate violin counter-melody, space exploration triumph, emotionally uplifting and epic",
        "Ethereal orchestral finale, celestial choir with strings and harp, peaceful yet triumphant resolution, homecoming theme, warm and emotional",
      ];

      console.log("Generating composite background music (4 clips)...");
      const clips = await Promise.all(
        prompts.map(p => generateSound(p, 22))
      );

      const validClips = clips.filter((c): c is Buffer => c !== null);
      if (validClips.length === 0) {
        return res.status(502).json({ error: "Sound generation failed" });
      }

      compositeMusic = Buffer.concat(validClips);
      console.log(`Composite music ready: ${validClips.length} clips, ${compositeMusic.length} bytes`);

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-cache");
      res.send(compositeMusic);
    } catch (err) {
      console.error("Background music error:", err);
      res.status(500).json({ error: "Background music generation failed" });
    }
  });

  const STAGE_SOUNDS: Record<string, { prompt: string; duration: number }> = {
    ascent: { prompt: "Rocket engine roaring with intense thrust, deep rumbling vibration, metal creaking under stress, loud powerful launch sounds", duration: 8 },
    tli: { prompt: "Spacecraft engine ignition in space, deep muffled rocket burn, mechanical hum and vibration, quiet thruster firing", duration: 8 },
    outbound: { prompt: "Quiet spaceship interior ambient hum, gentle air circulation system, soft electronic beeping, peaceful deep space silence with distant subtle hum", duration: 10 },
    lunar: { prompt: "Spacecraft passing close to moon surface, quiet thruster adjustments, instrument panel beeping, subtle gravitational whoosh effect", duration: 8 },
    farside: { prompt: "Complete radio silence, eerie quiet void of deep space, faint spacecraft life support hum, isolated and distant feeling ambient tone", duration: 8 },
    return: { prompt: "Spacecraft systems powering up, navigation computer processing sounds, gentle thruster corrections, optimistic electronic chimes", duration: 8 },
    reentry: { prompt: "Intense atmospheric re-entry, plasma crackling and roaring around heat shield, violent shaking vibration, dramatic turbulence", duration: 8 },
    splashdown: { prompt: "Parachute deployment whoosh, ocean water splash impact, waves lapping against capsule hull, muffled underwater sound then surfacing", duration: 8 },
  };

  app.get("/api/mission/stage-sound/:stage", async (req, res) => {
    try {
      const stage = req.params.stage;
      const config = STAGE_SOUNDS[stage];
      if (!config) return res.status(404).json({ error: "Unknown stage" });

      const buf = await generateSound(config.prompt, config.duration);
      if (!buf) return res.status(502).json({ error: "Sound generation failed" });

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(buf);
    } catch (err) {
      console.error("Stage sound error:", err);
      res.status(500).json({ error: "Stage sound generation failed" });
    }
  });

  app.post("/api/mission/computer-voice", async (req, res) => {
    try {
      const { text } = req.body as { text: string };
      if (!text) return res.status(400).json({ error: "text is required" });
      await elevenLabsTTS(res, text, "21m00Tcm4TlvDq8ikWAM", {
        stability: 0.85,
        similarity_boost: 0.4,
        style: 0.0,
        use_speaker_boost: false,
      });
    } catch (err) {
      console.error("Computer voice error:", err);
      res.status(500).json({ error: "Computer voice failed" });
    }
  });

  return httpServer;
}
