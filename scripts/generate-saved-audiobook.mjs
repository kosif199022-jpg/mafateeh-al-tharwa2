import { spawn } from "node:child_process";
import { access, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = process.cwd();
const READER_PATH = path.join(ROOT, "public", "reader.html");
const AUDIO_DIR = path.join(ROOT, "public", "audio");
const BUILD_DIR = path.join(ROOT, ".audio-build");
const PROGRESS_PATH = path.join(BUILD_DIR, "progress.json");
const ENDPOINT = process.env.AUDIOBOOK_TTS_URL ||
  "https://mafateeh-al-tharwa.alaya-1591.chatgpt.site/api/tts";
// Keep saved-audiobook requests comfortably below the Site function timeout.
const MAX_CHUNK = 1800;
const DEFAULT_CONCURRENCY = 2;
const RATE_LIMIT_WAIT_MS = 15 * 60 * 1000 + 10_000;
const GEMINI_QUOTA_WAIT_MS = 70_000;

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { from: 1, to: 34, concurrency: DEFAULT_CONCURRENCY, force: false, model: "3.1" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--chapter") options.from = options.to = Number(args[++index]);
    else if (arg === "--from") options.from = Number(args[++index]);
    else if (arg === "--to") options.to = Number(args[++index]);
    else if (arg === "--concurrency") options.concurrency = Number(args[++index]);
    else if (arg === "--model") options.model = String(args[++index]);
    else if (arg === "--force") options.force = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.from) || !Number.isInteger(options.to) ||
      options.from < 1 || options.to > 34 || options.from > options.to) {
    throw new Error("Chapter range must be between 1 and 34.");
  }
  options.concurrency = Math.max(1, Math.min(3, Number(options.concurrency) || 1));
  if (!["3.1", "2.5"].includes(options.model)) throw new Error("Model must be 3.1 or 2.5.");
  return options;
}

