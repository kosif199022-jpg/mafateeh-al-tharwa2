import { cleanText, deleteGeminiFile, geminiFromFile, json, rateLimit, sameOrigin, uploadGeminiFile } from "../../_lib/ai";

// This is a per-upload-part safety ceiling, not a book-size ceiling.
// V24 splits books in the browser and can process any number of parts sequentially.
const MAX_PDF_PART_BYTES = 48 * 1024 * 1024;
function parseJson(text: string) {
  try { return JSON.parse(text); } catch {
    const match = text.match(/\{[\s\S]*\}/); if (match) return JSON.parse(match[0]); throw new Error("invalid_model_json");
  }
}

const ANALYZE_PROMPT = `حلل هذا الجزء من كتاب PDF لتحويله إلى كتاب ذكي داخل تطبيق «مفاتيح الثروة».
أعد JSON فقط بهذه البنية:
{"title":"","author":"","language":"ar","pageCount":0,"summary":"","chapters":[{"title":"","startPage":1,"endPage":1,"key":"مفتاح الفصل في جملة واحدة","summary":"ملخص قصير","idea":"الفكرة الأساسية","apply":"تطبيق عملي اختياري","questions":["سؤال 1","سؤال 2"]}],"themes":[""],"warnings":[]}
القواعد: أرقام الصفحات هنا محلية داخل هذا الجزء وتبدأ من 1. حافظ على ترتيب المحتوى الحقيقي. لا تخترع فصولاً غير موجودة. إذا بدأ الجزء في منتصف فصل، استخدم عنوان الفصل الظاهر أو وصفًا محافظًا ولا تدّعِ أنه فصل جديد. اكتب العربية عندما يكون المحتوى عربيًا.`;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "origin_not_allowed" }, 403);
  // High abuse guard only; it does not impose a book page/size limit. Client pauses/resumes across provider quotas.
  if (!rateLimit(request, "pdf", 4000, 30 * 60 * 1000)) return json({ error: "rate_limit" }, 429);
  const type = request.headers.get("content-type") || "";
  try {
    if (type.includes("multipart/form-data")) {
      const form = await request.formData(); const action = String(form.get("action") || "upload"); const file = form.get("file");
      if (action !== "upload" || !(file instanceof File)) return json({ error: "pdf_file_required" }, 400);
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return json({ error: "pdf_only" }, 415);
      if (file.size > MAX_PDF_PART_BYTES) return json({ error: "pdf_part_too_large", maxPartBytes: MAX_PDF_PART_BYTES }, 413);
      const uploaded = await uploadGeminiFile(file); return json({ ok: true, file: uploaded, segmented: true, maxPartBytes: MAX_PDF_PART_BYTES });
    }

    const body: any = await request.json(); const action = String(body.action || "analyze"); const fileUri = cleanText(body.fileUri, 3000); const mimeType = cleanText(body.mimeType, 100) || "application/pdf";
    if (action === "delete") {
      const fileName = cleanText(body.fileName, 500);
      if (!fileName) return json({ error: "file_name_required" }, 400);
      await deleteGeminiFile(fileName); return json({ ok: true });
    }
    if (!fileUri.startsWith("https://")) return json({ error: "invalid_file_uri" }, 400);
    if (action === "analyze") {
      const raw = await geminiFromFile(fileUri, mimeType, ANALYZE_PROMPT, true); return json({ ok: true, analysis: parseJson(raw) });
    }
    if (action === "extract") {
      const startPage = Math.max(1, Math.floor(Number(body.startPage) || 1)); const endPage = Math.max(startPage, Math.min(startPage + 19, Math.floor(Number(body.endPage) || startPage + 9)));
      const prompt = `استخرج النص الأصلي المرئي من صفحات ${startPage} إلى ${endPage} من جزء PDF هذا بدقة عالية. أرقام الصفحات محلية داخل الجزء. لا تلخص ولا تعيد الصياغة ولا تضف تفسيرًا. حافظ على العناوين والفقرات والقوائم بترتيب القراءة. أعد JSON فقط: {"pages":[{"page":${startPage},"title":"عنوان الصفحة أو القسم إن وجد","text":"النص الكامل للصفحة"}],"warnings":[]}. يجب أن تعيد عنصرًا لكل رقم صفحة من ${startPage} إلى ${endPage} بالترتيب حتى لو كانت الصفحة فارغة؛ في الصفحة الفارغة استخدم text="". إذا كانت صفحة صورة استخدم قدرات الرؤية لقراءة النص. لا تُخرج صفحات خارج النطاق المطلوب.`;
      const raw = await geminiFromFile(fileUri, mimeType, prompt, true); const data = parseJson(raw); return json({ ok: true, startPage, endPage, ...data });
    }
    if (action === "digest") {
      const prompt = `أنشئ لوحة ذكاء لهذا الجزء من PDF فقط. أعد JSON فقط: {"executiveSummary":"","keyIdeas":[{"idea":"","pages":[1]}],"concepts":[{"name":"","explanation":"","pages":[1]}],"actionPoints":[""],"questions":[""],"quotes":[{"text":"","page":1}]}.`;
      const raw = await geminiFromFile(fileUri, mimeType, prompt, true); return json({ ok: true, digest: parseJson(raw) });
    }
    return json({ error: "invalid_action" }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : "pdf_ai_failed"; return json({ error: code }, code.includes("not_configured") ? 503 : code.includes("quota") ? 429 : 502);
  }
}
