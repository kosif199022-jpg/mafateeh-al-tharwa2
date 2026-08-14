import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const ROOT = process.cwd();
const READER_PATH = path.join(ROOT, "public", "reader.html");
const AUDIO_DIR = path.join(ROOT, "public", "audio");
const OUTPUT_DIR = path.join(AUDIO_DIR, "timings");
const BUILD_DIR = path.join(ROOT, ".audio-timings-build");
const ALIGNER = process.env.ECHOGARDEN_BIN;

function parseRange() {
  const args = process.argv.slice(2);
  let from = 1;
  let to = 34;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--chapter") from = to = Number(args[++index]);
    else if (args[index] === "--from") from = Number(args[++index]);
    else if (args[index] === "--to") to = Number(args[++index]);
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > 34 || from > to) {
    throw new Error("Chapter range must be between 1 and 34.");
  }
  return { from, to };
}

async function loadBook() {
  const source = await readFile(READER_PATH, "utf8");
  const start = source.indexOf("const D = ");
  const end = source.indexOf("const CH", start);
  if (start < 0 || end < 0) throw new Error("Book data was not found in reader.html.");
  const book = vm.runInNewContext(`${source.slice(start, end)}\nD`, Object.create(null), { timeout: 1_000 });
  return book.parts.flatMap((part) => part.chapters);
}

function buildChapterTranscript(chapter) {
  let text = "";
  const visibleRanges = [];
  const append = (value, visible) => {
    if (!value) return;
    const start = text.length;
    text += value;
    if (visible) visibleRanges.push({ start, end: text.length });
  };
  const paragraph = (parts) => {
    if (text) text += "\n\n";
    for (const [value, visible] of parts) append(value, visible);
  };

  paragraph([[`الفصل ${chapter.no}. `, false], [chapter.title, true]]);
  paragraph([[chapter.key, true]]);
  for (const [, bodyText] of chapter.body) paragraph([[bodyText, true]]);
  paragraph([["الفكرة المحورية. ", false], [chapter.idea, true]]);
  paragraph([["التطبيق العملي. ", false], [chapter.apply, true]]);
  paragraph([
    ["أسئلة للتفكير. ", false],
    ...chapter.qs.flatMap((question, index) => index ? [[" ", false], [question, true]] : [[question, true]]),
  ]);
  paragraph([["تحدي سبعة أيام. ", false], [chapter.week, true]]);

  const tokens = [];
  for (const range of visibleRanges) {
    const value = text.slice(range.start, range.end);
    for (const match of value.matchAll(/\S+/gu)) {
      if (!/[\p{L}\p{N}]/u.test(match[0])) continue;
      tokens.push({
        text: match[0],
        start: range.start + match.index,
        end: range.start + match.index + match[0].length,
      });
    }
  }
  return { text, tokens };
}

function collectWords(timeline, output = []) {
  for (const item of timeline || []) {
    if (item.type === "word") output.push(item);
    else collectWords(item.timeline, output);
  }
  return output;
}

function compactTimeline(rawTimeline, transcript, chapter) {
  const alignedWords = collectWords(rawTimeline);
  const words = transcript.tokens.map((token) => {
    const matches = alignedWords.filter((word) =>
      word.endOffsetUtf16 > token.start && word.startOffsetUtf16 < token.end
    );
    if (!matches.length) return null;
    return [
      Math.min(...matches.map((word) => word.startTime)),
      Math.max(...matches.map((word) => word.endTime)),
    ];
  });

  for (let index = 0; index < words.length;) {
    if (words[index]) { index += 1; continue; }
    const start = index;
    while (index < words.length && !words[index]) index += 1;
    const end = index;
    const left = start > 0 ? words[start - 1][1] : 0;
    const right = end < words.length ? words[end][0] : rawTimeline.at(-1)?.endTime || left + (end - start);
    const step = Math.max(0.08, (right - left) / (end - start + 1));
    for (let cursor = start; cursor < end; cursor += 1) {
      const wordStart = left + step * (cursor - start + 0.15);
      words[cursor] = [wordStart, Math.min(right, wordStart + step * 0.7)];
    }
  }

  let previous = 0;
  const rounded = words.map(([start, end]) => {
    const safeStart = Math.max(previous, Number(start) || previous);
    const safeEnd = Math.max(safeStart + 0.04, Number(end) || safeStart + 0.18);
    previous = safeStart;
    return [Math.round(safeStart * 1000) / 1000, Math.round(safeEnd * 1000) / 1000];
  });
  return {
    version: 1,
    chapter: chapter.no,
    duration: Math.round((rawTimeline.at(-1)?.endTime || 0) * 1000) / 1000,
    wordCount: rounded.length,
    words: rounded,
  };
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

async function main() {
  if (!ALIGNER) throw new Error("Set ECHOGARDEN_BIN to the Echogarden executable.");
  const { from, to } = parseRange();
  const chapters = (await loadBook()).filter((chapter) => chapter.no >= from && chapter.no <= to);
  await mkdir(BUILD_DIR, { recursive: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  for (const chapter of chapters) {
    const number = String(chapter.no).padStart(2, "0");
    const transcriptPath = path.join(BUILD_DIR, `chapter-${number}.txt`);
    const rawTimelinePath = path.join(BUILD_DIR, `chapter-${number}.json`);
    const transcript = buildChapterTranscript(chapter);
    await writeFile(transcriptPath, `${transcript.text}\n`);
    await run(ALIGNER, [
      "align",
      path.join(AUDIO_DIR, `chapter-${number}.mp3`),
      transcriptPath,
      rawTimelinePath,
      "--language=ar",
      "--engine=dtw",
    ]);
    const rawTimeline = JSON.parse(await readFile(rawTimelinePath, "utf8"));
    const compact = compactTimeline(rawTimeline, transcript, chapter);
    const outputPath = path.join(OUTPUT_DIR, `chapter-${number}.json`);
    await writeFile(outputPath, `${JSON.stringify(compact)}\n`);
    await rm(rawTimelinePath, { force: true });
    console.log(`[aligned] chapter ${number}: ${compact.wordCount} timed words`);
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
