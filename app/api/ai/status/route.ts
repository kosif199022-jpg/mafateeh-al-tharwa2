import { GEMINI_TEXT_MODEL, GEMINI_TTS_MODEL, OPENAI_TEXT_MODEL, OPENAI_TTS_MODEL, json } from "../../_lib/ai";
export async function GET() {
  return json({
    gemini: { configured: Boolean(process.env.GEMINI_API_KEY), textModel: GEMINI_TEXT_MODEL, ttsModel: GEMINI_TTS_MODEL },
    openai: { configured: Boolean(process.env.OPENAI_API_KEY), textModel: OPENAI_TEXT_MODEL, ttsModel: OPENAI_TTS_MODEL },
    piper: { browserLocal: true, voice: "ar_JO-kareem-medium" },
  });
}
