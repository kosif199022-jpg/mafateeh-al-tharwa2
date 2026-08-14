export type CloudProvider = "gemini" | "openai";
export type VoiceChoice = "male" | "female" | "mixed";

export const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.6-flash";
export const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview";
export const GEMINI_TTS_FALLBACK_MODEL = process.env.GEMINI_TTS_FALLBACK_MODEL || "gemini-2.5-flash-preview-tts";
export const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-5.6";
export const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";

export function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function sameOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

type RateBucket = { count: number; resetAt: number };
const runtime = globalThis as typeof globalThis & { __mafateehAiRate?: Map<string, RateBucket> };
const aiRate = runtime.__mafateehAiRate ?? (runtime.__mafateehAiRate = new Map<string, RateBucket>());

export function rateLimit(request: Request, scope: string, limit: number, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
  const key = `${scope}:${ip}`;
  const bucket = aiRate.get(key);
  if (!bucket || bucket.resetAt <= now) { aiRate.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function cleanText(value: unknown, max = 120_000) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, max);
}

export async function generateGeminiText(prompt: string, options: { jsonMode?: boolean; model?: string } = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("gemini_not_configured");
  const model = options.model || GEMINI_TEXT_MODEL;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        ...(options.jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    console.error("Gemini text failed", response.status, await response.text().catch(() => ""));
    throw new Error(response.status === 429 ? "gemini_quota" : "gemini_request_failed");
  }
  const result = await response.json() as any;
  const text = result?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || "").join("")?.trim();
  if (!text) throw new Error("gemini_empty_response");
  return text;
}

function promptFromMessages(messages: Array<{ role?: string; content?: string }>, system = "") {
  const history = messages.slice(-14).map((m) => {
    const role = m.role === "assistant" ? "ASSISTANT" : "USER";
    return `${role}: ${cleanText(m.content, 12_000)}`;
  }).join("\n\n");
  return `${system ? `SYSTEM:\n${system}\n\n` : ""}${history}\n\nASSISTANT:`.trim();
}

export async function chatWithProvider(provider: CloudProvider, messages: Array<{ role?: string; content?: string }>, system = "") {
  const prompt = promptFromMessages(messages, system);
  if (provider === "gemini") return generateGeminiText(prompt);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("openai_not_configured");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: OPENAI_TEXT_MODEL, input: prompt }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    console.error("OpenAI response failed", response.status, await response.text().catch(() => ""));
    throw new Error(response.status === 429 ? "openai_quota" : "openai_request_failed");
  }
  const result = await response.json() as any;
  const direct = typeof result?.output_text === "string" ? result.output_text : "";
  const nested = Array.isArray(result?.output)
    ? result.output.flatMap((item: any) => item?.content || []).map((part: any) => part?.text || "").join("")
    : "";
  const text = (direct || nested).trim();
  if (!text) throw new Error("openai_empty_response");
  return text;
}

function decodeBase64(data: string) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function pcmToWave(pcm: Uint8Array, sampleRate = 24000) {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, "RIFF"); view.setUint32(4, 36 + pcm.byteLength, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, pcm.byteLength, true);
  const wave = new Uint8Array(44 + pcm.byteLength); wave.set(new Uint8Array(header), 0); wave.set(pcm, 44); return wave;
}

function geminiSpeechInput(text: string, voice: VoiceChoice) {
  const directions = "Synthesize speech in natural Modern Standard Arabic, audiobook style, warm and clear, medium pace. Speak only the TRANSCRIPT and do not add or explain anything.";
  if (voice === "mixed") {
    const paragraphs = text.split(/\n+/).map((x) => x.trim()).filter(Boolean);
    const transcript = paragraphs.length > 1
      ? paragraphs.map((part, i) => `${i % 2 ? "Guide" : "Narrator"}: ${part}`).join("\n")
      : `Narrator: ${text}`;
    return {
      input: `${directions}\n\nTRANSCRIPT:\n${transcript}`,
      speech_config: [
        { speaker: "Narrator", voice: "Charon" },
        { speaker: "Guide", voice: "Kore" },
      ],
    };
  }
  return {
    input: `${directions}\n\nTRANSCRIPT:\n${text}`,
    speech_config: [{ voice: voice === "female" ? "Kore" : "Charon" }],
  };
}