async function exists(file) {
  try {
    await access(file, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function loadBook() {
  const source = await readFile(READER_PATH, "utf8");
  const start = source.indexOf("const D = ");
  const end = source.indexOf("const CH", start);
  if (start < 0 || end < 0) throw new Error("Book data was not found in reader.html.");
  const book = vm.runInNewContext(`${source.slice(start, end)}\nD`, Object.create(null), {
    timeout: 1_000,
  });
  return book.parts.flatMap((part) => part.chapters);
}

function chapterText(chapter) {
  return [
    `الفصل ${chapter.no}. ${chapter.title}`,
    chapter.key,
    ...chapter.body.map(([, text]) => text),
    `الفكرة المحورية. ${chapter.idea}`,
    `التطبيق العملي. ${chapter.apply}`,
    `أسئلة للتفكير. ${chapter.qs.join(" ")}`,
    `تحدي سبعة أيام. ${chapter.week}`,
  ].filter(Boolean).join("\n\n");
}

function splitSpeech(value, max = MAX_CHUNK) {
  const text = String(value || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return [];
  const units = [];
  for (const paragraph of text.split(/\n+/).map((item) => item.trim()).filter(Boolean)) {
    if (paragraph.length <= max) {
      units.push(paragraph);
      continue;
    }
    const sentences = paragraph.match(/[^.!؟؛]+[.!؟؛]?/g) || [paragraph];
    for (let sentence of sentences) {
      sentence = sentence.trim();
      while (sentence.length > max) {
        let cut = sentence.lastIndexOf(" ", max);
        if (cut < max * 0.55) cut = max;
        units.push(sentence.slice(0, cut).trim());
        sentence = sentence.slice(cut).trim();
      }
      if (sentence) units.push(sentence);
    }
  }
  const chunks = [];
  let current = "";
  for (const unit of units) {
    const next = current ? `${current}\n\n${unit}` : unit;
    if (next.length > max && current) {
      chunks.push(current);
      current = unit;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function run(command, args, { input, inherit = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: [input === undefined ? "ignore" : "pipe", inherit ? "inherit" : "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    if (!inherit) child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(stdout).toString("utf8"));
      else reject(new Error(`${command} exited ${code}: ${Buffer.concat(stderr).toString("utf8").slice(-600)}`));
    });
    if (input !== undefined) child.stdin.end(input);
  });
}

async function validWave(file) {
  if (!(await exists(file))) return false;
  const handle = await import("node:fs/promises").then(({ open }) => open(file, "r"));
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, 12, 0);
    return bytesRead === 12 && header.subarray(0, 4).toString() === "RIFF" &&
      header.subarray(8, 12).toString() === "WAVE";
  } finally {
    await handle.close();
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestChunk(text, output, label, model) {
  if (await validWave(output)) return;
  const payload = JSON.stringify({ text, voice: "mixed", model });
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const status = (await run("curl", [
      "-sS", "--max-time", "120", "-o", output, "-w", "%{http_code}",
      "-H", "Content-Type: application/json", "--data-binary", "@-", ENDPOINT,
    ], { input: payload })).trim();
    if (status === "200" && await validWave(output)) return;
    let code = "";
    try {
      const errorBody = JSON.parse(await readFile(output, "utf8"));
      code = errorBody.error || "";
    } catch {}
    await rm(output, { force: true });
    if (code === "gemini_quota") {
      console.log(`[gemini-quota] ${label}; waiting 70 seconds before retrying.`);
      await wait(GEMINI_QUOTA_WAIT_MS);
      continue;
    }
    if (status === "429" || code === "rate_limit") {
      console.log(`[rate-limit] ${label}; waiting 15 minutes for the window to reset.`);
      const started = Date.now();
      while (Date.now() - started < RATE_LIMIT_WAIT_MS) {
        await wait(Math.min(60_000, RATE_LIMIT_WAIT_MS - (Date.now() - started)));
        const remaining = Math.max(0, Math.ceil((RATE_LIMIT_WAIT_MS - (Date.now() - started)) / 60_000));
        if (remaining) console.log(`[rate-limit] ${remaining} minute(s) remaining.`);
      }
      continue;
    }
    if (attempt === 8) throw new Error(`${label} failed with HTTP ${status}${code ? ` (${code})` : ""}.`);
    const pause = Math.min(45_000, 4_000 * attempt);
    console.log(`[retry ${attempt}/8] ${label}; HTTP ${status}${code ? ` (${code})` : ""}.`);
    await wait(pause);
  }
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  async function runner() {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
}

async function probeDuration(file) {
  const output = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file,
  ]);
  return Math.round(Number(output.trim()) || 0);
}

async function loadProgress() {
  try {
    return JSON.parse(await readFile(PROGRESS_PATH, "utf8"));
  } catch {
    return { version: 1, voice: "mixed", chapters: {} };
  }
}

async function saveProgress(progress) {
  await mkdir(BUILD_DIR, { recursive: true });
  await writeFile(PROGRESS_PATH, `${JSON.stringify(progress, null, 2)}\n`);
}

async function buildChapter(chapter, options, progress) {
  const number = String(chapter.no).padStart(2, "0");
  const target = path.join(AUDIO_DIR, `chapter-${number}.mp3`);
  const done = progress.chapters[chapter.no];
  if (!options.force && String(done?.source || "").startsWith("gemini-") && await exists(target)) {
    console.log(`[skip] ${number}/34 ${chapter.title}`);
    return done;
  }

  const chunks = splitSpeech(chapterText(chapter));
  const chapterDir = path.join(BUILD_DIR, `chapter-${number}`);
  await mkdir(chapterDir, { recursive: true });
  const hadExistingChunks = (await Promise.all(chunks.map((_, index) =>
    validWave(path.join(chapterDir, `chunk-${String(index + 1).padStart(3, "0")}.wav`))
  ))).some(Boolean);
  console.log(`[chapter] ${number}/34 ${chapter.title} — ${chunks.length} chunk(s)`);
  await mapLimit(chunks, options.concurrency, async (text, index) => {
    const chunkFile = path.join(chapterDir, `chunk-${String(index + 1).padStart(3, "0")}.wav`);
    await requestChunk(text, chunkFile, `chapter ${number}, chunk ${index + 1}/${chunks.length}`, options.model);
    console.log(`[audio] ${number}/34 chunk ${index + 1}/${chunks.length} ready`);
  });

  const concatList = path.join(chapterDir, "concat.txt");
  const lines = chunks.map((_, index) =>
    `file '${path.join(chapterDir, `chunk-${String(index + 1).padStart(3, "0")}.wav`).replaceAll("'", "'\\''")}'`
  );
  await writeFile(concatList, `${lines.join("\n")}\n`);
  const encoded = path.join(BUILD_DIR, `chapter-${number}.mp3`);
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", concatList,
    "-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "32k",
    "-id3v2_version", "3", "-metadata", `title=${chapter.title}`,
    "-metadata", "album=مفاتيح الثروة", "-metadata", "artist=حامد بن علي", encoded,
  ]);
  await rename(encoded, target);
  const info = await stat(target);
  const result = {
    no: chapter.no,
    title: chapter.title,
    file: `/audio/chapter-${number}.mp3`,
    duration: await probeDuration(target),
    bytes: info.size,
    voice: "mixed",
    source: hadExistingChunks && options.model === "2.5"
      ? "gemini-3.1-and-2.5-flash-tts-preview"
      : `gemini-${options.model}-flash-tts-preview`,
  };
  progress.chapters[chapter.no] = result;
  await saveProgress(progress);
  await rm(chapterDir, { recursive: true, force: true });
  console.log(`[saved] ${number}/34 ${result.duration}s ${(result.bytes / 1_048_576).toFixed(1)}MB`);
  return result;
}

async function main() {
  const options = parseArgs();
  await mkdir(AUDIO_DIR, { recursive: true });
  await mkdir(BUILD_DIR, { recursive: true });
  const chapters = await loadBook();
  const selected = chapters.filter((chapter) => chapter.no >= options.from && chapter.no <= options.to);
  const totalChunks = selected.reduce((sum, chapter) => sum + splitSpeech(chapterText(chapter)).length, 0);
  console.log(`[start] ${selected.length} chapter(s), ${totalChunks} audio request(s), model ${options.model}, concurrency ${options.concurrency}`);
  const progress = await loadProgress();
  for (const chapter of selected) await buildChapter(chapter, options, progress);

  const completed = chapters.map((chapter) => progress.chapters[chapter.no]).filter(Boolean);
  if (completed.length === chapters.length) {
    completed.sort((left, right) => left.no - right.no);
    const manifest = {
      version: 2,
      title: "مفاتيح الثروة — النسخة الصوتية الكاملة",
      voice: "mixed",
      sources: [...new Set(completed.map((chapter) => chapter.source))],
      generated_at: new Date().toISOString(),
      total_duration: completed.reduce((sum, chapter) => sum + chapter.duration, 0),
      total_bytes: completed.reduce((sum, chapter) => sum + chapter.bytes, 0),
      chapters: completed,
    };
    await writeFile(path.join(AUDIO_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await rm(PROGRESS_PATH, { force: true });
    console.log(`[complete] ${(manifest.total_duration / 3600).toFixed(2)} hours, ${(manifest.total_bytes / 1_048_576).toFixed(1)}MB`);
  } else {
    console.log(`[partial] ${completed.length}/34 chapters complete.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
