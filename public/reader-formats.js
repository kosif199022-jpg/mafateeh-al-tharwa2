/* مفاتيح الثروة — مُولّد الصيغ (ZIP / EPUB / DOCX / HTML / TXT) وقص MP3 — الإصدار 13
   هذا الملف لا يلمس الواجهة إطلاقًا: دوال خالصة قابلة للاختبار خارج المتصفح. */
(function (root) {
  'use strict';

  /* ───────────────────────── أدوات نصية ───────────────────────── */
  const xml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const pad2 = (value) => String(value).padStart(2, '0');
  const arabicDigits = (value) => String(value).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
  const encoder = new TextEncoder();
  const bytesOf = (value) => typeof value === 'string' ? encoder.encode(value) : value;

  /* ───────────────────────── كاتب ZIP قياسي ─────────────────────────
     يدعم الضغط deflate-raw عند توفره، ويعود إلى التخزين الخام عند غيابه.
     الأجزاء تُحفظ ككائنات Blob كي لا يبقى الملف الكبير كله في الذاكرة. */
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
    return table;
  })();

  function crc32(input) {
    const data = bytesOf(input);
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i += 1) crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  async function deflateRaw(data) {
    if (typeof CompressionStream === 'undefined') return null;
    try {
      const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      const buffer = await new Response(stream).arrayBuffer();
      const out = new Uint8Array(buffer);
      return out.length < data.length ? out : null;
    } catch (_) { return null; }
  }

  function dosStamp(date = new Date()) {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2));
    const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, day };
  }

  /* files: [{ name, data:string|Uint8Array|Blob, store?:boolean, size?, crc? }] */
  async function zip(files, { mime = 'application/zip', onProgress } = {}) {
    const chunks = [];
    const central = [];
    const stamp = dosStamp();
    let offset = 0;
    const push = (part, length) => { chunks.push(part); offset += length; };

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const nameBytes = encoder.encode(file.name);
      let payload = file.data;
      let raw = null;
      let size = file.size;
      let crc = file.crc;

      if (!(payload instanceof Blob)) { raw = bytesOf(payload); size = raw.length; crc = crc32(raw); }
      if (!Number.isFinite(size) || !Number.isFinite(crc)) throw new Error('zip: blob entries need size and crc');

      let method = 0;
      let body = raw ? new Blob([raw]) : payload;
      let bodySize = size;
      if (!file.store && raw && raw.length > 220) {
        const packed = await deflateRaw(raw);
        if (packed) { method = 8; body = new Blob([packed]); bodySize = packed.length; }
      }
      raw = null;

      const header = new Uint8Array(30 + nameBytes.length);
      const view = new DataView(header.buffer);
      view.setUint32(0, 0x04034B50, true);
      view.setUint16(4, method === 8 ? 20 : 10, true);
      view.setUint16(6, 0x0800, true);
      view.setUint16(8, method, true);
      view.setUint16(10, stamp.time, true);
      view.setUint16(12, stamp.day, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, bodySize, true);
      view.setUint32(22, size, true);
      view.setUint16(26, nameBytes.length, true);
      header.set(nameBytes, 30);

      central.push({ nameBytes, method, crc, bodySize, size, offset });
      push(header, header.length);
      push(body, bodySize);
      onProgress?.((index + 1) / files.length, file.name);
    }

    const directoryStart = offset;
    for (const entry of central) {
      const record = new Uint8Array(46 + entry.nameBytes.length);
      const view = new DataView(record.buffer);
      view.setUint32(0, 0x02014B50, true);
      view.setUint16(4, 0x031E, true);
      view.setUint16(6, entry.method === 8 ? 20 : 10, true);
      view.setUint16(8, 0x0800, true);
      view.setUint16(10, entry.method, true);
      view.setUint16(12, stamp.time, true);
      view.setUint16(14, stamp.day, true);
      view.setUint32(16, entry.crc, true);
      view.setUint32(20, entry.bodySize, true);
      view.setUint32(24, entry.size, true);
      view.setUint16(28, entry.nameBytes.length, true);
      view.setUint32(42, entry.offset, true);
      record.set(entry.nameBytes, 46);
      push(record, record.length);
    }

    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054B50, true);
    endView.setUint16(8, central.length, true);
    endView.setUint16(10, central.length, true);
    endView.setUint32(12, offset - directoryStart, true);
    endView.setUint32(16, directoryStart, true);
    push(end, end.length);

    return new Blob(chunks, { type: mime });
  }

  /* ───────────────────────── نموذج الكتاب ─────────────────────────
     كل المولّدات تقرأ من الشكل نفسه، فيخرج النص متطابقًا في كل صيغة. */
  const defaults = {
    cover: true, preface: true, toc: true, key: true, summary: true,
    questions: true, exercise: true, notes: false, refs: true, method: true,
  };
  const settings = (options) => ({ ...defaults, ...(options || {}) });
  const chaptersOf = (model) => model.parts.flatMap((part) => part.chapters.map((chapter) => ({ ...chapter, partName: part.name, partTitle: part.title })));
  const chapterSlug = (chapter) => `chapter-${pad2(chapter.no)}`;

  function chapterBlocks(chapter, options) {
    const blocks = [];
    if (options.key && chapter.key) blocks.push({ type: 'key', label: 'مفتاح الفصل', text: chapter.key });
    chapter.body.forEach(([kind, text]) => blocks.push({ type: kind === 'h' ? 'head' : 'para', text }));
    if (options.summary && chapter.idea) blocks.push({ type: 'card', label: 'الفكرة المحورية', text: chapter.idea });
    if (options.summary && chapter.apply) blocks.push({ type: 'card', label: 'تطبيق عملي', text: chapter.apply });
    if (options.questions && chapter.qs?.length) blocks.push({ type: 'list', label: 'أسئلة للتأمل', items: chapter.qs });
    if (options.exercise && chapter.week) blocks.push({ type: 'card', label: 'تمرين الأسبوع', text: chapter.week });
    return blocks;
  }

  /* ───────────────────────── EPUB 3 عربي من اليمين لليسار ───────────────────────── */
  const EPUB_CSS = `@charset "utf-8";
html{direction:rtl}
body{font-family:"Amiri","Geeza Pro","Traditional Arabic",serif;line-height:1.9;text-align:justify;margin:0 4%;color:#17233b}
h1,h2,h3{font-family:"Amiri","Geeza Pro",serif;line-height:1.4;text-align:right;color:#1f3352}
h1{font-size:1.7em;margin:1.2em 0 .3em}
h2{font-size:1.42em;margin:0 0 .2em}
h3{font-size:1.1em;color:#8a6427;margin:1.6em 0 .5em}
p{margin:0 0 .85em;text-indent:0}
.eyebrow{color:#8a6427;font-size:.82em;letter-spacing:.02em;margin:0 0 .2em}
.key,.card{border:1px solid #e0d3b6;background:#fbf7ef;border-radius:10px;padding:.7em .9em;margin:1.1em 0}
.key b,.card b{display:block;color:#8a6427;font-size:.8em;margin-bottom:.25em}
.key p,.card p{margin:0}
ul{margin:.6em 1.2em .9em 0;padding:0}
li{margin-bottom:.4em}
.part{text-align:center;margin:22% 0}
.part p{color:#8a6427}
.cover{text-align:center;margin:0;padding:0}
.cover img,.cover svg{max-width:100%;height:auto}
blockquote{border-right:3px solid #c8a458;margin:1em 0;padding:.2em 1em .2em 0;color:#3b3323}
hr{border:0;border-top:1px solid #e2d9c6;margin:1.6em 20%}`;

  function epubDocument(title, body, extra = '') {
    return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="ar" xml:lang="ar" dir="rtl">
<head><meta charset="utf-8"/><title>${xml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/>${extra}</head>
<body dir="rtl">${body}</body></html>`;
  }

  function epubBlocks(blocks) {
    return blocks.map((block) => {
      if (block.type === 'head') return `<h3>${xml(block.text)}</h3>`;
      if (block.type === 'para') return `<p>${xml(block.text)}</p>`;
      if (block.type === 'key') return `<div class="key"><b>${xml(block.label)}</b><p>${xml(block.text)}</p></div>`;
      if (block.type === 'card') return `<div class="card"><b>${xml(block.label)}</b><p>${xml(block.text)}</p></div>`;
      if (block.type === 'list') return `<div class="card"><b>${xml(block.label)}</b><ul>${block.items.map((item) => `<li>${xml(item)}</li>`).join('')}</ul></div>`;
      return '';
    }).join('\n');
  }

  function coverSvg(meta) {
    return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1800" width="1200" height="1800">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0A1324"/><stop offset="1" stop-color="#284A75"/></linearGradient></defs>
<rect width="1200" height="1800" fill="url(#g)"/>
<rect x="52" y="52" width="1096" height="1696" fill="none" stroke="#C39A59" stroke-width="6"/>
<g fill="none" stroke="#C39A59" stroke-width="2" opacity=".38" transform="translate(600,690)">
<circle r="180"/><circle r="132"/><circle r="86"/>
<polygon points="0,-236 236,0 0,236 -236,0"/><polygon points="-167,-167 167,-167 167,167 -167,167"/></g>
<g fill="#D5B477" transform="translate(600,690)"><circle cx="0" cy="-58" r="34" fill="none" stroke="#D5B477" stroke-width="12"/><rect x="-6" y="-24" width="12" height="118" rx="6"/><rect x="4" y="34" width="42" height="12" rx="6"/><rect x="4" y="66" width="30" height="11" rx="5"/></g>
<text x="600" y="1180" text-anchor="middle" font-family="Amiri, Geeza Pro, serif" font-size="126" fill="#D5B477" direction="rtl">${xml(meta.title)}</text>
<rect x="520" y="1232" width="160" height="4" fill="#C39A59"/>
<text x="600" y="1330" text-anchor="middle" font-family="Geeza Pro, sans-serif" font-size="44" fill="#C6D2E6" direction="rtl">${xml(meta.author)}</text>
<text x="600" y="1400" text-anchor="middle" font-family="Geeza Pro, sans-serif" font-size="32" fill="#8FA5C4" direction="rtl">${xml(meta.role || '')}</text>
</svg>`;
  }

  async function buildEpub(model, rawOptions) {
    const options = settings(rawOptions);
    const meta = model.meta;
    const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const uid = `urn:uuid:${(root.crypto?.randomUUID?.() || `mafateeh-${Date.now()}`)}`;
    const files = [{ name: 'mimetype', data: 'application/epub+zip', store: true }];
    const manifest = [];
    const spine = [];
    const navItems = [];

    files.push({
      name: 'META-INF/container.xml',
      data: `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    });
    files.push({ name: 'OEBPS/style.css', data: EPUB_CSS });
    manifest.push('<item id="style" href="style.css" media-type="text/css"/>');

    if (options.cover) {
      files.push({ name: 'OEBPS/cover.svg', data: coverSvg(meta) });
      files.push({ name: 'OEBPS/cover.xhtml', data: epubDocument(meta.title, `<div class="cover"><img src="cover.svg" alt="${xml(meta.title)}"/></div>`) });
      manifest.push('<item id="cover-image" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/>');
      manifest.push('<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>');
      spine.push('<itemref idref="cover"/>');
    }

    if (options.preface && (meta.preface?.length || meta.note)) {
      const body = `<h1>${xml('مقدمة الكتاب')}</h1>${(meta.preface || []).map((p) => `<p>${xml(p)}</p>`).join('')}`
        + (meta.note ? `<div class="card"><b>${xml('ملاحظة منهجية')}</b><p>${xml(meta.note)}</p></div>` : '')
        + (options.method && meta.method?.length ? meta.method.map((p) => `<p>${xml(p)}</p>`).join('') : '');
      files.push({ name: 'OEBPS/preface.xhtml', data: epubDocument('مقدمة الكتاب', body) });
      manifest.push('<item id="preface" href="preface.xhtml" media-type="application/xhtml+xml"/>');
      spine.push('<itemref idref="preface"/>');
      navItems.push({ href: 'preface.xhtml', label: 'مقدمة الكتاب' });
    }

    model.parts.forEach((part, partIndex) => {
      const partId = `part${partIndex + 1}`;
      const body = `<section class="part" epub:type="part"><p class="eyebrow">${xml(part.name)}</p><h1>${xml(part.title)}</h1><p>${xml(part.intro || '')}</p></section>`;
      files.push({ name: `OEBPS/${partId}.xhtml`, data: epubDocument(part.title, body) });
      manifest.push(`<item id="${partId}" href="${partId}.xhtml" media-type="application/xhtml+xml"/>`);
      spine.push(`<itemref idref="${partId}"/>`);
      const children = [];
      part.chapters.forEach((chapter) => {
        const id = chapterSlug(chapter);
        const body = `<p class="eyebrow">${xml(part.name)} · الفصل ${xml(arabicDigits(chapter.no))}</p><h2>${xml(chapter.title)}</h2>${epubBlocks(chapterBlocks(chapter, options))}`;
        files.push({ name: `OEBPS/${id}.xhtml`, data: epubDocument(chapter.title, body) });
        manifest.push(`<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`);
        spine.push(`<itemref idref="${id}"/>`);
        children.push({ href: `${id}.xhtml`, label: `${chapter.no}. ${chapter.title}` });
      });
      navItems.push({ href: `${partId}.xhtml`, label: `${part.name} — ${part.title}`, children });
    });

    if (options.notes && model.notes?.length) {
      const body = `<h1>${xml('دفتر القارئ')}</h1>` + model.notes.map((note) => `<blockquote><p>«${xml(note.text)}»</p>${note.note ? `<p>${xml(note.note)}</p>` : ''}<p class="eyebrow">${xml(`الفصل ${arabicDigits(note.no)} · ${note.chapterTitle || ''}`)}</p></blockquote>`).join('');
      files.push({ name: 'OEBPS/notebook.xhtml', data: epubDocument('دفتر القارئ', body) });
      manifest.push('<item id="notebook" href="notebook.xhtml" media-type="application/xhtml+xml"/>');
      spine.push('<itemref idref="notebook"/>');
      navItems.push({ href: 'notebook.xhtml', label: 'دفتر القارئ' });
    }

    if (options.refs && model.refs) {
      const list = [...(model.refs.ar || []), ...(model.refs.en || [])];
      if (list.length) {
        const body = `<h1>${xml('المراجع')}</h1><ul>${list.map((item) => `<li>${xml(item)}</li>`).join('')}</ul>`;
        files.push({ name: 'OEBPS/refs.xhtml', data: epubDocument('المراجع', body) });
        manifest.push('<item id="refs" href="refs.xhtml" media-type="application/xhtml+xml"/>');
        spine.push('<itemref idref="refs"/>');
        navItems.push({ href: 'refs.xhtml', label: 'المراجع' });
      }
    }

    const navList = (items) => `<ol>${items.map((item) => `<li><a href="${item.href}">${xml(item.label)}</a>${item.children?.length ? navList(item.children) : ''}</li>`).join('')}</ol>`;
    files.push({
      name: 'OEBPS/nav.xhtml',
      data: epubDocument('الفهرس', `<nav epub:type="toc" id="toc" role="doc-toc"><h1>${xml('الفهرس')}</h1>${navList(navItems)}</nav>`),
    });
    manifest.push('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>');
    if (options.toc) spine.splice(options.cover ? 1 : 0, 0, '<itemref idref="nav"/>');

    files.push({
      name: 'OEBPS/content.opf',
      data: `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="ar" dir="rtl">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${xml(uid)}</dc:identifier>
<dc:title>${xml(meta.title)}</dc:title>
<dc:creator>${xml(meta.author)}</dc:creator>
<dc:language>ar</dc:language>
<dc:description>${xml(meta.subtitle || '')}</dc:description>
<meta property="dcterms:modified">${stamp}</meta>
${options.cover ? '<meta name="cover" content="cover-image"/>' : ''}
</metadata>
<manifest>${manifest.join('')}</manifest>
<spine page-progression-direction="rtl">${spine.join('')}</spine>
</package>`,
    });

    return zip(files, { mime: 'application/epub+zip' });
  }

  /* ───────────────────────── DOCX عربي قابل للتحرير ───────────────────────── */
  const docxRun = (text, { bold = false, size = 24, color = '17233B', italic = false } = {}) =>
    `<w:r><w:rPr><w:rFonts w:ascii="Sakkal Majalla" w:hAnsi="Sakkal Majalla" w:cs="Sakkal Majalla"/><w:b w:val="${bold ? 1 : 0}"/><w:bCs w:val="${bold ? 1 : 0}"/>${italic ? '<w:i/><w:iCs/>' : ''}<w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:rtl/><w:lang w:bidi="ar-SA"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;

  const docxParagraph = (text, options = {}) => {
    const { style = '', align = 'both', spacing = 120, pageBreak = false, indentRight = 0, shade = '', border = false } = options;
    const pPr = `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}<w:bidi/>${pageBreak ? '<w:pageBreakBefore/>' : ''}`
      + `<w:spacing w:before="${spacing}" w:after="${spacing}" w:line="360" w:lineRule="auto"/>`
      + (indentRight ? `<w:ind w:right="${indentRight}"/>` : '')
      + (shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>` : '')
      + (border ? '<w:pBdr><w:right w:val="single" w:sz="18" w:space="6" w:color="C39A59"/></w:pBdr>' : '')
      + `<w:jc w:val="${align}"/></w:pPr>`;
    return `<w:p>${pPr}${docxRun(text, options)}</w:p>`;
  };

  function buildDocx(model, rawOptions) {
    const options = settings(rawOptions);
    const meta = model.meta;
    const body = [];

    if (options.cover) {
      body.push(docxParagraph(meta.title, { align: 'center', bold: true, size: 72, color: '1F3352', spacing: 400 }));
      body.push(docxParagraph(meta.subtitle || '', { align: 'center', size: 26, color: '8A6427' }));
      body.push(docxParagraph(meta.author, { align: 'center', size: 30, bold: true, spacing: 400 }));
      if (meta.role) body.push(docxParagraph(meta.role, { align: 'center', size: 22, color: '6B7280' }));
    }
    if (options.preface && meta.preface?.length) {
      body.push(docxParagraph('مقدمة الكتاب', { style: 'Heading1', align: 'right', bold: true, size: 40, color: '1F3352', pageBreak: options.cover }));
      meta.preface.forEach((text) => body.push(docxParagraph(text)));
      if (meta.note) body.push(docxParagraph(meta.note, { shade: 'FBF7EF', border: true, size: 22, color: '4A5768' }));
    }

    model.parts.forEach((part) => {
      body.push(docxParagraph(part.name, { align: 'center', color: '8A6427', size: 24, bold: true, pageBreak: true, spacing: 600 }));
      body.push(docxParagraph(part.title, { style: 'Heading1', align: 'center', bold: true, size: 52, color: '1F3352' }));
      if (part.intro) body.push(docxParagraph(part.intro, { align: 'center', size: 24, color: '4A5768' }));
      part.chapters.forEach((chapter) => {
        body.push(docxParagraph(`${part.name} · الفصل ${arabicDigits(chapter.no)}`, { color: '8A6427', size: 20, bold: true, align: 'right', pageBreak: true }));
        body.push(docxParagraph(chapter.title, { style: 'Heading2', align: 'right', bold: true, size: 40, color: '1F3352' }));
        chapterBlocks(chapter, options).forEach((block) => {
          if (block.type === 'head') body.push(docxParagraph(block.text, { style: 'Heading3', align: 'right', bold: true, size: 28, color: '8A6427' }));
          else if (block.type === 'para') body.push(docxParagraph(block.text));
          else if (block.type === 'list') {
            body.push(docxParagraph(block.label, { bold: true, color: '8A6427', size: 22, align: 'right' }));
            block.items.forEach((item) => body.push(docxParagraph(`— ${item}`, { indentRight: 340 })));
          } else {
            body.push(docxParagraph(block.label, { bold: true, color: '8A6427', size: 22, align: 'right', shade: 'FBF7EF' }));
            body.push(docxParagraph(block.text, { shade: 'FBF7EF', border: true }));
          }
        });
      });
    });

    if (options.notes && model.notes?.length) {
      body.push(docxParagraph('دفتر القارئ', { style: 'Heading1', align: 'center', bold: true, size: 44, color: '1F3352', pageBreak: true }));
      model.notes.forEach((note) => {
        body.push(docxParagraph(`«${note.text}»`, { bold: true, border: true, indentRight: 200 }));
        if (note.note) body.push(docxParagraph(note.note, { size: 22, color: '4A5768', indentRight: 200 }));
        body.push(docxParagraph(`الفصل ${arabicDigits(note.no)} · ${note.chapterTitle || ''}`, { size: 18, color: '8A6427', indentRight: 200 }));
      });
    }

    if (options.refs && model.refs) {
      const list = [...(model.refs.ar || []), ...(model.refs.en || [])];
      if (list.length) {
        body.push(docxParagraph('المراجع', { style: 'Heading1', align: 'right', bold: true, size: 40, color: '1F3352', pageBreak: true }));
        list.forEach((item) => body.push(docxParagraph(`— ${item}`, { size: 22, indentRight: 240 })));
      }
    }

    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/><w:bidi/><w:docGrid w:linePitch="360"/></w:sectPr></w:body></w:document>`;

    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Sakkal Majalla" w:hAnsi="Sakkal Majalla" w:cs="Sakkal Majalla"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:rtl/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:bidi/><w:jc w:val="both"/><w:spacing w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:outlineLvl w:val="0"/><w:bidi/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="52"/><w:szCs w:val="52"/><w:color w:val="1F3352"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:outlineLvl w:val="1"/><w:bidi/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="40"/><w:szCs w:val="40"/><w:color w:val="1F3352"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:outlineLvl w:val="2"/><w:bidi/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="8A6427"/></w:rPr></w:style>
</w:styles>`;

    return zip([
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
      { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(meta.title)}</dc:title><dc:creator>${xml(meta.author)}</dc:creator><dc:language>ar</dc:language></cp:coreProperties>` },
      { name: 'word/styles.xml', data: styles },
      { name: 'word/document.xml', data: document },
    ], { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  /* ───────────────────────── نص عادي وMarkdown ───────────────────────── */
  function buildText(model, rawOptions) {
    const options = settings(rawOptions);
    const lines = [model.meta.title, model.meta.subtitle || '', model.meta.author, '', '═'.repeat(40), ''];
    if (options.preface) (model.meta.preface || []).forEach((text) => lines.push(text, ''));
    model.parts.forEach((part) => {
      lines.push('', '═'.repeat(40), `${part.name} — ${part.title}`, '═'.repeat(40), '');
      if (part.intro) lines.push(part.intro, '');
      part.chapters.forEach((chapter) => {
        lines.push('', `الفصل ${arabicDigits(chapter.no)}: ${chapter.title}`, '─'.repeat(30), '');
        chapterBlocks(chapter, options).forEach((block) => {
          if (block.type === 'head') lines.push('', `【 ${block.text} 】`, '');
          else if (block.type === 'para') lines.push(block.text, '');
          else if (block.type === 'list') lines.push(`${block.label}:`, ...block.items.map((item) => `  • ${item}`), '');
          else lines.push(`${block.label}: ${block.text}`, '');
        });
      });
    });
    return lines.join('\n');
  }

  function buildMarkdown(model, rawOptions) {
    const options = settings(rawOptions);
    const lines = [`# ${model.meta.title}`, '', `**${model.meta.subtitle || ''}**`, '', `— ${model.meta.author}`, ''];
    if (options.preface) (model.meta.preface || []).forEach((text) => lines.push(text, ''));
    model.parts.forEach((part) => {
      lines.push('', `## ${part.name} — ${part.title}`, '');
      if (part.intro) lines.push(`_${part.intro}_`, '');
      part.chapters.forEach((chapter) => {
        lines.push(`### الفصل ${chapter.no}: ${chapter.title}`, '');
        chapterBlocks(chapter, options).forEach((block) => {
          if (block.type === 'head') lines.push(`#### ${block.text}`, '');
          else if (block.type === 'para') lines.push(block.text, '');
          else if (block.type === 'list') lines.push(`**${block.label}**`, '', ...block.items.map((item) => `- ${item}`), '');
          else lines.push(`> **${block.label}** — ${block.text}`, '');
        });
      });
    });
    return lines.join('\n');
  }

  /* ───────────────────────── قص MP3 على حدود الإطارات ─────────────────────────
     يُنتج ملفًا صالحًا للتشغيل بحجم صغير، دون إعادة ترميز ودون فقد الجودة. */
  const MP3_BITRATE = {
    1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
  };
  const MP3_RATE = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

  function mp3Frames(input) {
    const data = bytesOf(input);
    let index = 0;
    if (data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) {
      index = 10 + ((data[6] & 0x7F) << 21 | (data[7] & 0x7F) << 14 | (data[8] & 0x7F) << 7 | (data[9] & 0x7F));
    }
    const frames = [];
    let time = 0;
    while (index + 4 <= data.length) {
      if (data[index] !== 0xFF || (data[index + 1] & 0xE0) !== 0xE0) { index += 1; continue; }
      const versionBits = (data[index + 1] >> 3) & 0x03;
      const layerBits = (data[index + 1] >> 1) & 0x03;
      if (versionBits === 1 || layerBits !== 1) { index += 1; continue; }
      const bitrateIndex = (data[index + 2] >> 4) & 0x0F;
      const rateIndex = (data[index + 2] >> 2) & 0x03;
      if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) { index += 1; continue; }
      const version1 = versionBits === 3;
      const bitrate = MP3_BITRATE[version1 ? 1 : 2][bitrateIndex] * 1000;
      const sampleRate = MP3_RATE[versionBits][rateIndex];
      const padding = (data[index + 2] >> 1) & 1;
      const samples = version1 ? 1152 : 576;
      const length = Math.floor((samples / 8) * bitrate / sampleRate) + padding;
      if (length < 24 || index + length > data.length) break;
      frames.push({ offset: index, length, time });
      time += samples / sampleRate;
      index += length;
    }
    return { frames, duration: time, data };
  }

  function mp3Slice(input, startSeconds, endSeconds) {
    const { frames, data, duration } = mp3Frames(input);
    if (!frames.length) return null;
    const start = Math.max(0, Math.min(startSeconds, duration));
    const end = Math.max(start + 0.05, Math.min(endSeconds, duration + 1));
    let first = frames.findIndex((frame) => frame.time >= start);
    if (first === -1) first = frames.length - 1;
    if (first > 0 && frames[first].time > start) first -= 1;
    let last = first;
    while (last + 1 < frames.length && frames[last].time < end) last += 1;
    const from = frames[first].offset;
    const to = frames[last].offset + frames[last].length;
    return { bytes: data.slice(from, to), duration: frames[last].time - frames[first].time, offset: frames[first].time };
  }

  const formats = { xml, crc32, zip, buildEpub, buildDocx, buildText, buildMarkdown, chaptersOf, chapterBlocks, coverSvg, mp3Frames, mp3Slice, arabicDigits, version: 13 };
  root.BookFormats = formats;
  if (typeof module !== 'undefined' && module.exports) module.exports = formats;
})(typeof globalThis !== 'undefined' ? globalThis : this);
