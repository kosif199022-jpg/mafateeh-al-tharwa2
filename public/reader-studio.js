/* مفاتيح الثروة — استوديو التصدير والصوت — الإصدار 13
   يعيد بناء مركز التصدير: PDF مطابق لتنسيق الكتاب، EPUB، Word، كانفا،
   تنزيل الكتاب الصوتي كاملًا أو فصلًا واحدًا، واستوديو مقاطع النص المحدد. */
(function () {
  'use strict';

  const one = (selector, root = document) => root.querySelector(selector);
  const many = (selector, root = document) => [...root.querySelectorAll(selector)];
  const RT = window.RT || {};
  const F = window.BookFormats;
  const h = (value) => esc(String(value ?? ''));
  const pad2 = (value) => String(value).padStart(2, '0');
  const chapterFile = (index) => `/audio/chapter-${pad2(CH[index].no)}.mp3`;
  const timingFile = (index) => `/audio/timings/chapter-${pad2(CH[index].no)}.json?v=1`;
  const safeName = RT.safeFileName || ((value) => String(value || 'file').replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 90));
  const bytesLabel = (bytes) => !bytes ? '—' : bytes < 1048576 ? `${AR((bytes / 1024).toFixed(0))} ك.ب` : `${AR((bytes / 1048576).toFixed(1))} م.ب`;
  const clock = (seconds) => {
    if (!Number.isFinite(seconds)) return '—';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = Math.floor(seconds % 60);
    return hours ? `${AR(hours)}:${AR(pad2(minutes))}:${AR(pad2(rest))}` : `${AR(minutes)}:${AR(pad2(rest))}`;
  };
  const download = RT.downloadBlob || ((blob, name) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  });
  const openSheet = RT.openSheet || ((name) => { one(`#${name}Shade`)?.classList.add('on'); one(`#${name}Shade`)?.setAttribute('aria-hidden', 'false'); });
  const closeSheet = RT.closeSheet || ((name) => { one(`#${name}Shade`)?.classList.remove('on'); one(`#${name}Shade`)?.setAttribute('aria-hidden', 'true'); });

  /* حفظ الملف: على الجوال تكون «المشاركة» أضمن طريق إلى تطبيق الملفات. */
  async function deliver(blob, name, { preferShare = false } = {}) {
    const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
    const canShare = navigator.canShare?.({ files: [file] }) && navigator.share;
    if (preferShare && canShare) {
      try { await navigator.share({ files: [file], title: name }); return 'share'; } catch (error) { if (error?.name === 'AbortError') return 'cancel'; }
    }
    download(blob, name);
    return 'download';
  }

  /* ═════════════════════ نموذج الكتاب حسب النطاق ═════════════════════ */
  const partOf = (index) => D.parts.find((part) => part.chapters.some((chapter) => chapter.no === CH[index].no)) || D.parts[0];
  const notesOf = (numbers) => allMarks()
    .filter((mark) => !numbers || numbers.has(mark.no))
    .sort((a, b) => a.no - b.no || (a.createdAt || 0) - (b.createdAt || 0))
    .map((mark) => ({ ...mark, chapterTitle: CH.find((chapter) => chapter.no === mark.no)?.title || '' }));

  function model(scope) {
    const meta = D.meta;
    if (scope === 'chapter') {
      const part = partOf(cur);
      const chapter = CH[cur];
      return { meta, parts: [{ ...part, chapters: [chapter] }], refs: null, notes: notesOf(new Set([chapter.no])), scopeLabel: `الفصل ${AR(chapter.no)}: ${chapter.title}` };
    }
    if (scope === 'part') {
      const part = partOf(cur);
      return { meta, parts: [part], refs: null, notes: notesOf(new Set(part.chapters.map((chapter) => chapter.no))), scopeLabel: `${part.name}: ${part.title}` };
    }
    if (scope === 'stars') {
      const saved = new Set(S.get('stars', []));
      const parts = D.parts.map((part) => ({ ...part, chapters: part.chapters.filter((chapter) => saved.has(chapter.no)) })).filter((part) => part.chapters.length);
      return { meta, parts, refs: null, notes: notesOf(saved), scopeLabel: `الفصول المحفوظة (${AR(saved.size)})` };
    }
    if (scope === 'notes') return { meta, parts: [], refs: null, notes: notesOf(null), scopeLabel: 'دفتر القارئ' };
    return { meta, parts: D.parts, refs: D.refs, notes: notesOf(null), scopeLabel: 'الكتاب كاملًا' };
  }

  const wordCount = (data) => data.parts.reduce((total, part) => total + part.chapters.reduce((sum, chapter) => sum + chapter.body.reduce((count, [, text]) => count + text.split(/\s+/).length, 0), 0), 0);

  /* ═════════════════════ محرك الطباعة وPDF ═════════════════════
     يُبنى الكتاب داخل الصفحة نفسها ثم يُطبع؛ لا نوافذ منبثقة تحجبها المتصفحات،
     ويعمل على iOS حيث «طباعة» تعني «حفظ PDF». */
  const PAGES = {
    a4: { size: '210mm 297mm', margin: '20mm 18mm 18mm', label: 'A4 قياسي', font: '12.6pt' },
    book: { size: '152.4mm 228.6mm', margin: '16mm 15mm', label: 'كتاب مطبوع ٦×٩ بوصة', font: '11.6pt' },
    letter: { size: '215.9mm 279.4mm', margin: '20mm 18mm', label: 'Letter أمريكي', font: '12.6pt' },
    square: { size: '285.75mm 285.75mm', margin: '24mm', label: 'كانفا مربع ١٠٨٠', font: '17pt' },
    story: { size: '285.75mm 508mm', margin: '30mm 26mm', label: 'كانفا ستوري ١٠٨٠×١٩٢٠', font: '19pt' },
  };
  const THEMES = {
    classic: { label: 'كلاسيكي ذهبي', page: '#ffffff', ink: '#16233b', soft: '#5a6779', gold: '#9c7534', navy: '#1f3352', box: '#fbf7ef', line: '#e3d9c4', cover: 'linear-gradient(158deg,#0a1324,#26456e)', coverInk: '#ffffff' },
    warm: { label: 'ورق دافئ', page: '#fbf6ea', ink: '#3a2e20', soft: '#6d5b45', gold: '#8d6428', navy: '#4a3a24', box: '#f4ead6', line: '#e0d3b8', cover: 'linear-gradient(158deg,#3a2b18,#7a5a2c)', coverInk: '#fdf6e6' },
    plain: { label: 'أبيض اقتصادي', page: '#ffffff', ink: '#1a1a1a', soft: '#555555', gold: '#444444', navy: '#111111', box: '#f4f4f4', line: '#d8d8d8', cover: '#ffffff', coverInk: '#111111' },
    canva: { label: 'كانفا مفتوح', page: '#ffffff', ink: '#101828', soft: '#5b6473', gold: '#b4894a', navy: '#1f3352', box: '#f7f4ee', line: '#e6e2d8', cover: 'linear-gradient(150deg,#12203a,#3d6ea8)', coverInk: '#ffffff' },
  };

  function printStyles(pageKey, themeKey) {
    const page = PAGES[pageKey] || PAGES.a4;
    const t = THEMES[themeKey] || THEMES.classic;
    return `@page{size:${page.size};margin:${page.margin}}
@media print{html,body{background:#fff!important;margin:0!important;padding:0!important;height:auto!important;min-height:0!important;overflow:visible!important}
body>*{display:none!important}body>#printStage{display:block!important}}
#printStage{display:none;color:${t.ink};background:${t.page};font-family:var(--serif);font-size:${page.font};line-height:1.9;text-align:justify;-webkit-print-color-adjust:exact;print-color-adjust:exact}
#printStage *{box-sizing:border-box}
#printStage .pcover{page-break-after:always;break-after:page;height:calc(100% - 2px);min-height:88vh;display:flex;align-items:center;justify-content:center;text-align:center;background:${t.cover};color:${t.coverInk};padding:14mm;position:relative}
#printStage .pcover .frame{border:2px solid ${t.gold};padding:12mm 8mm;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4mm;position:relative;overflow:hidden}
#printStage .pcover svg.mk{width:34mm;opacity:.9;color:${t.gold}}
#printStage .pcover .eyebrow{font-size:.72em;letter-spacing:.06em;color:${t.gold}}
#printStage .pcover h1{font-size:2.9em;line-height:1.2;margin:2mm 0}
#printStage .pcover .rule{width:22mm;height:2px;background:${t.gold};margin:2mm auto}
#printStage .pcover p{font-size:.92em;max-width:36em;opacity:.92}
#printStage .pcover .author{margin-top:6mm;font-size:1.05em;font-weight:700}
#printStage .pcover .role{font-size:.76em;color:${t.gold}}
#printStage .ptoc,#printStage .ppart,#printStage .pchapter,#printStage .pnotes,#printStage .prefs{page-break-before:always;break-before:page}
#printStage .front{page-break-after:always;break-after:page}
#printStage h2.section{font-family:var(--serif);font-size:1.7em;color:${t.navy};margin:0 0 4mm;text-align:center}
#printStage h2.section::after{content:"";display:block;width:18mm;height:2px;background:${t.gold};margin:3mm auto 0}
#printStage .toc-part{margin:6mm 0 2mm;color:${t.gold};font-weight:800;font-size:.92em;border-bottom:1px solid ${t.line};padding-bottom:1.5mm}
#printStage .toc-row{display:flex;gap:3mm;font-size:.86em;padding:1.1mm 0;color:${t.soft}}
#printStage .toc-row b{color:${t.navy};font-weight:700;min-width:9mm}
#printStage .ppart{text-align:center;padding-top:26%}
#printStage .ppart .eyebrow{color:${t.gold};font-weight:800;font-size:.86em}
#printStage .ppart h1{font-size:2.3em;color:${t.navy};margin:3mm 0}
#printStage .ppart p{max-width:34em;margin:0 auto;color:${t.soft}}
#printStage .pchapter .eyebrow{color:${t.gold};font-weight:800;font-size:.8em;letter-spacing:.02em}
#printStage .pchapter h1{font-family:var(--serif);font-size:1.95em;color:${t.navy};line-height:1.35;margin:1.5mm 0 4mm}
#printStage .pchapter .divider{width:100%;height:1px;background:${t.line};margin:0 0 5mm;position:relative}
#printStage .pchapter .divider::after{content:"❖";position:absolute;inset-inline-end:0;top:-3.2mm;background:${t.page};padding-inline-start:2mm;color:${t.gold};font-size:.8em}
#printStage .box{border:1px solid ${t.line};background:${t.box};border-radius:3mm;padding:4mm 5mm;margin:4mm 0;break-inside:avoid;page-break-inside:avoid}
#printStage .box b{display:block;color:${t.gold};font-size:.74em;letter-spacing:.02em;margin-bottom:1.2mm}
#printStage .box p{margin:0;font-size:.96em}
#printStage .box ul{margin:0;padding-inline-start:5mm}
#printStage .box li{margin-bottom:1.4mm}
#printStage .prose p{margin:0 0 2.6mm;orphans:3;widows:3}
#printStage .prose p.lead::before{content:"\\2756";color:${t.gold};font-size:.85em;margin-inline-end:.5em}
#printStage .prose h3{font-family:var(--sans);font-size:1.03em;font-weight:800;color:${t.gold};margin:6mm 0 2mm;text-align:start;break-after:avoid;page-break-after:avoid}
#printStage .note{border-inline-start:3px solid ${t.gold};padding:2mm 4mm;margin:3mm 0;break-inside:avoid}
#printStage .note blockquote{margin:0;font-weight:700;font-size:.97em}
#printStage .note small{color:${t.soft};font-size:.74em}
#printStage .reflist{padding-inline-start:6mm;font-size:.88em;color:${t.soft}}
#printStage .reflist li{margin-bottom:2mm}
#printStage .pfoot{position:fixed;inset-block-end:-14mm;inset-inline:0;text-align:center;font-size:8pt;color:${t.soft};letter-spacing:.02em}
${themeKey === 'plain' ? '#printStage .pcover{border:2px solid #111}' : ''}`;
  }

  const chapterHtml = (chapter, part, options, notes) => {
    const blocks = chapter.body.map(([kind, text], index) => kind === 'h'
      ? `<h3>${h(text)}</h3>`
      : `<p${index === 0 ? ' class="lead"' : ''}>${h(text)}</p>`).join('');
    const own = options.notes ? notes.filter((note) => note.no === chapter.no) : [];
    return `<section class="pchapter">
      <p class="eyebrow">${h(part.name)} · الفصل ${AR(chapter.no)}</p>
      <h1>${h(chapter.title)}</h1><div class="divider"></div>
      ${options.key && chapter.key ? `<div class="box"><b>مفتاح الفصل</b><p>${h(chapter.key)}</p></div>` : ''}
      <div class="prose">${blocks}</div>
      ${options.summary && chapter.idea ? `<div class="box"><b>الفكرة المحورية</b><p>${h(chapter.idea)}</p></div>` : ''}
      ${options.summary && chapter.apply ? `<div class="box"><b>تطبيق عملي</b><p>${h(chapter.apply)}</p></div>` : ''}
      ${options.questions && chapter.qs?.length ? `<div class="box"><b>أسئلة للتأمل</b><ul>${chapter.qs.map((question) => `<li>${h(question)}</li>`).join('')}</ul></div>` : ''}
      ${options.exercise && chapter.week ? `<div class="box"><b>تمرين الأسبوع</b><p>${h(chapter.week)}</p></div>` : ''}
      ${own.length ? `<div class="box"><b>ملاحظاتي على هذا الفصل</b>${own.map((note) => `<div class="note"><blockquote>«${h(note.text)}»</blockquote>${note.note ? `<small>${h(note.note)}</small>` : ''}</div>`).join('')}</div>` : ''}
    </section>`;
  };

  function documentHtml(data, options) {
    const meta = data.meta;
    const motif = typeof MOTIF === 'string' ? MOTIF : '';
    const parts = [];
    if (options.cover) {
      parts.push(`<section class="pcover"><div class="frame">${motif}
        <p class="eyebrow">${h(meta.subtitle ? 'سلسلة تدريبية' : '')}</p>
        <h1>${h(meta.title)}</h1><div class="rule"></div>
        <p>${h(meta.subtitle || '')}</p>
        <div class="author">${h(meta.author)}</div><div class="role">${h(meta.role || '')}</div>
        ${data.scopeLabel && options.scope !== 'book' ? `<p class="eyebrow" style="margin-top:6mm">${h(data.scopeLabel)}</p>` : ''}
      </div></section>`);
    }
    if (options.preface && options.scope === 'book' && meta.preface?.length) {
      parts.push(`<section class="front"><h2 class="section">مقدمة الكتاب</h2><div class="prose">${meta.preface.map((text, index) => `<p${index === 0 ? ' class="lead"' : ''}>${h(text)}</p>`).join('')}</div>${meta.note ? `<div class="box"><b>ملاحظة منهجية</b><p>${h(meta.note)}</p></div>` : ''}</section>`);
    }
    if (options.toc && data.parts.length) {
      parts.push(`<section class="ptoc"><h2 class="section">المحتويات</h2>${data.parts.map((part) => `<div class="toc-part">${h(part.name)} — ${h(part.title)}</div>${part.chapters.map((chapter) => `<div class="toc-row"><b>${AR(chapter.no)}</b><span>${h(chapter.title)}</span></div>`).join('')}`).join('')}</section>`);
    }
    data.parts.forEach((part) => {
      if (options.scope === 'book' || data.parts.length > 1) {
        parts.push(`<section class="ppart"><p class="eyebrow">${h(part.name)}</p><h1>${h(part.title)}</h1><p>${h(part.intro || '')}</p></section>`);
      }
      part.chapters.forEach((chapter) => parts.push(chapterHtml(chapter, part, options, data.notes)));
    });
    if (options.scope === 'notes' || (options.notes && options.scope !== 'book' && !data.parts.length)) {
      parts.push(`<section class="pnotes"><h2 class="section">دفتر القارئ</h2>${data.notes.length ? data.notes.map((note) => `<div class="note"><blockquote>«${h(note.text)}»</blockquote>${note.note ? `<p>${h(note.note)}</p>` : ''}<small>الفصل ${AR(note.no)} · ${h(note.chapterTitle)}</small></div>`).join('') : '<p>لا توجد ملاحظات محفوظة بعد.</p>'}</section>`);
    }
    if (options.refs && data.refs) {
      const list = [...(data.refs.ar || []), ...(data.refs.en || [])];
      if (list.length) parts.push(`<section class="prefs"><h2 class="section">المراجع</h2><ul class="reflist">${list.map((item) => `<li>${h(item)}</li>`).join('')}</ul></section>`);
    }
    parts.push(`<div class="pfoot">${h(meta.title)} · ${h(meta.author)}</div>`);
    return parts.join('\n');
  }

  let printCleanup = 0;
  function printDocument(data, options) {
    const stage = one('#printStage') || Object.assign(document.createElement('div'), { id: 'printStage' });
    if (!stage.parentNode) document.body.appendChild(stage);
    const style = one('#printStageStyle') || Object.assign(document.createElement('style'), { id: 'printStageStyle' });
    if (!style.parentNode) document.head.appendChild(style);
    style.textContent = printStyles(options.page, options.theme);
    stage.setAttribute('aria-hidden', 'true');
    stage.innerHTML = documentHtml(data, options);
    clearTimeout(printCleanup);
    const done = () => { clearTimeout(printCleanup); printCleanup = setTimeout(() => { stage.innerHTML = ''; }, 1500); };
    window.addEventListener('afterprint', done, { once: true });
    printCleanup = setTimeout(() => { stage.innerHTML = ''; }, 120000);
    setTimeout(() => { window.focus(); window.print(); }, 260);
  }

  const standaloneHtml = (data, options) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(data.meta.title)}</title>
