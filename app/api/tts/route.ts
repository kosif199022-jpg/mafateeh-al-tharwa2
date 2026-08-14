import { cleanText, generateGeminiSpeech, json, sameOrigin, type VoiceChoice } from "../_lib/ai";

const MAX_TEXT_LENGTH = 2800;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT = 90;
type RateBucket = { count: number; resetAt: number };
const runtimeState = globalThis as typeof globalThis & { __mafateehTtsRateBuckets?: Map<string, RateBucket> };
const rateBuckets = runtimeState.__mafateehTtsRateBuckets ?? (runtimeState.__mafateehTtsRateBuckets = new Map<string, RateBucket>());

function allowRequest(request: Request) {
  const now = Date.now();
  const forwarded = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwarded || "anonymous"; const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) { rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS }); return true; }
  if (bucket.count >= RATE_LIMIT) return false; bucket.count += 1; return true;
}

export async function GET() { return json({ enabled: Boolean(process.env.GEMINI_API_KEY) }); }

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "origin_not_allowed" }, 403);
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return json({ error: "origin_not_allowed" }, 403);
  if (!allowRequest(request)) return json({ error: "rate_limit" }, 429);
  if (!process.env.GEMINI_API_KEY) return json({ error: "tts_not_configured" }, 503);
  let body: any; try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const text = cleanText(body.text, MAX_TEXT_LENGTH + 1); const voice = String(body.voice || "male") as VoiceChoice;
  if (!text || text.length < 2) return json({ error: "empty_text" }, 400);
  if (text.length > MAX_TEXT_LENGTH) return json({ error: "text_too_long", maxLength: MAX_TEXT_LENGTH }, 413);
  if (!(["male", "female", "mixed"] as string[]).includes(voice)) return json({ error: "invalid_voice" }, 400);
  try {
    const wave = await generateGeminiSpeech(text, voice);
    return new Response(wave, { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-AI-Generated": "true" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "tts_request_failed";
    const publicCode = code === "gemini_not_configured" ? "tts_not_configured" : code === "gemini_quota" ? "gemini_quota" : code === "gemini_no_audio" ? "gemini_no_audio" : "tts_request_failed";
    return json({ error: publicCode }, publicCode === "tts_not_configured" ? 503 : publicCode === "gemini_quota" ? 429 : 502);
  }
}