export async function generateGeminiSpeech(text: string, voice: VoiceChoice = "male") {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("gemini_not_configured");
  const prepared = geminiSpeechInput(text, voice);
  let lastError = "gemini_tts_failed";
  const models = [...new Set([GEMINI_TTS_MODEL, GEMINI_TTS_FALLBACK_MODEL])];

  for (const model of models) {
    // Gemini 3.1 TTS can occasionally return a transient 500; retry once before falling back.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
          "Api-Revision": "2026-05-20",
        },
        body: JSON.stringify({
          model,
          input: prepared.input,
          response_format: { type: "audio" },
          generation_config: { speech_config: prepared.speech_config },
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) {
        lastError = response.status === 429 ? "gemini_quota" : "gemini_tts_failed";
        const body = await response.text().catch(() => "");
        console.error("Gemini TTS failed", model, response.status, body);
        if (response.status >= 500 && attempt === 0) continue;
        break;
      }
      const result = await response.json() as any;
      const encoded = result?.output_audio?.data || result?.outputAudio?.data || result?.output?.find?.((x: any) => x?.type === "audio")?.data;
      if (!encoded) {
        lastError = "gemini_no_audio";
        if (attempt === 0) continue;
        break;
      }
      const pcm = decodeBase64(encoded);
      const sampleRate = Number(result?.output_audio?.sample_rate || result?.outputAudio?.sampleRate || 24000);
      return pcmToWave(pcm, Number.isFinite(sampleRate) ? sampleRate : 24000);
    }
  }
  throw new Error(lastError);
}

export async function generateOpenAISpeech(text: string, voice: VoiceChoice = "male") {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("openai_not_configured");
  const selectedVoice = voice === "female" ? "marin" : voice === "mixed" ? "cedar" : "cedar";
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: OPENAI_TTS_MODEL,
      input: text,
      voice: selectedVoice,
      instructions: "اقرأ بالعربية الفصحى بصوت كتاب صوتي طبيعي وواضح وهادئ. لا تضف أي كلمات غير موجودة في النص.",
      response_format: "wav",
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    console.error("OpenAI TTS failed", response.status, await response.text().catch(() => ""));
    throw new Error(response.status === 429 ? "openai_quota" : "openai_tts_failed");
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function uploadGeminiFile(file: File) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("gemini_not_configured");
  const start = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(file.size),
      "X-Goog-Upload-Header-Content-Type": file.type || "application/pdf",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: file.name } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!start.ok) throw new Error("gemini_upload_start_failed");
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("gemini_upload_url_missing");
  const finish = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/pdf",
      "Content-Length": String(file.size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: file,
    signal: AbortSignal.timeout(120_000),
  });
  if (!finish.ok) throw new Error("gemini_upload_failed");
  const info = await finish.json() as any;
  let item = info?.file;
  if (!item?.name || !item?.uri) throw new Error("gemini_upload_invalid");
  for (let i = 0; i < 18 && item?.state === "PROCESSING"; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const check = await fetch(`https://generativelanguage.googleapis.com/v1beta/${item.name}`, { headers: { "x-goog-api-key": apiKey } });
    if (check.ok) item = await check.json();
  }
  if (item?.state === "FAILED") throw new Error("gemini_file_processing_failed");
  return { name: item.name, uri: item.uri, mimeType: item.mimeType || file.type || "application/pdf", displayName: item.displayName || file.name };
}


export async function deleteGeminiFile(fileName: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("gemini_not_configured");
  const safeName = cleanText(fileName, 500).replace(/^\/+/, "");
  if (!/^files\/[A-Za-z0-9._-]+$/.test(safeName)) throw new Error("invalid_gemini_file_name");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${safeName}`, {
    method: "DELETE",
    headers: { "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok && response.status !== 404) throw new Error(response.status === 429 ? "gemini_quota" : "gemini_delete_failed");
  return true;
}

export async function geminiFromFile(fileUri: string, mimeType: string, prompt: string, jsonMode = true) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("gemini_not_configured");
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
      "Api-Revision": "2026-05-20",
    },
    body: JSON.stringify({
      model: GEMINI_TEXT_MODEL,
      input: [
        { type: "document", uri: fileUri, mime_type: mimeType || "application/pdf" },
        { type: "text", text: prompt },
      ],
      ...(jsonMode ? { response_format: { type: "text", mime_type: "application/json" } } : {}),
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    console.error("Gemini file request failed", response.status, await response.text().catch(() => ""));
    throw new Error(response.status === 429 ? "gemini_quota" : "gemini_file_request_failed");
  }
  const result = await response.json() as any;
  const direct = typeof result?.output_text === "string" ? result.output_text : "";
  const fromSteps = Array.isArray(result?.steps)
    ? result.steps.flatMap((step: any) => step?.content || []).filter((part: any) => part?.type === "text").map((part: any) => part?.text || "").join("")
    : "";
  const text = (direct || fromSteps).trim();
  if (!text) throw new Error("gemini_empty_response");
  return text;
}