<style>:root{--serif:'Amiri','Geeza Pro','SF Arabic',Georgia,serif;--sans:-apple-system,'SF Arabic','Segoe UI',sans-serif}
body{margin:0;background:#f2efe8;font-family:var(--serif)}
#printStage{display:block!important;max-width:46rem;margin:0 auto;padding:32px 24px;background:#fff;box-shadow:0 20px 60px -40px rgba(20,30,50,.6)}
#printStage .pcover{min-height:70vh;border-radius:14px}#printStage .pfoot{position:static;margin-top:30px}
@media print{body{background:#fff}#printStage{max-width:none;box-shadow:none;padding:0}}
${printStyles(options.page, options.theme).replace(/^@media print\{[^}]*\}[^{]*\{[^}]*\}\}/m, '')}</style></head>
<body><div id="printStage">${documentHtml(data, options)}</div></body></html>`;

  /* ═════════════════════ واجهة مركز التصدير ═════════════════════ */
  const EXPORT_DEFAULTS = { scope: 'book', page: 'a4', theme: 'classic', tab: 'book', cover: true, preface: true, toc: true, key: true, summary: true, questions: true, exercise: true, notes: false, refs: true };
  let X = { ...EXPORT_DEFAULTS, ...S.get('exportPrefs', {}) };
  const saveX = () => S.set('exportPrefs', X);

  const TOGGLES = [
    ['cover', 'الغلاف'], ['toc', 'الفهرس'], ['preface', 'المقدمة'], ['key', 'مفتاح الفصل'],
    ['summary', 'الفكرة والتطبيق'], ['questions', 'أسئلة التأمل'], ['exercise', 'تمرين الأسبوع'],
    ['notes', 'تظليلاتي وملاحظاتي'], ['refs', 'المراجع'],
  ];

  function exportMarkup() {
    return `<div class="studio-tabs" role="tablist">
      <button data-tab="book" class="on">📖 الكتاب</button>
      <button data-tab="audio">🎧 الصوت</button>
      <button data-tab="data">🛡 بياناتي</button>
    </div>

    <div class="studio-panel on" data-panel="book">
      <div class="studio-block">
        <h3>ما الذي تريد تصديره؟</h3>
        <div class="chip-row" id="scopeRow">
          ${[['book', 'الكتاب كاملًا'], ['part', 'الباب الحالي'], ['chapter', 'الفصل الحالي'], ['stars', 'الفصول المحفوظة'], ['notes', 'دفتر القارئ']]
      .map(([value, label]) => `<button class="chip" data-scope="${value}">${label}</button>`).join('')}
        </div>
        <p class="studio-meter" id="scopeMeter"></p>
      </div>

      <div class="studio-block">
        <h3>ماذا يتضمن الملف؟</h3>
        <div class="switch-grid" id="toggleRow">
          ${TOGGLES.map(([key, label]) => `<button class="switch" data-toggle="${key}"><i></i><span>${label}</span></button>`).join('')}
        </div>
      </div>

      <div class="studio-block">
        <h3>مقاس الصفحة وشكلها</h3>
        <div class="studio-fields">
          <label>مقاس الصفحة<select id="pageSize">${Object.entries(PAGES).map(([key, value]) => `<option value="${key}">${value.label}</option>`).join('')}</select></label>
          <label>هوية الطباعة<select id="pageTheme">${Object.entries(THEMES).map(([key, value]) => `<option value="${key}">${value.label}</option>`).join('')}</select></label>
        </div>
        <p class="tool-muted">الخط والألوان والصناديق مطابقة لتنسيق القارئ. اختر «كانفا» إذا كنت ستستكمل التصميم هناك.</p>
      </div>

      <div class="studio-block">
        <h3>احفظ الملف</h3>
        <div class="tool-grid">
          <button class="tool-btn primary" id="doPdf">⎙ PDF / طباعة</button>
          <button class="tool-btn gold" id="doCanva">🎨 PDF لكانفا</button>
          <button class="tool-btn" id="doEpub">📚 EPUB للكتب</button>
          <button class="tool-btn" id="doDocx">📝 Word ‏DOCX</button>
          <button class="tool-btn" id="doHtml">🌐 صفحة HTML</button>
          <button class="tool-btn" id="doMd">✍ Markdown</button>
          <button class="tool-btn" id="doTxt">📄 نص عادي</button>
          <button class="tool-btn" id="doPreview">👁 معاينة قبل الحفظ</button>
        </div>
        <p class="tool-muted" id="exportHint">في الآيفون: اضغط PDF ثم من نافذة الطباعة اختر «مشاركة ← حفظ في الملفات».</p>
      </div>
    </div>

    <div class="studio-panel" data-panel="audio">
      <div class="studio-block">
        <h3>الفصل الحالي</h3>
        <div class="track-card" id="trackNow"></div>
        <div class="tool-grid">
          <button class="tool-btn primary" id="clipChapterPlay">▶ استمع الآن</button>
          <button class="tool-btn" id="clipChapterSave">⇩ تنزيل MP3</button>
        </div>
      </div>

      <div class="studio-block">
        <h3>تنزيل الكتاب الصوتي</h3>
        <p class="tool-muted">اختر المدى ثم طريقة الحفظ. يمكنك التنزيل على الجوال ثم الاستماع من تطبيق الملفات بلا إنترنت.</p>
        <div class="studio-fields">
          <label>من الفصل<select id="rangeFrom"></select></label>
          <label>إلى الفصل<select id="rangeTo"></select></label>
        </div>
        <p class="studio-meter" id="rangeMeter"></p>
        <div class="tool-grid">
          <button class="tool-btn primary" id="doMergeMp3">🎧 ملف صوتي واحد</button>
          <button class="tool-btn" id="doZipMp3">🗂 ملفات منفصلة ZIP</button>
          <button class="tool-btn" id="doOfflineRange">☁ حفظ داخل التطبيق</button>
          <button class="tool-btn danger" id="doOfflineClear">🗑 مسح المحفوظ</button>
        </div>
        <div class="tool-progress" id="studioProgress"><i></i></div>
        <p class="tool-muted" id="studioProgressText"></p>
        <button class="tool-btn danger" id="studioCancel" hidden>إيقاف التنزيل</button>
        <div class="track-list" id="trackList"></div>
      </div>
    </div>

    <div class="studio-panel" data-panel="data">
      <div class="studio-block">
        <h3>نسخة احتياطية</h3>
        <p class="tool-muted">التظليلات والملاحظات والمرفقات محفوظة على هذا الجهاز فقط. نزّل نسخة قبل تبديل الجهاز أو مسح Safari.</p>
        <div class="tool-grid">
          <button class="tool-btn primary" id="studioBackup">⇩ تنزيل نسخة JSON</button>
          <button class="tool-btn" id="studioRestore">⇧ استيراد نسخة JSON</button>
        </div>
      </div>
      <div class="studio-block">
        <h3>أدوات النشر</h3>
        <div class="tool-grid">
          <button class="tool-btn gold" id="studioCard">🎨 بطاقة اقتباس</button>
          <a class="tool-btn" id="studioSource" href="/downloads/mafateeh-al-tharwa-source-v13.zip" download>💾 كود التطبيق ZIP</a>
        </div>
      </div>
    </div>`;
  }

  /* رابط الكود: لا نترك القارئ أمام صفحة خطأ إن لم تُرفع نسخة المصدر بعد. */
  function guardSourceLink() {
    const link = one('#studioSource');
    if (!link) return;
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      try {
        const head = await fetch(link.getAttribute('href'), { method: 'HEAD' });
        if (!head.ok) throw new Error('missing');
        const anchor = document.createElement('a');
        anchor.href = link.getAttribute('href');
        anchor.download = '';
        anchor.click();
      } catch (_) {
        toast('نسخة الكود غير مرفوعة على الخادم بعد (ضعها في مجلد downloads)');
      }
    });
  }

  function mountExport() {
    const sheet = one('#exportSheet');
    if (!sheet) return;
    /* أزرار النسخ الاحتياطي وشريط التقدم القديم تبقى حيّة داخل حاوية مخفية،
       فتظل معالجاتها الأصلية تعمل بعد استبدال واجهة المركز. */
    const legacy = document.createElement('div');
    legacy.id = 'studioLegacy';
    legacy.hidden = true;
    ['#backupJson', '#importJson', '#importJsonInput', '#exportProgress', '#exportProgressText'].forEach((selector) => {
      const node = one(selector, sheet);
      if (node) legacy.appendChild(node);
    });
    many('.tool-section', sheet).forEach((node) => node.remove());
    sheet.appendChild(legacy);
    sheet.insertAdjacentHTML('beforeend', exportMarkup());
    one('.tool-head p', sheet).textContent = 'PDF وEPUB وWord وكانفا، والكتاب الصوتي كاملًا أو فصلًا واحدًا';

    many('.studio-tabs button', sheet).forEach((button) => button.onclick = () => {
      X.tab = button.dataset.tab; saveX();
      many('.studio-tabs button', sheet).forEach((other) => other.classList.toggle('on', other === button));
      many('.studio-panel', sheet).forEach((panel) => panel.classList.toggle('on', panel.dataset.panel === X.tab));
      sheet.scrollTo({ top: 0, behavior: 'smooth' });
    });
    many('[data-scope]', sheet).forEach((button) => button.onclick = () => { X.scope = button.dataset.scope; saveX(); renderExport(); });
    many('[data-toggle]', sheet).forEach((button) => button.onclick = () => { X[button.dataset.toggle] = !X[button.dataset.toggle]; saveX(); renderExport(); });
    one('#pageSize').onchange = (event) => { X.page = event.target.value; saveX(); };
    one('#pageTheme').onchange = (event) => { X.theme = event.target.value; saveX(); };

    const build = () => ({ data: model(X.scope), options: { ...X, scope: X.scope } });
    one('#doPdf').onclick = () => { const { data, options } = build(); closeSheet('export'); toast('يتم تجهيز نافذة الحفظ…'); printDocument(data, options); };
    one('#doCanva').onclick = () => {
      const { data } = build();
      const options = { ...X, scope: X.scope, theme: 'canva', page: X.page === 'a4' || X.page === 'book' || X.page === 'letter' ? 'square' : X.page };
      one('#pageSize').value = options.page; one('#pageTheme').value = 'canva'; X.page = options.page; X.theme = 'canva'; saveX();
      closeSheet('export'); toast('مقاس كانفا جاهز — احفظ PDF ثم ارفعه في كانفا'); printDocument(data, options);
    };
    one('#doPreview').onclick = () => {
      const { data, options } = build();
      previewState = { data, options };
      one('#previewTitle').textContent = data.scopeLabel;
      one('#previewFrame').srcdoc = standaloneHtml(data, options);
      openSheet('preview');
    };
    one('#doHtml').onclick = () => { const { data, options } = build(); download(new Blob([standaloneHtml(data, options)], { type: 'text/html;charset=utf-8' }), `${safeName(data.scopeLabel)}.html`); toast('تم حفظ صفحة HTML ✓'); };
    one('#doTxt').onclick = () => { const { data, options } = build(); download(new Blob([F.buildText(data, options)], { type: 'text/plain;charset=utf-8' }), `${safeName(data.scopeLabel)}.txt`); toast('تم حفظ النص ✓'); };
    one('#doMd').onclick = () => { const { data, options } = build(); download(new Blob([F.buildMarkdown(data, options)], { type: 'text/markdown;charset=utf-8' }), `${safeName(data.scopeLabel)}.md`); toast('تم حفظ ملف Markdown ✓'); };
    one('#doEpub').onclick = async () => {
      const button = one('#doEpub'); button.disabled = true; button.textContent = 'يجهّز EPUB…';
      try { const { data, options } = build(); const blob = await F.buildEpub(data, options); await deliver(blob, `${safeName(data.scopeLabel)}.epub`, { preferShare: true }); toast('EPUB جاهز — افتحه في تطبيق الكتب ✓'); }
      catch (_) { toast('تعذر إنشاء EPUB على هذا الجهاز'); }
      finally { button.disabled = false; button.textContent = '📚 EPUB للكتب'; }
    };
    one('#doDocx').onclick = async () => {
      const button = one('#doDocx'); button.disabled = true; button.textContent = 'يجهّز Word…';
      try { const { data, options } = build(); const blob = await F.buildDocx(data, options); await deliver(blob, `${safeName(data.scopeLabel)}.docx`, { preferShare: true }); toast('ملف Word جاهز للتحرير ✓'); }
      catch (_) { toast('تعذر إنشاء ملف Word على هذا الجهاز'); }
      finally { button.disabled = false; button.textContent = '📝 Word ‏DOCX'; }
    };

    one('#studioBackup').onclick = () => one('#backupJson')?.click();
    one('#studioRestore').onclick = () => one('#importJson')?.click();
    one('#studioCard').onclick = () => { closeSheet('export'); openSheet('card'); };
    mountAudioPanel();
    renderExport();
  }

  function renderExport() {
    const sheet = one('#exportSheet');
    if (!sheet) return;
    many('[data-scope]', sheet).forEach((button) => button.classList.toggle('on', button.dataset.scope === X.scope));
    many('[data-toggle]', sheet).forEach((button) => button.classList.toggle('on', Boolean(X[button.dataset.toggle])));
    many('.studio-tabs button', sheet).forEach((button) => button.classList.toggle('on', button.dataset.tab === X.tab));
    many('.studio-panel', sheet).forEach((panel) => panel.classList.toggle('on', panel.dataset.panel === X.tab));
    one('#pageSize').value = X.page; one('#pageTheme').value = X.theme;
    const data = model(X.scope);
    const chapters = data.parts.reduce((total, part) => total + part.chapters.length, 0);
    const words = wordCount(data);
    one('#scopeMeter').innerHTML = X.scope === 'notes'
      ? `دفتر القارئ · ${AR(data.notes.length)} تظليلًا وملاحظة`
      : `${h(data.scopeLabel)} · ${AR(chapters)} فصلًا · نحو ${AR(words.toLocaleString('en-US').replace(/,/g, '٬'))} كلمة · ${AR(Math.max(1, Math.round(words / 260)))} صفحة تقريبًا`;
  }

  /* ═════════════════════ مركز الصوت ═════════════════════ */
  let manifest = null;
  let transfer = null;
  const audioCacheName = 'mafateeh-audio-v1';
  const chapterMeta = (index) => manifest?.chapters?.find((item) => item.no === CH[index].no) || null;
  const rangeIndexes = () => {
    const from = Math.min(+one('#rangeFrom').value, +one('#rangeTo').value);
    const to = Math.max(+one('#rangeFrom').value, +one('#rangeTo').value);
    return Array.from({ length: to - from + 1 }, (_, offset) => from + offset);
  };
  const rangeStats = (indexes) => indexes.reduce((total, index) => {
    const meta = chapterMeta(index);
    return { bytes: total.bytes + (meta?.bytes || 0), duration: total.duration + (meta?.duration || 0) };
  }, { bytes: 0, duration: 0 });

  function studioProgress(value, label = '') {
    const box = one('#studioProgress');
    if (!box) return;
    box.classList.toggle('on', value > 0 && value < 100);
    one('i', box).style.width = `${Math.max(0, Math.min(100, value))}%`;
    one('#studioProgressText').textContent = label;
    one('#studioCancel').hidden = !transfer;
  }

  async function fetchChapter(index, onBytes) {
    const response = await fetch(chapterFile(index), { signal: transfer?.signal });
    if (!response.ok) throw new Error('audio');
    if (!response.body?.getReader) { const blob = await response.blob(); onBytes?.(blob.size); return { blob, bytes: new Uint8Array(await blob.arrayBuffer()) }; }
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); received += value.length; onBytes?.(value.length);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return { blob: new Blob([bytes], { type: 'audio/mpeg' }), bytes };
  }

  async function collectRange({ zipMode }) {
    const indexes = rangeIndexes();
    const stats = rangeStats(indexes);
    if (indexes.length > 1 && stats.bytes > 40 * 1048576 && !confirm(`سيتم تنزيل نحو ${bytesLabel(stats.bytes)}. يفضّل استخدام Wi‑Fi. هل تتابع؟`)) return;
    transfer = new AbortController();
    studioProgress(1, 'يبدأ التنزيل…');
    const parts = [];
    let received = 0;
    const total = stats.bytes || indexes.length * 2048000;
    try {
      for (let position = 0; position < indexes.length; position += 1) {
        const index = indexes[position];
        const { blob, bytes } = await fetchChapter(index, (chunk) => {
          received += chunk;
          studioProgress((received / total) * 100, `${AR(position + 1)} من ${AR(indexes.length)} · ${bytesLabel(received)} من ${bytesLabel(total)}`);
        });
        parts.push(zipMode
          ? { name: `${pad2(CH[index].no)} - ${safeName(CH[index].title)}.mp3`, data: blob, size: blob.size, crc: F.crc32(bytes), store: true }
          : blob);
      }
      studioProgress(99, 'يتم تجميع الملف…');
      const label = indexes.length === CH.length ? 'الكتاب-كاملًا' : `الفصول-${AR(CH[indexes[0]].no)}-${AR(CH[indexes[indexes.length - 1]].no)}`.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
      const blob = zipMode ? await F.zip(parts, { mime: 'application/zip' }) : new Blob(parts, { type: 'audio/mpeg' });
      studioProgress(100, `الحجم النهائي ${bytesLabel(blob.size)} · اختر الحفظ أو المشاركة`);
      const name = zipMode ? `مفاتيح-الثروة-${label}.zip` : `مفاتيح-الثروة-${label}.mp3`;
      const result = await deliver(blob, name, { preferShare: /iPhone|iPad|iPod|Android/.test(navigator.userAgent) });
      toast(result === 'share' ? 'تمت المشاركة ✓' : 'تم حفظ الملف ✓');
    } catch (error) {
      if (error?.name === 'AbortError') { studioProgress(0, 'أُوقف التنزيل'); toast('أُوقف التنزيل'); }
      else { studioProgress(0, ''); toast('تعذر تنزيل الصوت؛ تأكد من الاتصال وحاول مجددًا'); }
    } finally { transfer = null; one('#studioCancel').hidden = true; renderTracks(); }
  }

  async function cacheRange() {
    if (!('caches' in window)) { toast('الحفظ داخل التطبيق غير مدعوم هنا'); return; }
    const indexes = rangeIndexes();
    transfer = new AbortController();
    try {
      const cache = await caches.open(audioCacheName);
      for (let position = 0; position < indexes.length; position += 1) {
        studioProgress((position / indexes.length) * 100, `يُحفظ الفصل ${AR(CH[indexes[position]].no)} · ${AR(position + 1)} من ${AR(indexes.length)}`);
        for (const url of [chapterFile(indexes[position]), timingFile(indexes[position])]) {
          const response = await fetch(url, { signal: transfer.signal });
          if (!response.ok) throw new Error('cache');
          await cache.put(url, response.clone());
        }
      }
      studioProgress(100, 'جاهز للاستماع دون إنترنت ✓');
      toast('حُفظ الصوت داخل التطبيق ✓');
    } catch (error) {
      studioProgress(0, error?.name === 'AbortError' ? 'أُوقف الحفظ' : '');
      if (error?.name !== 'AbortError') toast('توقف الحفظ؛ أعد المحاولة وسيُكمل الناقص');
    } finally { transfer = null; one('#studioCancel').hidden = true; renderTracks(); }
  }

  async function renderTracks() {
    const list = one('#trackList');
    if (!list) return;
    const saved = new Set();
    if ('caches' in window) {
      try {
        const cache = await caches.open(audioCacheName);
        const keys = await cache.keys();
        keys.forEach((request) => saved.add(new URL(request.url).pathname));
      } catch (_) { /* لا شيء */ }
    }
    const indexes = rangeIndexes();
    list.innerHTML = indexes.map((index) => {
      const meta = chapterMeta(index);
      const isSaved = saved.has(chapterFile(index));
      return `<div class="track-row${index === cur ? ' now' : ''}">
        <b>${AR(CH[index].no)}</b>
        <div class="track-info"><span>${h(CH[index].title)}</span><small>${clock(meta?.duration)} · ${bytesLabel(meta?.bytes)}${isSaved ? ' · محفوظ ✓' : ''}</small></div>
        <button data-play="${index}" aria-label="استماع">▶</button>
        <button data-save="${index}" aria-label="تنزيل">⇩</button>
      </div>`;
    }).join('');
    many('[data-play]', list).forEach((button) => button.onclick = () => {
      const index = +button.dataset.play;
      closeSheet('export');
      if (index !== cur) go(index, true, true);
      mediaStart('chapter', index);
    });
    many('[data-save]', list).forEach((button) => button.onclick = () => {
      const index = +button.dataset.save;
      const link = document.createElement('a');
      link.href = chapterFile(index); link.download = `مفاتيح-الثروة-${pad2(CH[index].no)}-${safeName(CH[index].title)}.mp3`;
      document.body.appendChild(link); link.click(); link.remove();
      toast('بدأ تنزيل الفصل ✓');
    });
    const stats = rangeStats(indexes);
    one('#rangeMeter').textContent = `${AR(indexes.length)} فصلًا · ${clock(stats.duration)} · نحو ${bytesLabel(stats.bytes)}`;
    const meta = chapterMeta(cur);
    one('#trackNow').innerHTML = `<b>${h(CH[cur].title)}</b><small>الفصل ${AR(CH[cur].no)} · ${clock(meta?.duration)} · ${bytesLabel(meta?.bytes)}${saved.has(chapterFile(cur)) ? ' · محفوظ داخل التطبيق ✓' : ''}</small>`;
  }

  async function mountAudioPanel() {
    const from = one('#rangeFrom');
    const to = one('#rangeTo');
    if (!from) return;
    const options = CH.map((chapter, index) => `<option value="${index}">${AR(chapter.no)} — ${h(chapter.title)}</option>`).join('');
    from.innerHTML = options; to.innerHTML = options;
    from.value = '0'; to.value = String(CH.length - 1);
    from.onchange = to.onchange = renderTracks;
    one('#doMergeMp3').onclick = () => collectRange({ zipMode: false });
    one('#doZipMp3').onclick = () => collectRange({ zipMode: true });
    one('#doOfflineRange').onclick = cacheRange;
    one('#studioCancel').onclick = () => { transfer?.abort(); };
    one('#doOfflineClear').onclick = async () => {
      if (!confirm('سيتم مسح ملفات الصوت المحفوظة داخل التطبيق. هل تتابع؟')) return;
      await caches.delete(audioCacheName).catch(() => {});
      toast('مُسحت الملفات المحفوظة'); renderTracks();
    };
    one('#clipChapterPlay').onclick = () => { closeSheet('export'); mediaStart('chapter', cur); };
    one('#clipChapterSave').onclick = () => one(`[data-save="${cur}"]`)?.click();
    manifest = await mediaLoadManifest().catch(() => null);
    renderTracks();
  }

  /* ═════════════════════ استوديو المقطع المحدد ═════════════════════ */
  let previewState = null;
  const previewSheet = `<div class="tool-shade" id="previewShade" aria-hidden="true"><section class="tool-sheet preview-sheet" id="previewSheet" role="dialog" aria-modal="true" aria-labelledby="previewTitle">
    <div class="tool-handle"></div>
    <header class="tool-head"><div><h2 id="previewTitle">معاينة</h2><p>هذا هو الشكل الذي سيُحفظ به الملف تمامًا.</p></div><button class="tool-close" data-close="preview" aria-label="إغلاق">✕</button></header>
    <iframe id="previewFrame" title="معاينة الكتاب" sandbox="allow-same-origin"></iframe>
    <div class="tool-grid preview-actions">
      <button class="tool-btn primary" id="previewPrint">🖨 حفظ PDF من هذه المعاينة</button>
      <button class="tool-btn" id="previewHtml">💾 حفظ صفحة HTML</button>
    </div>
  </section></div>`;

  const clipSheet = `<div class="tool-shade" id="clipShade" aria-hidden="true"><section class="tool-sheet" id="clipSheet" role="dialog" aria-modal="true" aria-labelledby="clipTitle">
    <div class="tool-handle"></div>
    <header class="tool-head"><div><h2 id="clipTitle">مقطع النص المحدد</h2><p>استمع قبل الحفظ، ثم نزّل المقطع أو شاركه</p></div><button class="tool-close" data-close="clip" aria-label="إغلاق">✕</button></header>
    <blockquote class="clip-quote" id="clipQuote"></blockquote>
    <div class="clip-player">
      <button class="clip-play" id="clipPlay" aria-label="تشغيل">▶</button>
      <div class="clip-track"><input id="clipSeek" type="range" min="0" max="1000" value="0" aria-label="موضع التشغيل"><div class="clip-times"><span id="clipNow">٠:٠٠</span><span id="clipLen">٠:٠٠</span></div></div>
      <button class="clip-loop" id="clipLoop" aria-label="إعادة">↻</button>
    </div>
    <div class="clip-rates" id="clipRates">${[75, 100, 125, 150].map((rate) => `<button data-rate="${rate}"${rate === 100 ? ' class="on"' : ''}>${rate / 100}×</button>`).join('')}</div>
    <div class="tool-grid">
      <button class="tool-btn primary" id="clipFollow">📖 استماع مع متابعة النص</button>
      <button class="tool-btn gold" id="clipMp3">⇩ حفظ MP3</button>
      <button class="tool-btn" id="clipWav">⇩ حفظ WAV</button>
      <button class="tool-btn" id="clipShare">↗ مشاركة</button>
    </div>
    <div class="tool-progress" id="clipProgress"><i></i></div>
    <p class="tool-muted" id="clipNote">المقطع مقصوص من التسجيل المحفوظ للكتاب بالثانية نفسها التي تبدأ عندها العبارة.</p>
  </section></div>`;

  const clipAudio = new Audio();
  clipAudio.preload = 'metadata';
  clipAudio.playsInline = true;
  let clip = null;
  let clipLoop = false;

  const clipProgress = (value, label) => {
    const box = one('#clipProgress');
    box.classList.toggle('on', value > 0 && value < 100);
    one('i', box).style.width = `${value}%`;
    if (label) one('#clipNote').textContent = label;
  };

  async function clipFor(snapshot) {
    if (!snapshot) return null;
    if (!Number.isInteger(snapshot.audioStart) || !Number.isInteger(snapshot.audioEnd)) { toast('أعد تحديد العبارة ليتم ربطها بالصوت'); return null; }
    const timing = await mediaLoadTiming(snapshot.chapterIndex);
    const first = timing?.words?.[snapshot.audioStart];
    const last = timing?.words?.[snapshot.audioEnd];
    if (!first || !last) { toast('تعذر العثور على توقيت العبارة في التسجيل'); return null; }
    return { snapshot, start: Math.max(0, +first[0] - 0.03), end: +last[1] + 0.05 };
  }

  function renderClip() {
    if (!clip) return;
    const length = clip.end - clip.start;
    one('#clipLen').textContent = clock(length);
    one('#clipQuote').textContent = `«${clip.snapshot.text}»`;
    one('#clipPlay').textContent = clipAudio.paused ? '▶' : '⏸';
    one('#clipLoop').classList.toggle('on', clipLoop);
  }

  async function openClip() {
    const snapshot = RT.requireSelection?.();
    if (!snapshot) return;
    const found = await clipFor(snapshot);
    if (!found) return;
    clip = found;
    try { mediaStop(false); } catch (_) { /* لا شيء */ }
    one('#quote')?.classList.remove('on');
    clipAudio.src = chapterFile(clip.snapshot.chapterIndex);
    clipAudio.currentTime = clip.start;
    clipAudio.playbackRate = 1;
    one('#clipSeek').value = '0';
    one('#clipNow').textContent = '٠:٠٠';
    clipProgress(0, 'المقطع مقصوص من التسجيل المحفوظ للكتاب بالثانية نفسها التي تبدأ عندها العبارة.');
    renderClip();
    openSheet('clip');
  }

  function clipToggle() {
    if (!clip) return;
    if (clipAudio.paused) {
      if (clipAudio.currentTime < clip.start || clipAudio.currentTime >= clip.end - 0.05) clipAudio.currentTime = clip.start;
      clipAudio.play().catch(() => toast('اضغط مرة أخرى لتشغيل الصوت'));
    } else clipAudio.pause();
    renderClip();
  }

  clipAudio.addEventListener('timeupdate', () => {
    if (!clip) return;
    if (clipAudio.currentTime >= clip.end) {
      if (clipLoop) { clipAudio.currentTime = clip.start; }
      else { clipAudio.pause(); clipAudio.currentTime = clip.start; }
    }
    const ratio = Math.max(0, Math.min(1, (clipAudio.currentTime - clip.start) / (clip.end - clip.start)));
    one('#clipSeek').value = String(Math.round(ratio * 1000));
    one('#clipNow').textContent = clock(clipAudio.currentTime - clip.start);
    renderClip();
  });
  clipAudio.addEventListener('pause', renderClip);
  clipAudio.addEventListener('play', renderClip);

  async function clipBytes() {
    const response = await fetch(chapterFile(clip.snapshot.chapterIndex));
    if (!response.ok) throw new Error('audio');
    return new Uint8Array(await response.arrayBuffer());
  }

  async function saveClipMp3() {
    if (!clip) return;
    try {
      clipProgress(20, 'يتم تحميل تسجيل الفصل…');
      const bytes = await clipBytes();
      clipProgress(65, 'يتم قص المقطع…');
      const slice = F.mp3Slice(bytes, clip.start, clip.end);
      if (!slice) throw new Error('slice');
      const blob = new Blob([slice.bytes], { type: 'audio/mpeg' });
      clipProgress(100, `الحجم ${bytesLabel(blob.size)} · ${clock(slice.duration)}`);
      await deliver(blob, `مفاتيح-الثروة-${safeName(clip.snapshot.text.slice(0, 40))}.mp3`, { preferShare: /iPhone|iPad|iPod/.test(navigator.userAgent) });
      toast('حُفظ المقطع MP3 ✓');
    } catch (_) { clipProgress(0, 'تعذر قص المقطع؛ جرّب حفظ WAV.'); toast('تعذر إنشاء MP3'); }
  }

  async function saveClipWav() {
    if (!clip) return;
    try {
      clipProgress(20, 'يتم تحميل تسجيل الفصل…');
      const bytes = await clipBytes();
      clipProgress(55, 'يتم فك الترميز…');
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const buffer = await context.decodeAudioData(bytes.buffer.slice(0));
      clipProgress(80, 'يتم تجهيز WAV…');
      const wav = RT.audioBufferToWav ? RT.audioBufferToWav(buffer, clip.start, clip.end) : null;
      await context.close();
      if (!wav) throw new Error('wav');
      clipProgress(100, `الحجم ${bytesLabel(wav.size)}`);
      await deliver(wav, `مفاتيح-الثروة-${safeName(clip.snapshot.text.slice(0, 40))}.wav`, { preferShare: /iPhone|iPad|iPod/.test(navigator.userAgent) });
      toast('حُفظ المقطع WAV ✓');
    } catch (_) { clipProgress(0, ''); toast('تعذر تصدير WAV على هذا الجهاز'); }
  }

  function mountPreview() {
    document.body.insertAdjacentHTML('beforeend', previewSheet);
    one('[data-close="preview"]').onclick = () => closeSheet('preview');
    one('#previewShade').addEventListener('click', (event) => { if (event.target === one('#previewShade')) closeSheet('preview'); });
    one('#previewPrint').onclick = () => { if (!previewState) return; closeSheet('preview'); printDocument(previewState.data, previewState.options); };
    one('#previewHtml').onclick = () => {
      if (!previewState) return;
      const { data, options } = previewState;
      download(new Blob([standaloneHtml(data, options)], { type: 'text/html;charset=utf-8' }), `${safeName(data.scopeLabel)}.html`);
      toast('تم حفظ صفحة HTML ✓');
    };
  }

  function mountClip() {
    document.body.insertAdjacentHTML('beforeend', clipSheet);
    one('[data-close="clip"]').onclick = () => { clipAudio.pause(); closeSheet('clip'); };
    one('#clipShade').addEventListener('click', (event) => { if (event.target === one('#clipShade')) { clipAudio.pause(); closeSheet('clip'); } });
    one('#clipPlay').onclick = clipToggle;
    one('#clipLoop').onclick = () => { clipLoop = !clipLoop; renderClip(); };
    one('#clipSeek').oninput = (event) => { if (!clip) return; clipAudio.currentTime = clip.start + (clip.end - clip.start) * (+event.target.value / 1000); };
    many('#clipRates button').forEach((button) => button.onclick = () => {
      clipAudio.playbackRate = +button.dataset.rate / 100;
      many('#clipRates button').forEach((other) => other.classList.toggle('on', other === button));
    });
    one('#clipMp3').onclick = saveClipMp3;
    one('#clipWav').onclick = saveClipWav;
    one('#clipShare').onclick = async () => {
      if (!clip) return;
      const text = `«${clip.snapshot.text}»\n\n— مفاتيح الثروة، ${D.meta.author}`;
      if (navigator.share) await navigator.share({ text, title: D.meta.title }).catch(() => {});
      else { await navigator.clipboard?.writeText(text).catch(() => {}); toast('نُسخ الاقتباس ✓'); }
    };
    one('#clipFollow').onclick = () => { clipAudio.pause(); closeSheet('clip'); one('#qListen')?.click(); };

    const trigger = one('#qAudioExport');
    if (trigger) { trigger.textContent = '🎧 المقطع'; trigger.title = 'استماع للمقطع ثم حفظه'; trigger.onclick = openClip; }
  }

  /* ═════════════════════ تشغيل ═════════════════════ */
  function boot() {
    if (!F) { console.warn('BookFormats غير محمّل'); return; }
    mountExport();
    guardSourceLink();
    mountPreview();
    mountClip();
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { clipAudio.pause(); closeSheet('clip'); closeSheet('preview'); } });
    window.__MAFATEEH_STUDIO__ = { version: 13, model, printDocument, openClip, renderExport };
  }
  boot();
})();
