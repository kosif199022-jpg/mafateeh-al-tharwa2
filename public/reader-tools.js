/* مفاتيح الثروة — أدوات القارئ المتقدمة، الإصدار 10 */
(function () {
  'use strict';

  const TOOL_VERSION = 12;
  const one = (selector, root = document) => root.querySelector(selector);
  const many = (selector, root = document) => [...root.querySelectorAll(selector)];
  const h = (value) => esc(String(value ?? ''));
  const chapter = () => CH[cur];
  const chapterFile = (index = cur) => `/audio/chapter-${String(CH[index].no).padStart(2, '0')}.mp3`;
  const timingFile = (index = cur) => `/audio/timings/chapter-${String(CH[index].no).padStart(2, '0')}.json?v=1`;
  const safeFileName = (value) => String(value || 'file').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90);
  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes) || bytes < 1024) return `${AR(bytes || 0)} بايت`;
    if (bytes < 1024 ** 2) return `${AR((bytes / 1024).toFixed(1))} ك.ب`;
    return `${AR((bytes / 1024 ** 2).toFixed(1))} م.ب`;
  };
  const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const downloadBlob = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = safeFileName(name); link.style.display = 'none';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };
  const downloadUrl = (url, name) => {
    const link = document.createElement('a'); link.href = url; link.download = safeFileName(name);
    document.body.append(link); link.click(); link.remove();
  };

  /* ─────────────────────── بناء الواجهات الجديدة ─────────────────────── */
  function sheetMarkup(id, title, subtitle, body) {
    return `<div class="tool-shade" id="${id}Shade" aria-hidden="true"><section class="tool-sheet" id="${id}Sheet" role="dialog" aria-modal="true" aria-labelledby="${id}Title"><div class="tool-handle"></div><header class="tool-head"><div><h2 id="${id}Title">${title}</h2><p>${subtitle}</p></div><button class="tool-close" data-close="${id}" aria-label="إغلاق">✕</button></header>${body}</section></div>`;
  }

  function injectInterface() {
    const exportButton = document.createElement('button');
    exportButton.className = 'ic'; exportButton.id = 'bExport'; exportButton.title = 'التصدير والنسخ الاحتياطي'; exportButton.setAttribute('aria-label', exportButton.title); exportButton.textContent = '⇩';
    one('#top').insertBefore(exportButton, one('#bJournal'));

    one('.drawer-actions')?.insertAdjacentHTML('afterend', `<div class="drawer-tools"><button class="tool-btn primary" id="drawerExport">⇩ مركز التصدير</button><button class="tool-btn" id="drawerBackup">🛡 نسخة احتياطية</button></div>`);
    one('#jstats')?.insertAdjacentHTML('beforebegin', `<div class="journal-tools"><button class="tool-btn primary" id="journalExport">⇩ تصدير الدفتر</button><button class="tool-btn" id="journalBackup">🛡 نسخة احتياطية</button></div>`);

    const qListen = one('#qListen');
    qListen.textContent = '🔊 المحفوظ'; qListen.classList.add('quote-tool', 'saved'); qListen.title = 'قراءة المحدد من تسجيل الكتاب المحفوظ';
    qListen.insertAdjacentHTML('afterend', `<button id="qVoice" class="quote-tool" title="إنشاء صوت آخر">✨ صوت آخر</button><button id="qAudioExport" class="quote-tool" title="تصدير صوت المحدد">⇩ صوت</button><button id="qCard" class="quote-tool card" title="صناعة بطاقة اقتباس">🎨 بطاقة</button>`);

    one('#noteText')?.insertAdjacentHTML('afterend', `<section class="note-attach-panel"><b>مرفقات الملاحظة</b><p class="tool-muted">أرفق صورة أو ملفًا أو تسجيلًا صوتيًا. تُحفظ على هذا الجهاز ويمكن تضمينها في النسخة الاحتياطية.</p><div class="note-attach-actions"><button class="tool-btn" type="button" id="notePickFile">📎 إرفاق ملف</button><button class="tool-btn" type="button" id="noteRecord">🎙 تسجيل صوتي</button><input id="noteFileInput" type="file" multiple hidden></div><div class="note-file-list" id="noteFileList"></div></section>`);

    one('#prefs')?.insertAdjacentHTML('beforeend', `<div class="prow advanced-pref"><div class="pref-toggle"><div><span class="plab">وضع التركيز</span><small class="tool-muted">إبراز الفقرة الحالية</small></div><button id="focusToggle">متوقف</button></div></div><div class="prow advanced-pref" style="margin-bottom:0"><div class="pref-toggle"><div><span class="plab">منع إطفاء الشاشة</span><small class="tool-muted">أثناء الاستماع والقراءة التلقائية</small></div><button id="wakeToggle">مفعّل</button></div></div>`);

    one('#audioFromStart')?.insertAdjacentHTML('beforebegin', `<div class="audio-extra-tools"><button class="tool-btn" id="audioResumeSaved">↩ متابعة آخر موضع</button><button class="tool-btn" id="audioDownloadChapter">⇩ تنزيل الفصل MP3</button><button class="tool-btn" id="audioExportSelected">✂ تصدير المحدد WAV</button><button class="tool-btn" id="audioOfflineChapter">☁ تنزيل الفصل دون إنترنت</button></div><div class="sleep-row"><select id="sleepMinutes" aria-label="مؤقت النوم"><option value="0">مؤقت النوم متوقف</option><option value="10">إيقاف بعد ١٠ دقائق</option><option value="20">إيقاف بعد ٢٠ دقيقة</option><option value="30">إيقاف بعد ٣٠ دقيقة</option><option value="45">إيقاف بعد ٤٥ دقيقة</option><option value="60">إيقاف بعد ساعة</option></select><button class="tool-btn" id="sleepApply">تطبيق</button></div>`);

    document.body.insertAdjacentHTML('beforeend', sheetMarkup('export', 'مركز التصدير', 'احفظ الكتاب أو الصوت أو بيانات قارئك بصيغ قابلة للنقل', `
      <section class="tool-section"><h3>📄 الكتاب ودفتر القارئ</h3><p>النص يبقى قابلاً للبحث والنسخ، وتستطيع حفظ نافذة الطباعة PDF.</p><div class="tool-grid"><button class="tool-btn primary" id="exportBookPdf">الكتاب كاملًا PDF</button><button class="tool-btn" id="exportChapterPdf">الفصل الحالي PDF</button><button class="tool-btn gold" id="exportCanvaPdf">PDF جاهز لكانفا</button><button class="tool-btn" id="exportNotebookPdf">دفتر القارئ PDF</button><button class="tool-btn" id="exportNotesMd">الملاحظات Markdown</button><a class="tool-btn" href="/downloads/mafateeh-al-tharwa-source-v12.zip" download>كود التطبيق كاملًا ZIP</a></div></section>
      <section class="tool-section"><h3>🎧 الصوت المحفوظ</h3><p>نزّل الفصل الأصلي أو حدّد عبارة وصدّر الجزء المطابق لها بدقة WAV.</p><div class="tool-grid"><button class="tool-btn primary" id="exportChapterAudio">تنزيل الفصل MP3</button><button class="tool-btn" id="exportSelectionAudio">تصدير المحدد WAV</button><button class="tool-btn" id="offlineOne">حفظ الفصل دون إنترنت</button><button class="tool-btn" id="offlineAll">حفظ صوت الكتاب دون إنترنت</button></div><div class="tool-progress" id="exportProgress"><i></i></div><p class="tool-muted" id="exportProgressText"></p></section>
      <section class="tool-section"><h3>🛡 بياناتك ونسختك الاحتياطية</h3><p>التظليلات والملاحظات والمرفقات محفوظة محليًا؛ نزّل نسخة عند تبديل الجهاز أو مسح Safari.</p><div class="tool-grid"><button class="tool-btn primary" id="backupJson">تنزيل نسخة JSON</button><button class="tool-btn" id="importJson">استيراد نسخة JSON</button><input type="file" id="importJsonInput" accept="application/json,.json" hidden></div></section>`));

    document.body.insertAdjacentHTML('beforeend', sheetMarkup('card', 'استوديو بطاقة الاقتباس', 'حوّل أي عبارة إلى تصميم عربي جاهز للنشر أو الاستكمال في Canva', `
      <div class="card-stage"><canvas id="quoteCanvas" width="1080" height="1080"></canvas></div><div class="card-controls"><label>نص البطاقة<textarea id="cardText"></textarea></label><div class="card-control-grid"><label>المقاس<select id="cardSize"><option value="square">منشور ١٠٨٠×١٠٨٠</option><option value="story">ستوري ١٠٨٠×١٩٢٠</option><option value="wide">عرضي ١٦٠٠×٩٠٠</option></select></label><label>القالب<select id="cardTheme"><option value="navy">ليلي ذهبي</option><option value="paper">ورق عربي</option><option value="aurora">تدرّج حديث</option><option value="minimal">أبيض بسيط</option></select></label></div><div class="tool-grid"><button class="tool-btn gold" id="cardDownload">تنزيل PNG</button><button class="tool-btn primary" id="cardShare">مشاركة</button></div></div>`));

    document.body.insertAdjacentHTML('beforeend', sheetMarkup('attachment', 'المرفق', 'مرفق محفوظ ضمن ملاحظات القارئ', `<div class="attachment-viewer" id="attachmentViewer"></div><div class="tool-grid" style="margin-top:12px"><button class="tool-btn primary" id="attachmentDownload">تنزيل</button><button class="tool-btn" id="attachmentShare">مشاركة</button></div>`));
  }
  injectInterface();

  const openSheet = (name) => { const shade = one(`#${name}Shade`); shade?.classList.add('on'); shade?.setAttribute('aria-hidden', 'false'); autoScrollPause(true); };
  const closeSheet = (name) => { const shade = one(`#${name}Shade`); shade?.classList.remove('on'); shade?.setAttribute('aria-hidden', 'true'); };
  many('[data-close]').forEach((button) => button.onclick = () => closeSheet(button.dataset.close));
  many('.tool-shade').forEach((shade) => shade.addEventListener('click', (event) => { if (event.target === shade) closeSheet(shade.id.replace(/Shade$/, '')); }));

  /* ─────────────────────── تحديد ثابت وقابل للنقل ─────────────────────── */
  let latestSelection = null;
  const coreCaptureSelection = captureSelection;
  captureSelection = function captureSelectionEnhanced() {
    coreCaptureSelection();
    if (!selectionInfo) return;
    const selection = getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const block = (range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer)?.closest?.('#prose [data-bi]');
    const wordIndexes = [];
    many('[data-audio-word]', block).forEach((word) => {
      try { if (range.intersectsNode(word)) wordIndexes.push(+word.dataset.audioWord); } catch (_) {}
    });
    latestSelection = {
      ...selectionInfo,
      chapterIndex: cur,
      chapterNo: chapter().no,
      audioStart: wordIndexes.length ? Math.min(...wordIndexes) : null,
      audioEnd: wordIndexes.length ? Math.max(...wordIndexes) : null,
      selectedAt: Date.now(),
    };
    selText = latestSelection.text;
  };
  const selectionSnapshot = () => latestSelection && latestSelection.chapterIndex === cur ? { ...latestSelection } : null;
  const requireSelection = () => {
    const snapshot = selectionSnapshot();
    if (!snapshot?.text) toast('حدد نصًا داخل فقرة أولًا');
    return snapshot;
  };

  /* ─────────────────────── المرفقات داخل الملاحظات ─────────────────────── */
  const DB_NAME = 'mafateeh-reader-v10';
  const DB_STORE = 'attachments';
  let dbPromise;
  function attachmentDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          const store = db.createObjectStore(DB_STORE, { keyPath: 'id' });
          store.createIndex('markId', 'markId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }
  async function dbRequest(mode, action) {
    const db = await attachmentDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, mode); const store = tx.objectStore(DB_STORE); const request = action(store);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  }
  const attachmentPut = (record) => dbRequest('readwrite', (store) => store.put(record));
  const attachmentGet = (id) => dbRequest('readonly', (store) => store.get(id));
  const attachmentDelete = (id) => dbRequest('readwrite', (store) => store.delete(id));
  const attachmentAll = () => dbRequest('readonly', (store) => store.getAll());
  const attachmentClear = () => dbRequest('readwrite', (store) => store.clear());

  let noteSelectionSnapshot = null;
  let pendingAttachments = [];
  let removedAttachmentIds = new Set();
  let recorder = null, recordingStream = null, recordedChunks = [];
  const fileIcon = (type = '') => type.startsWith('image/') ? '🖼' : type.startsWith('audio/') ? '🎧' : type.startsWith('video/') ? '🎬' : type.includes('pdf') ? '📕' : '📎';
  function currentExistingAttachments() {
    if (noteState?.mode !== 'edit') return [];
    return (findMark(noteState.id)?.m.attachments || []).filter((item) => !removedAttachmentIds.has(item.id));
  }
  function renderNoteFiles() {
    const items = [...currentExistingAttachments().map((item) => ({ ...item, existing: true })), ...pendingAttachments];
    one('#noteFileList').innerHTML = items.length ? items.map((item) => `<div class="note-file"><span class="file-ico">${fileIcon(item.type)}</span><span class="file-info"><b>${h(item.name)}</b><small>${h(formatBytes(item.size))}</small></span><button type="button" data-remove-file="${h(item.id)}" aria-label="إزالة">✕</button></div>`).join('') : '<small class="tool-muted">لا توجد مرفقات بعد.</small>';
    many('[data-remove-file]', one('#noteFileList')).forEach((button) => button.onclick = () => {
      const id = button.dataset.removeFile;
      if (pendingAttachments.some((item) => item.id === id)) pendingAttachments = pendingAttachments.filter((item) => item.id !== id);
      else removedAttachmentIds.add(id);
      renderNoteFiles();
    });
  }
  async function addFiles(files) {
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) { toast(`الملف ${file.name} أكبر من ٢٥ م.ب`); continue; }
      pendingAttachments.push({ id: uid('att'), name: file.name || 'مرفق', type: file.type || 'application/octet-stream', size: file.size, blob: file });
    }
    renderNoteFiles();
  }
  one('#notePickFile').onclick = () => one('#noteFileInput').click();
  one('#noteFileInput').onchange = (event) => { addFiles([...event.target.files]); event.target.value = ''; };
  one('#noteRecord').onclick = async () => {
    const button = one('#noteRecord');
    if (recorder?.state === 'recording') { recorder.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast('التسجيل الصوتي غير مدعوم في هذا المتصفح'); return; }
    try {
      recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunks = []; recorder = new MediaRecorder(recordingStream);
      recorder.ondataavailable = (event) => { if (event.data.size) recordedChunks.push(event.data); };
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm'; const blob = new Blob(recordedChunks, { type });
        pendingAttachments.push({ id: uid('att'), name: `ملاحظة صوتية ${new Date().toLocaleString('ar-SA')}.${type.includes('mp4') ? 'm4a' : 'webm'}`, type, size: blob.size, blob });
        recordingStream?.getTracks().forEach((track) => track.stop()); recordingStream = null; recorder = null;
        button.classList.remove('recording'); button.textContent = '🎙 تسجيل صوتي'; renderNoteFiles();
      };
      recorder.start(); button.classList.add('recording'); button.textContent = '■ إيقاف التسجيل'; toast('بدأ التسجيل الصوتي');
    } catch (_) { toast('لم يُسمح بالوصول إلى الميكروفون'); }
  };

  const coreShowNoteSheet = showNoteSheet;
  showNoteSheet = function showNoteSheetEnhanced(state) {
    noteSelectionSnapshot = state.mode === 'new' ? (selectionSnapshot() || (selectionInfo ? { ...selectionInfo, chapterIndex: cur, chapterNo: chapter().no } : null)) : null;
    if (noteSelectionSnapshot) selectionInfo = { ...noteSelectionSnapshot };
    pendingAttachments = []; removedAttachmentIds = new Set();
    coreShowNoteSheet(state); renderNoteFiles();
  };
  const coreCloseNote = closeNote;
  closeNote = function closeNoteEnhanced() {
    if (recorder?.state === 'recording') recorder.stop();
    coreCloseNote(); noteSelectionSnapshot = null; pendingAttachments = []; removedAttachmentIds = new Set();
  };
  one('#noteClose').onclick = closeNote; one('#noteCancel').onclick = closeNote;
  noteShade.onclick = (event) => { if (event.target === noteShade) closeNote(); };
  one('#qNote').onclick = () => { const snapshot = requireSelection(); if (!snapshot) return; selectionInfo = { ...snapshot }; showNoteSheet({ mode: 'new' }); };

  async function commitAttachments(mark, existing = []) {
    const kept = existing.filter((item) => !removedAttachmentIds.has(item.id));
    for (const id of removedAttachmentIds) await attachmentDelete(id).catch(() => {});
    const added = [];
    for (const item of pendingAttachments) {
      await attachmentPut({ id: item.id, markId: mark.id, name: item.name, type: item.type, size: item.size, createdAt: Date.now(), blob: item.blob });
      added.push({ id: item.id, name: item.name, type: item.type, size: item.size });
    }
    mark.attachments = [...kept, ...added]; S.set('marks', marks);
  }
  one('#noteSave').onclick = async () => {
    const state = noteState; const note = one('#noteText').value;
    if (!state) return;
    const added = [...pendingAttachments]; const removed = new Set(removedAttachmentIds);
    if (state.mode === 'new') {
      const snapshot = noteSelectionSnapshot || selectionSnapshot();
      if (!snapshot) { toast('أعد تحديد النص أولًا'); return; }
      coreCloseNote(); selectionInfo = { ...snapshot };
      const mark = addSelectionMark(noteColor, note);
      if (mark) { pendingAttachments = added; removedAttachmentIds = removed; await commitAttachments(mark); renderJournal(); if (added.length) toast('حُفظت الملاحظة ومرفقاتها ✓'); }
    } else {
      const found = findMark(state.id);
      if (found) {
        const existing = found.m.attachments || [];
        found.m.note = note.trim(); found.m.color = noteColor;
        coreCloseNote(); pendingAttachments = added; removedAttachmentIds = removed;
        await commitAttachments(found.m, existing); rerenderKeepScroll(); renderJournal(); toast('حُفظت الملاحظة ✓');
      }
    }
    noteSelectionSnapshot = null; pendingAttachments = []; removedAttachmentIds = new Set();
  };

  const coreDeleteMark = deleteMark;
  deleteMark = function deleteMarkEnhanced(id) {
    const found = findMark(id); const ids = (found?.m.attachments || []).map((item) => item.id);
    coreDeleteMark(id); ids.forEach((attachmentId) => attachmentDelete(attachmentId).catch(() => {}));
  };

  let viewerAttachment = null, viewerUrl = '';
  async function openAttachment(id) {
    const item = await attachmentGet(id).catch(() => null);
    if (!item) { toast('تعذر فتح المرفق'); return; }
    viewerAttachment = item; if (viewerUrl) URL.revokeObjectURL(viewerUrl); viewerUrl = URL.createObjectURL(item.blob);
    const viewer = one('#attachmentViewer');
    if (item.type.startsWith('image/')) viewer.innerHTML = `<img src="${viewerUrl}" alt="${h(item.name)}">`;
    else if (item.type.startsWith('audio/')) viewer.innerHTML = `<audio src="${viewerUrl}" controls playsinline></audio>`;
    else if (item.type.startsWith('video/')) viewer.innerHTML = `<video src="${viewerUrl}" controls playsinline></video>`;
    else if (item.type.includes('pdf')) viewer.innerHTML = `<iframe src="${viewerUrl}" title="${h(item.name)}"></iframe>`;
    else viewer.innerHTML = `<div class="attachment-generic"><span>${fileIcon(item.type)}</span><b>${h(item.name)}</b><p>${h(formatBytes(item.size))}</p></div>`;
    one('#attachmentTitle').textContent = item.name; openSheet('attachment');
  }
  const coreRenderJournal = renderJournal;
  renderJournal = function renderJournalEnhanced() {
    coreRenderJournal();
    allMarks().forEach((mark) => {
      if (!mark.attachments?.length) return;
      const article = one(`[data-edit="${CSS.escape(String(mark.id))}"]`)?.closest('.jitem');
      if (!article) return;
      const html = `<div class="jattachments">${mark.attachments.map((item) => `<button class="jattach" data-open-attachment="${h(item.id)}">${fileIcon(item.type)} ${h(item.name)}</button>`).join('')}</div>`;
      article.querySelector('.jactions')?.insertAdjacentHTML('beforebegin', html);
    });
    many('[data-open-attachment]').forEach((button) => button.onclick = () => openAttachment(button.dataset.openAttachment));
  };
  one('#attachmentDownload').onclick = () => viewerAttachment && downloadBlob(viewerAttachment.blob, viewerAttachment.name);
  one('#attachmentShare').onclick = async () => {
    if (!viewerAttachment) return;
    const file = new File([viewerAttachment.blob], viewerAttachment.name, { type: viewerAttachment.type });
    if (navigator.share && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: viewerAttachment.name }).catch(() => {});
    else downloadBlob(viewerAttachment.blob, viewerAttachment.name);
  };

  /* ─────────────────────── النسخ الاحتياطي والاستيراد ─────────────────────── */
  const blobToDataUrl = (blob) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
  const dataUrlToBlob = async (value) => (await fetch(value)).blob();
  function stateSnapshot() {
    const state = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index); if (!key?.startsWith('mk_')) continue;
      try { state[key.slice(3)] = JSON.parse(localStorage.getItem(key)); } catch (_) {}
    }
    return state;
  }
  async function exportBackup() {
    toast('يتم تجهيز النسخة الاحتياطية…');
    const attachments = [];
    for (const item of await attachmentAll().catch(() => [])) attachments.push({ id: item.id, markId: item.markId, name: item.name, type: item.type, size: item.size, createdAt: item.createdAt, data: await blobToDataUrl(item.blob) });
    const backup = { format: 'mafateeh-reader-backup', version: TOOL_VERSION, exportedAt: new Date().toISOString(), state: stateSnapshot(), attachments };
    downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `مفاتيح-الثروة-نسخة-احتياطية-${new Date().toISOString().slice(0, 10)}.json`);
    toast('تم تنزيل النسخة الاحتياطية ✓');
  }
  async function importBackup(file) {
    let data; try { data = JSON.parse(await file.text()); } catch (_) { toast('ملف النسخة غير صالح'); return; }
    if (data?.format !== 'mafateeh-reader-backup' || !data.state) { toast('هذا ليس ملف نسخة مفاتيح الثروة'); return; }
    if (!confirm('سيتم استبدال التقدم والتظليلات والملاحظات الحالية بالنسخة المستوردة. هل تتابع؟')) return;
    [...Array(localStorage.length)].map((_, index) => localStorage.key(index)).filter((key) => key?.startsWith('mk_')).forEach((key) => localStorage.removeItem(key));
    Object.entries(data.state).forEach(([key, value]) => localStorage.setItem(`mk_${key}`, JSON.stringify(value)));
    await attachmentClear().catch(() => {});
    for (const item of data.attachments || []) {
      try { await attachmentPut({ ...item, blob: await dataUrlToBlob(item.data), data: undefined }); } catch (_) {}
    }
    alert('اكتمل الاستيراد. سيُعاد فتح القارئ الآن.'); location.reload();
  }
  one('#backupJson').onclick = exportBackup; one('#drawerBackup').onclick = exportBackup; one('#journalBackup').onclick = exportBackup;
  one('#importJson').onclick = () => one('#importJsonInput').click();
  one('#importJsonInput').onchange = (event) => { const file = event.target.files[0]; if (file) importBackup(file); event.target.value = ''; };

  /* ─────────────────────── PDF وMarkdown ─────────────────────── */
  const printStyles = `@page{size:A4;margin:18mm 16mm 20mm}*{box-sizing:border-box}html{direction:rtl}body{font-family:"Geeza Pro","SF Arabic",Tahoma,serif;color:#17233b;line-height:1.95;font-size:15px;margin:0}.cover{height:250mm;display:grid;place-items:center;text-align:center;page-break-after:always;background:#10203b;color:#fff;border:5mm solid #c39a59}.cover h1{font-size:54px;margin:0;color:#d5b477}.cover p{font-size:19px}.part{page-break-before:always;border-bottom:2px solid #b4894a;padding:24px 0 12px}.chapter{page-break-before:always}.chapter h2{font-size:28px;color:#1f3352;margin:0 0 10px}.meta{color:#84683f}.prose p{margin:0 0 12px;text-align:justify;break-inside:avoid;orphans:3;widows:3}.prose h3{color:#b4894a}.box{border:1px solid #d7c39f;border-radius:12px;padding:12px 16px;margin:14px 0;background:#fbf7ef;break-inside:avoid}.note{border-right:5px solid var(--mark,#e5bc60);padding:8px 14px;margin:12px 0;break-inside:avoid}.note blockquote{font-size:17px;font-weight:bold}.note small{color:#6b7280}.footer{position:fixed;bottom:-13mm;left:0;right:0;text-align:center;font-size:10px;color:#7a8190}`;
  function chapterPrint(c) {
    const body = c.body.map(([kind, text]) => kind === 'h' ? `<h3>${h(text)}</h3>` : `<p>${h(text)}</p>`).join('');
    return `<article class="chapter"><p class="meta">${h(c.pname)} · الفصل ${AR(c.no)}</p><h2>${h(c.title)}</h2><div class="box"><b>مفتاح الفصل</b><p>${h(c.key)}</p></div><div class="prose">${body}</div><div class="box"><b>الفكرة المحورية</b><p>${h(c.idea)}</p><b>تطبيق عملي</b><p>${h(c.apply)}</p></div></article>`;
  }
  function openPrintDocument(title, body, canva = false) {
    const popup = window.open('', '_blank');
    if (!popup) { toast('اسمح بالنوافذ المنبثقة لفتح التصدير'); return; }
    popup.document.open(); popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${h(title)}</title><style>${printStyles}${canva ? '.cover{background:linear-gradient(145deg,#0c162c,#284a75)}' : ''}</style></head><body>${body}<div class="footer">مفاتيح الثروة · حامد بن علي</div><script>addEventListener('load',()=>setTimeout(()=>print(),350));<\/script></body></html>`); popup.document.close();
  }
  const bookCover = `<section class="cover"><div><p>من الفكرة إلى النتيجة</p><h1>مفاتيح الثروة</h1><p>منهج عملي في بناء الوعي والعادة والهدف</p><p>حامد بن علي</p></div></section>`;
  const fullBookBody = () => bookCover + D.parts.map((part) => `<section class="part"><p>${h(part.name)}</p><h1>${h(part.title)}</h1><p>${h(part.intro)}</p></section>${part.chapters.map(chapterPrint).join('')}`).join('');
  function notebookBody() {
    const items = allMarks().sort((a, b) => a.no - b.no || (a.createdAt || 0) - (b.createdAt || 0));
    return bookCover.replace('مفاتيح الثروة', 'دفتر قارئ مفاتيح الثروة') + (items.length ? items.map((item) => `<article class="note" style="--mark:${h(item.color || DEFAULT_MARK)}"><small>الفصل ${AR(item.no)} · ${h(CH.find((c) => c.no === item.no)?.title || '')}</small><blockquote>«${h(item.text)}»</blockquote>${item.note ? `<p>${h(item.note)}</p>` : ''}${item.attachments?.length ? `<small>المرفقات: ${item.attachments.map((file) => h(file.name)).join('، ')}</small>` : ''}</article>`).join('') : '<p>لا توجد ملاحظات بعد.</p>');
  }
  function exportMarkdown() {
    const lines = ['# دفتر قارئ مفاتيح الثروة', '', `تاريخ التصدير: ${new Date().toLocaleString('ar-SA')}`, ''];
    allMarks().sort((a, b) => a.no - b.no).forEach((item) => { lines.push(`## الفصل ${item.no}: ${CH.find((c) => c.no === item.no)?.title || ''}`, '', `> ${item.text}`, '', item.note || '', ''); if (item.attachments?.length) lines.push(`المرفقات: ${item.attachments.map((file) => file.name).join('، ')}`, ''); });
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }), 'دفتر-قارئ-مفاتيح-الثروة.md');
  }
  one('#exportBookPdf').onclick = () => openPrintDocument('مفاتيح الثروة — الكتاب الكامل', fullBookBody());
  one('#exportChapterPdf').onclick = () => openPrintDocument(chapter().title, chapterPrint(chapter()));
  one('#exportCanvaPdf').onclick = () => openPrintDocument('مفاتيح الثروة — Canva', fullBookBody(), true);
  one('#exportNotebookPdf').onclick = () => openPrintDocument('دفتر قارئ مفاتيح الثروة', notebookBody());
  one('#journalExport').onclick = () => openPrintDocument('دفتر قارئ مفاتيح الثروة', notebookBody());
  one('#exportNotesMd').onclick = exportMarkdown;

  /* ─────────────────────── استوديو الاقتباس ─────────────────────── */
  const cardCanvas = one('#quoteCanvas'); const cardContext = cardCanvas.getContext('2d');
  function wrapCanvasText(context, text, maxWidth) {
    const words = String(text).replace(/\s+/g, ' ').trim().split(' '); const lines = []; let line = '';
    for (const word of words) { const test = line ? `${line} ${word}` : word; if (context.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test; }
    if (line) lines.push(line); return lines;
  }
  function drawQuoteCard() {
    const size = one('#cardSize').value; const theme = one('#cardTheme').value;
    const dimensions = size === 'story' ? [1080, 1920] : size === 'wide' ? [1600, 900] : [1080, 1080];
    cardCanvas.width = dimensions[0]; cardCanvas.height = dimensions[1]; const [width, height] = dimensions;
    const palettes = { navy: ['#0b162b', '#294b75', '#f0cd8c', '#ffffff'], paper: ['#f6efe1', '#e7d5b5', '#8d6330', '#33291d'], aurora: ['#143d59', '#6b3b76', '#ffd588', '#ffffff'], minimal: ['#ffffff', '#eef1f5', '#b4894a', '#17233b'] };
    const palette = palettes[theme]; const gradient = cardContext.createLinearGradient(0, 0, width, height); gradient.addColorStop(0, palette[0]); gradient.addColorStop(1, palette[1]); cardContext.fillStyle = gradient; cardContext.fillRect(0, 0, width, height);
    cardContext.strokeStyle = palette[2]; cardContext.lineWidth = Math.max(5, width * .006); cardContext.strokeRect(width * .045, height * .045, width * .91, height * .91);
    cardContext.fillStyle = palette[2]; cardContext.beginPath(); cardContext.arc(width / 2, height * .16, width * .035, 0, Math.PI * 2); cardContext.fill();
    const text = one('#cardText').value.trim() || 'مفاتيح الثروة'; const fontSize = Math.max(42, Math.min(size === 'story' ? 76 : 64, 920 / Math.sqrt(Math.max(12, text.length)) * 9));
    cardContext.direction = 'rtl'; cardContext.textAlign = 'center'; cardContext.fillStyle = palette[3]; cardContext.font = `700 ${fontSize}px "Geeza Pro","SF Arabic",Tahoma,serif`;
    const lines = wrapCanvasText(cardContext, text, width * .72).slice(0, size === 'story' ? 13 : 8); const lineHeight = fontSize * 1.75; let y = height / 2 - (lines.length - 1) * lineHeight / 2;
    for (const line of lines) { cardContext.fillText(line, width / 2, y); y += lineHeight; }
    cardContext.font = `600 ${Math.max(26, width * .025)}px "SF Arabic",Tahoma,sans-serif`; cardContext.fillStyle = palette[2]; cardContext.fillText('مفاتيح الثروة · حامد بن علي', width / 2, height * .86);
  }
  one('#cardText').oninput = drawQuoteCard; one('#cardSize').onchange = drawQuoteCard; one('#cardTheme').onchange = drawQuoteCard;
  one('#qCard').onclick = () => { const snapshot = requireSelection(); if (!snapshot) return; one('#cardText').value = snapshot.text; drawQuoteCard(); one('#quote').classList.remove('on'); openSheet('card'); };
  const cardBlob = () => new Promise((resolve) => cardCanvas.toBlob(resolve, 'image/png', 1));
  one('#cardDownload').onclick = async () => downloadBlob(await cardBlob(), `اقتباس-${safeFileName(chapter().title)}.png`);
  one('#cardShare').onclick = async () => { const blob = await cardBlob(); const file = new File([blob], 'اقتباس-مفاتيح-الثروة.png', { type: 'image/png' }); if (navigator.share && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'اقتباس من مفاتيح الثروة' }).catch(() => {}); else downloadBlob(blob, file.name); };
  drawQuoteCard();

  /* ─────────────────────── الصوت المحفوظ: قراءة وتصدير المحدد ─────────────────────── */
  async function savedClip(snapshot = requireSelection()) {
    if (!snapshot) return null;
    if (!Number.isInteger(snapshot.audioStart) || !Number.isInteger(snapshot.audioEnd)) { toast('أعد تحديد العبارة ليتم ربطها بالصوت المحفوظ'); return null; }
    const timing = await mediaLoadTiming(snapshot.chapterIndex);
    const first = timing?.words?.[snapshot.audioStart]; const last = timing?.words?.[snapshot.audioEnd];
    if (!first || !last) { toast('تعذر العثور على توقيت العبارة'); return null; }
    return { snapshot, start: Math.max(0, +first[0] - .025), end: +last[1] + .04 };
  }
  let activeSavedClip = null;
  async function playSavedSelection() {
    const clip = await savedClip(); if (!clip) return;
    if (cur !== clip.snapshot.chapterIndex) go(clip.snapshot.chapterIndex, true, true);
    activeSavedClip = clip; mediaStart('chapter', clip.snapshot.chapterIndex, '', clip.start); mediaClose(); one('#quote').classList.remove('on'); getSelection()?.removeAllRanges();
    toast('بدأت القراءة من التسجيل المحفوظ');
  }
  audioEl.addEventListener('timeupdate', () => {
    if (!activeSavedClip || mediaState.chapterIndex !== activeSavedClip.snapshot.chapterIndex) return;
    if (audioEl.currentTime + .025 < activeSavedClip.end) return;
    activeSavedClip = null; audioEl.pause(); mediaStopSyncLoop(); mediaState.active = false; mediaState.paused = false; mediaState.completed = true; mediaReadingClear(); mediaRender(); toast('اكتملت قراءة النص المحدد ✓');
  });
  one('#qListen').onclick = playSavedSelection;
  one('#qVoice').onclick = () => { const snapshot = requireSelection(); if (!snapshot) return; activeSavedClip = null; one('#quote').classList.remove('on'); getSelection()?.removeAllRanges(); mediaOpen('selection', snapshot.text); mediaStart('selection', snapshot.chapterIndex, snapshot.text); };

  function audioBufferToWav(buffer, startSeconds, endSeconds) {
    const rate = buffer.sampleRate; const start = Math.max(0, Math.floor(startSeconds * rate)); const end = Math.min(buffer.length, Math.ceil(endSeconds * rate));
    const frames = Math.max(0, end - start); const channels = Math.min(2, buffer.numberOfChannels); const dataSize = frames * channels * 2; const array = new ArrayBuffer(44 + dataSize); const view = new DataView(array);
    const write = (offset, value) => { for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i)); };
    write(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); write(8, 'WAVE'); write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, rate, true); view.setUint32(28, rate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, dataSize, true);
    const sources = Array.from({ length: channels }, (_, index) => buffer.getChannelData(index)); let offset = 44;
    for (let frame = start; frame < end; frame += 1) for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) { const sample = Math.max(-1, Math.min(1, sources[channelIndex][frame])); view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true); offset += 2; }
    return new Blob([array], { type: 'audio/wav' });
  }
  function progress(value, label = '') { const box = one('#exportProgress'); box.classList.toggle('on', value > 0 && value < 100); one('i', box).style.width = `${Math.max(0, Math.min(100, value))}%`; one('#exportProgressText').textContent = label; }
  async function exportSavedSelection() {
    const clip = await savedClip(); if (!clip) return;
    if (clip.end - clip.start > 600 && !confirm('المقطع أطول من ١٠ دقائق وقد يستغرق تصديره وقتًا. هل تتابع؟')) return;
    try {
      progress(15, 'يتم تحميل تسجيل الفصل…'); const response = await fetch(chapterFile(clip.snapshot.chapterIndex)); if (!response.ok) throw new Error('fetch');
      const bytes = await response.arrayBuffer(); progress(45, 'يتم فك ترميز الصوت…'); const context = new (window.AudioContext || window.webkitAudioContext)(); const buffer = await context.decodeAudioData(bytes.slice(0));
      progress(78, 'يتم قص المقطع بدقة…'); const wav = audioBufferToWav(buffer, clip.start, clip.end); await context.close();
      downloadBlob(wav, `مفاتيح-الثروة-${safeFileName(clip.snapshot.text.slice(0, 36))}.wav`); progress(100, 'تم تصدير النص المحدد WAV ✓'); toast('تم تصدير الصوت المحدد ✓');
    } catch (_) { progress(0, ''); toast('تعذر تصدير المقطع على هذا الجهاز'); }
  }
  const downloadCurrentChapter = () => downloadUrl(chapterFile(cur), `مفاتيح-الثروة-الفصل-${String(chapter().no).padStart(2, '0')}.mp3`);
  one('#qAudioExport').onclick = exportSavedSelection; one('#audioExportSelected').onclick = exportSavedSelection; one('#exportSelectionAudio').onclick = exportSavedSelection;
  one('#audioDownloadChapter').onclick = downloadCurrentChapter; one('#exportChapterAudio').onclick = downloadCurrentChapter;

  /* ─────────────────────── العمل دون إنترنت ─────────────────────── */
  async function cacheChapter(index, cache) {
    const urls = [chapterFile(index), timingFile(index)];
    for (const url of urls) { const response = await fetch(url); if (!response.ok) throw new Error('download'); await cache.put(url, response.clone()); }
  }
  async function offlineCurrent() {
    if (!('caches' in window)) { toast('التنزيل دون إنترنت غير مدعوم'); return; }
    try { progress(20, 'يتم تنزيل الفصل…'); const cache = await caches.open('mafateeh-audio-v1'); await cacheChapter(cur, cache); progress(100, 'الفصل جاهز دون إنترنت ✓'); toast('تم حفظ الفصل للصوت دون إنترنت ✓'); } catch (_) { progress(0, ''); toast('تعذر تنزيل الفصل'); }
  }
  async function offlineBook() {
    if (!('caches' in window)) { toast('التنزيل دون إنترنت غير مدعوم'); return; }
    if (!confirm('سيتم تنزيل نحو ٧٠ م.ب من صوت الكتاب. يفضّل استخدام Wi‑Fi. هل تتابع؟')) return;
    try { const cache = await caches.open('mafateeh-audio-v1'); for (let index = 0; index < CH.length; index += 1) { progress((index / CH.length) * 100, `تنزيل الفصل ${AR(index + 1)} من ${AR(CH.length)}…`); await cacheChapter(index, cache); } progress(100, 'اكتمل حفظ صوت الكتاب دون إنترنت ✓'); toast('صوت الكتاب جاهز دون إنترنت ✓'); } catch (_) { toast('توقف التنزيل؛ يمكنك المحاولة مجددًا وسيُكمل الملفات الناقصة'); }
  }
  one('#audioOfflineChapter').onclick = offlineCurrent; one('#offlineOne').onclick = offlineCurrent; one('#offlineAll').onclick = offlineBook;

  /* ─────────────────────── متابعة الصوت، شاشة القفل، ومؤقت النوم ─────────────────────── */
  let lastResumeSave = 0; let sleepTimer = 0; let sleepEndsAt = 0;
  audioEl.addEventListener('timeupdate', () => {
    if (!mediaState.active || !Number.isFinite(audioEl.currentTime)) return;
    const now = Date.now(); if (now - lastResumeSave > 3000) { lastResumeSave = now; S.set('audioResume', { chapterIndex: mediaState.chapterIndex, currentTime: audioEl.currentTime, mode: mediaState.mode, savedAt: now }); }
    try { if ('setPositionState' in navigator.mediaSession && Number.isFinite(audioEl.duration) && audioEl.duration > 0) navigator.mediaSession.setPositionState({ duration: audioEl.duration, playbackRate: audioEl.playbackRate || 1, position: Math.min(audioEl.duration, audioEl.currentTime) }); } catch (_) {}
  });
  one('#audioResumeSaved').onclick = () => { const saved = S.get('audioResume', null); if (!saved || !Number.isFinite(saved.currentTime)) { toast('لا يوجد موضع صوتي محفوظ بعد'); return; } activeSavedClip = null; mediaStart(saved.mode === 'book' ? 'book' : 'chapter', saved.chapterIndex || 0, '', saved.currentTime); mediaClose(); };
  one('#sleepApply').onclick = () => {
    clearTimeout(sleepTimer); const minutes = +one('#sleepMinutes').value;
    if (!minutes) { sleepEndsAt = 0; toast('تم إلغاء مؤقت النوم'); return; }
    sleepEndsAt = Date.now() + minutes * 60000; sleepTimer = setTimeout(() => { audioEl.pause(); mediaState.paused = true; mediaRender(); toast('أوقف مؤقت النوم القارئ الصوتي'); }, minutes * 60000); toast(`سيُوقف الصوت بعد ${AR(minutes)} دقيقة`);
  };
  if ('mediaSession' in navigator) {
    const updateMediaSession = () => { navigator.mediaSession.metadata = new MediaMetadata({ title: chapter().title, artist: 'حامد بن علي', album: 'مفاتيح الثروة', artwork: [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }] }); };
    audioEl.addEventListener('playing', updateMediaSession);
    const actions = { play: () => mediaToggle(), pause: () => mediaToggle(), seekbackward: (details) => { audioEl.currentTime = Math.max(0, audioEl.currentTime - (details.seekOffset || 15)); }, seekforward: (details) => { audioEl.currentTime = Math.min(audioEl.duration || Infinity, audioEl.currentTime + (details.seekOffset || 15)); }, seekto: (details) => { if (Number.isFinite(details.seekTime)) audioEl.currentTime = details.seekTime; }, previoustrack: () => mediaSkip(-1), nexttrack: () => mediaSkip(1), stop: () => mediaStop() };
    Object.entries(actions).forEach(([name, handler]) => { try { navigator.mediaSession.setActionHandler(name, handler); } catch (_) {} });
  }

  /* ─────────────────────── وضع التركيز وWake Lock ─────────────────────── */
  let focusEnabled = S.get('focusMode', false); let wakeEnabled = S.get('wakeLock', true); let wakeSentinel = null;
  function renderFocus() { document.documentElement.classList.toggle('reader-focus-on', focusEnabled); const button = one('#focusToggle'); button.classList.toggle('on', focusEnabled); button.textContent = focusEnabled ? 'مفعّل' : 'متوقف'; }
  one('#focusToggle').onclick = () => { focusEnabled = !focusEnabled; S.set('focusMode', focusEnabled); renderFocus(); };
  one('#page').addEventListener('click', (event) => { const target = event.target.closest?.('.prose>p,.prose>h3'); if (!target) return; many('.focus-active').forEach((item) => item.classList.remove('focus-active')); target.classList.add('focus-active'); });
  async function requestWake() { if (!wakeEnabled || !navigator.wakeLock || document.visibilityState !== 'visible' || wakeSentinel) return; try { wakeSentinel = await navigator.wakeLock.request('screen'); wakeSentinel.addEventListener('release', () => { wakeSentinel = null; }); } catch (_) {} }
  async function releaseWake() { try { await wakeSentinel?.release(); } catch (_) {} wakeSentinel = null; }
  function renderWake() { const button = one('#wakeToggle'); button.classList.toggle('on', wakeEnabled); button.textContent = wakeEnabled ? 'مفعّل' : 'متوقف'; }
  one('#wakeToggle').onclick = () => { wakeEnabled = !wakeEnabled; S.set('wakeLock', wakeEnabled); renderWake(); if (wakeEnabled && (!audioEl.paused || one('#scrollDock')?.classList.contains('on'))) requestWake(); else releaseWake(); };
  audioEl.addEventListener('playing', requestWake); audioEl.addEventListener('pause', releaseWake); audioEl.addEventListener('ended', releaseWake);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && wakeEnabled && !audioEl.paused) requestWake(); });
  renderFocus(); renderWake();

  /* ─────────────────────── ربط مركز التصدير ─────────────────────── */
  const showExport = () => { closeDrawer(); openSheet('export'); };
  one('#bExport').onclick = showExport; one('#drawerExport').onclick = showExport;
  one('#exportChapterAudio').onclick = downloadCurrentChapter;
  addEventListener('keydown', (event) => { if (event.key === 'Escape') { ['export', 'card', 'attachment'].forEach(closeSheet); } });

  /* ترقية هادئة: تعريف المزايا مرة واحدة دون إزعاج متكرر. */
  if (S.get('toolsIntro', 0) < TOOL_VERSION) { S.set('toolsIntro', TOOL_VERSION); setTimeout(() => toast('جديد: تصدير PDF والصوت والمرفقات والنسخ الاحتياطي من زر ⇩'), 900); }
  window.__MAFATEEH_TOOLS__ = { version: TOOL_VERSION, exportBackup, exportSavedSelection, openPrintDocument, drawQuoteCard, offlineCurrent, offlineBook };
  /* واجهة داخلية لوحدة الاستوديو (الإصدار 13) كي لا يتكرر الكود نفسه مرتين. */
  window.RT = {
    requireSelection, selectionSnapshot, savedClip, playSavedSelection,
    downloadBlob, downloadUrl, safeFileName, formatBytes,
    openSheet, closeSheet, progress, audioBufferToWav, chapterFile, timingFile,
  };
})();
