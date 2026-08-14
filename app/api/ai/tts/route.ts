import { cleanText, generateGeminiSpeech, generateOpenAISpeech, json, rateLimit, sameOrigin, type VoiceChoice } from "../../_lib/ai";
const MAX_TEXT = 5000;
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "origin_not_allowed" }, 403);
  if (!rateLimit(request, "tts", 80)) return json({ error: "rate_limit" }, 429);
  let body: any; try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const text = cleanText(body.text, MAX_TEXT + 1); const provider = String(body.provider || "gemini"); const voice = String(body.voice || "male") as VoiceChoice;
  if (!text) return json({ error: "empty_text" }, 400); if (text.length > MAX_TEXT) return json({ error: "text_too_long", maxLength: MAX_TEXT }, 413);
  if (!(["male", "female", "mixed"] as string[]).includes(voice)) return json({ error: "invalid_voice" }, 400);
  if (!(["gemini", "openai"] as string[]).includes(provider)) return json({ error: "invalid_provider" }, 400);
  try {
    const bytes = provider === "openai" ? await generateOpenAISpeech(text, voice) : await generateGeminiSpeech(text, voice);
    return new Response(bytes, { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, no-store", "X-AI-Generated": "true", "X-Mafateeh-Provider": provider } });
  } catch (error) { const code = error instanceof Error ? error.message : "tts_failed"; return json({ error: code }, code.includes("not_configured") ? 503 : 502); }
}
