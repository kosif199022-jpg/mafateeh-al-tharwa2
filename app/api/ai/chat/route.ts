import { chatWithProvider, cleanText, json, rateLimit, sameOrigin, type CloudProvider } from "../../_lib/ai";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "origin_not_allowed" }, 403);
  if (!rateLimit(request, "chat", 60)) return json({ error: "rate_limit" }, 429);
  let body: any; try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const provider = String(body.provider || "gemini") as CloudProvider;
  if (!(["gemini", "openai"] as string[]).includes(provider)) return json({ error: "invalid_provider" }, 400);
  const messages = Array.isArray(body.messages) ? body.messages.slice(-14).map((m: any) => ({ role: m.role, content: cleanText(m.content, 12_000) })).filter((m: any) => m.content) : [];
  if (!messages.length) return json({ error: "empty_messages" }, 400);
  const system = cleanText(body.system, 20_000) || "أنت مساعد داخل تطبيق مفاتيح الثروة. أجب بالعربية بوضوح واختصار، ولا تدّعِ معلومات غير موجودة في السياق المقدم.";
  try { return json({ provider, text: await chatWithProvider(provider, messages, system) }); }
  catch (error) { const code = error instanceof Error ? error.message : "ai_failed"; return json({ error: code }, code.includes("not_configured") ? 503 : 502); }
}
