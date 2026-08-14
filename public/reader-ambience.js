/* مفاتيح الثروة — خلفية الكتاب والأجواء — الإصدار 13
   مشاهد مصورة وحيّة، أصوات مولّدة داخل الجهاز، وثلاثة أشكال لسطح القراءة.
   كل ذلك اختياري: «الخلفية الأصلية» تُعيد الكتاب إلى شكله المعتاد تمامًا. */
(function () {
  'use strict';

  const one = (selector, root = document) => root.querySelector(selector);
  const many = (selector, root = document) => [...root.querySelectorAll(selector)];
  const DEFAULTS = {
    mode: 'original', surface: 'paper', dim: 30, blur: 0, paper: 88, veil: 40,
    motion: true, cover: false, volume: 35, sound: 'auto', surfaceTouched: false,
    mediaName: '', mediaType: '', audioName: '',
  };
  let prefs = { ...DEFAULTS, ...S.get('ambiencePrefs', DEFAULTS) };
  let backdropUrl = '';
  let soundUrl = '';
  let runtimeSound = false;

  document.documentElement.classList.add('ui-polish-v13');

  /* ══════════ المشاهد ══════════ */
  const SCENES = {
    original: { title: 'الخلفية الأصلية', hint: 'شكل الكتاب المعتاد بلا صورة أو فيديو', kind: 'none', sound: '' },
    ocean: { title: 'بحر عند الشروق', hint: 'ماء هادئ وإضاءة ذهبية خفيفة', kind: 'photo', file: '/backgrounds/ocean-dawn.webp', sound: 'waves' },
    forest: { title: 'غابة بعد المطر', hint: 'ضباب أخضر ومشهد مريح للعين', kind: 'photo', file: '/backgrounds/forest-mist.webp', sound: 'rain' },
    desert: { title: 'ليل الصحراء', hint: 'كثبان هادئة وقمر في ساعة الزرقة', kind: 'photo', file: '/backgrounds/desert-night.webp', sound: 'wind' },
    waves: { title: 'موج يتحرك', hint: 'بحر مرسوم يتحرك بهدوء، خفيف على البطارية', kind: 'live', sound: 'waves' },
    rain: { title: 'مطر على الزجاج', hint: 'خيوط مطر بطيئة وضوء أزرق', kind: 'live', sound: 'rain' },
    night: { title: 'ليل ونجوم', hint: 'سماء صافية ونجوم تتلألأ', kind: 'live', sound: 'wind' },
    aurora: { title: 'شفق قطبي', hint: 'ألوان تتنفس ببطء خلف النص', kind: 'live', sound: 'wind' },
    hearth: { title: 'دفء المساء', hint: 'وهج دافئ يشبه ضوء المدفأة', kind: 'live', sound: 'fire' },
    custom: { title: 'خلفيتي الخاصة', hint: 'صورة أو فيديو محفوظ على هذا الجهاز', kind: 'custom', sound: '' },
  };
  const SURFACES = {
    paper: ['ورقة', 'صفحة واضحة فوق المشهد'],
    glass: ['زجاج', 'سطح شفاف يظهر المشهد خلف الكلمات'],
    open: ['بلا سطح', 'النص مباشرة على الخلفية'],
  };
  const SOUNDS = {
    none: 'بلا صوت', waves: 'أمواج البحر', rain: 'مطر هادئ', wind: 'رياح خفيفة',
    river: 'جدول ماء', fire: 'مدفأة', hush: 'همس ساكن للتركيز', file: 'ملفي الصوتي',
  };

  const wavesScene = `<div class="scene-waves">
    <span class="sky"></span><span class="sun"></span>
    <svg class="waves-svg" viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden="true">
      <g class="wave wave-a" fill="#1b4670" opacity=".9"><path d="M0,54 C150,26 300,82 600,54 C900,26 1050,82 1200,54 C1500,26 1650,82 1800,54 C2100,26 2250,82 2400,54 L2400,300 L0,300 Z"/></g>
      <g class="wave wave-b" fill="#0d2a48" opacity=".92"><path d="M0,124 C200,98 340,152 600,124 C860,96 1000,152 1200,124 C1460,98 1600,152 1800,124 C2060,96 2200,152 2400,124 L2400,300 L0,300 Z"/></g>
      <g class="wave wave-c" fill="#07182d"><path d="M0,196 C180,172 320,224 600,196 C880,168 1020,224 1200,196 C1480,172 1620,224 1800,196 C2080,168 2220,224 2400,196 L2400,300 L0,300 Z"/></g>
    </svg>
  </div>`;
  const liveScene = (mode) => mode === 'waves' ? wavesScene
    : mode === 'rain' ? '<div class="scene-rain"><i></i><i></i><i></i></div>'
      : mode === 'night' ? '<div class="scene-night"><i></i><i></i><b></b></div>'
        : mode === 'aurora' ? '<div class="scene-aurora"><i></i><i></i><i></i></div>'
          : mode === 'hearth' ? '<div class="scene-hearth"><i></i><i></i></div>' : '';

  /* ══════════ الطبقات والواجهة ══════════ */
  document.body.insertAdjacentHTML('afterbegin', '<div id="readerBackdrop" aria-hidden="true"><div id="ambientScene"></div><img id="ambientImage" alt=""><video id="ambientVideo" loop playsinline preload="metadata" muted></video><div class="ambient-wash"></div><div class="ambient-grain"></div></div>');
  document.body.insertAdjacentHTML('beforeend', '<button id="ambientSoundDock" type="button" aria-label="تشغيل أو إيقاف صوت الخلفية"><i>🔇</i><span>صوت الخلفية</span></button><audio id="ambientAudio" loop playsinline preload="metadata"></audio>');

  one('#prefs')?.insertAdjacentHTML('beforeend', '<div class="prow ambience-pref-card" style="margin-bottom:0"><button class="ambience-open" id="ambienceOpen" type="button"><span>🌊</span><div><b>خلفية الكتاب والأجواء</b><small id="ambiencePrefStatus">الخلفية الأصلية</small></div><i>‹</i></button></div>');
  one('.drawer-actions')?.insertAdjacentHTML('beforeend', '<button id="drawerAmbience">🌊 الخلفية</button>');

  document.body.insertAdjacentHTML('beforeend', `<div class="tool-shade" id="ambienceShade" aria-hidden="true"><section class="tool-sheet" id="ambienceSheet" role="dialog" aria-modal="true" aria-labelledby="ambienceTitle"><div class="tool-handle"></div><header class="tool-head"><div><h2 id="ambienceTitle">خلفية الكتاب والأجواء</h2><p>مشهد خلف الكلمات، وصوت هادئ إن أردت. تعود للشكل الأصلي بضغطة واحدة.</p></div><button class="tool-close" id="ambienceClose" aria-label="إغلاق">✕</button></header>
    <div class="ambience-current"><small>المشهد النشط</small><h3 id="ambienceNow">الخلفية الأصلية</h3><p id="ambienceNowSub">شكل الكتاب المعتاد بلا صورة أو فيديو</p></div>

    <div class="ambience-title">مشاهد مصورة</div>
    <div class="ambience-presets">
      <button class="ambience-preset" data-mode="original"><span>الكتاب الأصلي</span></button>
      <button class="ambience-preset" data-mode="ocean"><span>بحر عند الشروق</span></button>
      <button class="ambience-preset" data-mode="forest"><span>غابة بعد المطر</span></button>
      <button class="ambience-preset" data-mode="desert"><span>ليل الصحراء</span></button>
    </div>

    <div class="ambience-title">مشاهد حيّة تُرسم داخل التطبيق</div>
    <div class="ambience-presets live">
      <button class="ambience-preset" data-mode="waves"><span>موج يتحرك</span></button>
      <button class="ambience-preset" data-mode="rain"><span>مطر على الزجاج</span></button>
      <button class="ambience-preset" data-mode="night"><span>ليل ونجوم</span></button>
      <button class="ambience-preset" data-mode="aurora"><span>شفق قطبي</span></button>
      <button class="ambience-preset" data-mode="hearth"><span>دفء المساء</span></button>
    </div>

    <div class="ambience-title">شكل سطح القراءة</div>
    <div class="ambience-surfaces" id="ambienceSurfaces">
      ${Object.entries(SURFACES).map(([key, [title, hint]]) => `<button class="ambience-surface" data-surface="${key}"><b>${title}</b><small>${hint}</small></button>`).join('')}
    </div>

    <div class="ambience-title">الصوت المصاحب</div>
    <div class="ambience-sounds" id="ambienceSounds">
      ${Object.entries(SOUNDS).map(([key, label]) => `<button class="ambience-sound" data-sound="${key}"${key === 'file' ? ' id="ambienceSoundFile"' : ''}>${label}</button>`).join('')}
    </div>
    <button class="ambience-play" id="ambientSound" type="button"><i>🔈</i><span id="ambientSoundLabel">تشغيل الصوت</span><small id="ambientSoundHint">صوت مولّد داخل جهازك بلا تنزيل</small></button>

    <div class="ambience-custom">
      <button class="ambience-file" id="ambiencePickMedia"><span>🖼</span><div><b>صورة أو فيديو من جهازي</b><small id="ambienceMediaName">PNG · JPG · MP4 · MOV</small></div></button>
      <button class="ambience-file" id="ambiencePickAudio"><span>🎧</span><div><b>ملف صوت من جهازي</b><small id="ambienceAudioName">صوت البحر أو المطر مثلًا</small></div></button>
      <input id="ambienceMediaInput" type="file" accept="image/*,video/*" hidden>
      <input id="ambienceAudioInput" type="file" accept="audio/*" hidden>
    </div>

    <div class="ambience-controls">
      <div class="ambience-control"><label for="ambientDim"><span>تعتيم الخلفية</span><b id="ambientDimValue">٣٠٪</b></label><input id="ambientDim" type="range" min="0" max="80" step="2"></div>
      <div class="ambience-control" data-only="paper glass"><label for="ambientPaper"><span>وضوح ورقة القراءة</span><b id="ambientPaperValue">٨٨٪</b></label><input id="ambientPaper" type="range" min="30" max="98" step="2"></div>
      <div class="ambience-control" data-only="open"><label for="ambientVeil"><span>ظل خلف النص</span><b id="ambientVeilValue">٤٠٪</b></label><input id="ambientVeil" type="range" min="0" max="85" step="5"></div>
      <div class="ambience-control"><label for="ambientBlur"><span>ضبابية الخلفية</span><b id="ambientBlurValue">٠px</b></label><input id="ambientBlur" type="range" min="0" max="16" step="1"></div>
      <div class="ambience-control"><label for="ambientVolume"><span>مستوى الصوت</span><b id="ambientVolumeValue">٣٥٪</b></label><input id="ambientVolume" type="range" min="0" max="100" step="5"></div>
    </div>

    <div class="ambience-switches">
      <button class="ambience-switch" id="ambientMotion" type="button"><span><b>حركة سينمائية هادئة</b><small>تنفّس بطيء للمشهد</small></span><i></i></button>
      <button class="ambience-switch" id="ambientCover" type="button"><span><b>المشهد على الغلاف أيضًا</b><small>يظهر خلف صفحة العنوان</small></span><i></i></button>
    </div>

    <div class="ambience-actions"><button class="tool-btn" id="ambienceOriginal" type="button">العودة إلى الشكل الأصلي</button><button class="tool-btn primary" id="ambienceDone" type="button">تم</button></div>
    <p class="ambience-note">المشاهد الحيّة والأصوات تُولَّد داخل جهازك، فلا تستهلك بيانات ولا تحتاج إنترنت. الفيديو المرفوع يبدأ صامتًا حتى تشغّل صوته بنفسك.</p>
  </section></div>`);

  const backdrop = one('#readerBackdrop');
  const scene = one('#ambientScene');
  const image = one('#ambientImage');
  const video = one('#ambientVideo');
  const audio = one('#ambientAudio');

  /* ══════════ ملفات المستخدم ══════════ */
  let dbPromise;
  function ambienceDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('mafateeh-reader-v10', 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('attachments')) request.result.createObjectStore('attachments', { keyPath: 'id' }); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }
  async function mediaStore(mode, action) {
    const db = await ambienceDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('attachments', mode);
      const request = action(transaction.objectStore('attachments'));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  const getMedia = (id) => mediaStore('readonly', (store) => store.get(id));
  const putMedia = (record) => mediaStore('readwrite', (store) => store.put(record));

  /* ══════════ مولّد الصوت داخل الجهاز ══════════ */
  const engine = { context: null, nodes: [], master: null, timer: 0 };
  function noiseBuffer(context, kind) {
    const length = context.sampleRate * 8;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    if (kind === 'brown') {
      let last = 0;
      for (let i = 0; i < length; i += 1) { const white = Math.random() * 2 - 1; last = (last + 0.02 * white) / 1.02; data[i] = last * 3.4; }
    } else if (kind === 'pink') {
      let b0 = 0; let b1 = 0; let b2 = 0;
      for (let i = 0; i < length; i += 1) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.0990460;
        b1 = 0.96300 * b1 + white * 0.2965164;
        b2 = 0.57000 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.22;
      }
    } else {
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * 0.5;
    }
    return buffer;
  }
  const noiseSource = (context, kind) => {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(context, kind);
    source.loop = true;
    return source;
  };
  function lfo(context, target, { rate, depth, base }) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = rate;
    gain.gain.value = depth;
    oscillator.connect(gain).connect(target);
    target.value = base;
    oscillator.start();
    return oscillator;
  }
  function buildSound(kind) {
    const context = engine.context;
    const master = engine.master;
    const extra = [];
    const attach = (source, chain) => {
      let node = source;
      chain.forEach((next) => { node.connect(next); node = next; });
      node.connect(master);
      engine.nodes.push(source, ...chain);
      source.start();
    };

    if (kind === 'waves') {
      const source = noiseSource(context, 'brown');
      const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 0.6;
      const swell = context.createGain();
      extra.push(lfo(context, filter.frequency, { rate: 0.06, depth: 240, base: 520 }));
      extra.push(lfo(context, swell.gain, { rate: 0.075, depth: 0.4, base: 0.58 }));
      attach(source, [filter, swell]);
    } else if (kind === 'rain') {
      const hiss = noiseSource(context, 'white');
      const high = context.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 900;
      const low = context.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 7200;
      const level = context.createGain(); level.gain.value = 0.3;
      attach(hiss, [high, low, level]);
      const rumble = noiseSource(context, 'brown');
      const deep = context.createBiquadFilter(); deep.type = 'lowpass'; deep.frequency.value = 320;
      const deepLevel = context.createGain(); deepLevel.gain.value = 0.45;
      attach(rumble, [deep, deepLevel]);
    } else if (kind === 'wind') {
      const source = noiseSource(context, 'brown');
      const band = context.createBiquadFilter(); band.type = 'bandpass'; band.Q.value = 0.9;
      const level = context.createGain();
      extra.push(lfo(context, band.frequency, { rate: 0.045, depth: 260, base: 480 }));
      extra.push(lfo(context, level.gain, { rate: 0.09, depth: 0.28, base: 0.6 }));
      attach(source, [band, level]);
    } else if (kind === 'river') {
      const source = noiseSource(context, 'pink');
      const band = context.createBiquadFilter(); band.type = 'bandpass'; band.Q.value = 0.5;
      const level = context.createGain(); level.gain.value = 0.5;
      extra.push(lfo(context, band.frequency, { rate: 0.12, depth: 180, base: 1250 }));
      attach(source, [band, level]);
    } else if (kind === 'hush') {
      const source = noiseSource(context, 'brown');
      const low = context.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 900;
      const level = context.createGain(); level.gain.value = 0.55;
      attach(source, [low, level]);
    } else if (kind === 'fire') {
      const bed = noiseSource(context, 'brown');
      const low = context.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 420;
      const level = context.createGain(); level.gain.value = 0.5;
      attach(bed, [low, level]);
      const crackle = () => {
        if (!engine.context || !runtimeSound) return;
        const pop = context.createBufferSource();
        pop.buffer = noiseBuffer(context, 'white');
        const band = context.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 1400 + Math.random() * 2200; band.Q.value = 6;
        const shape = context.createGain();
        const now = context.currentTime;
        shape.gain.setValueAtTime(0.0001, now);
        shape.gain.linearRampToValueAtTime(0.26 + Math.random() * 0.3, now + 0.006);
        shape.gain.exponentialRampToValueAtTime(0.0001, now + 0.06 + Math.random() * 0.12);
        pop.connect(band).connect(shape).connect(master);
        pop.start(now);
        pop.stop(now + 0.4);
        engine.timer = setTimeout(crackle, 130 + Math.random() * 900);
      };
      engine.timer = setTimeout(crackle, 250);
    }
    engine.nodes.push(...extra);
  }
  function engineStop(fade = 0.45) {
    clearTimeout(engine.timer);
    const context = engine.context;
    if (!context) return;
    try {
      engine.master.gain.cancelScheduledValues(context.currentTime);
      engine.master.gain.setTargetAtTime(0.0001, context.currentTime, fade / 3);
    } catch (_) { /* لا شيء */ }
    const nodes = engine.nodes;
    engine.nodes = [];
    setTimeout(() => nodes.forEach((node) => { try { node.stop?.(); } catch (_) { /* لا شيء */ } try { node.disconnect?.(); } catch (_) { /* لا شيء */ } }), fade * 1000 + 80);
  }
  async function engineStart(kind) {
    if (!engine.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return false;
      engine.context = new Context();
      engine.master = engine.context.createGain();
      engine.master.gain.value = 0.0001;
      engine.master.connect(engine.context.destination);
    }
    if (engine.context.state === 'suspended') await engine.context.resume().catch(() => {});
    engineStop(0.12);
    await new Promise((resolve) => setTimeout(resolve, 140));
    runtimeSound = true;
    buildSound(kind);
    const target = Math.max(0.0001, (prefs.volume / 100) * 0.9);
    engine.master.gain.cancelScheduledValues(engine.context.currentTime);
    engine.master.gain.setValueAtTime(0.0001, engine.context.currentTime);
    engine.master.gain.setTargetAtTime(target, engine.context.currentTime, 0.6);
    return true;
  }
  const engineVolume = () => {
    if (!engine.context || !runtimeSound) return;
    try { engine.master.gain.setTargetAtTime(Math.max(0.0001, (prefs.volume / 100) * 0.9), engine.context.currentTime, 0.2); } catch (_) { /* لا شيء */ }
  };

  /* ══════════ الحالة والعرض ══════════ */
  const setPref = (key, value) => { prefs[key] = value; S.set('ambiencePrefs', prefs); };
  const activeSound = () => (prefs.sound === 'auto' ? (SCENES[prefs.mode]?.sound || '') : (prefs.sound === 'none' ? '' : prefs.sound));
  const hasFileSound = () => Boolean(prefs.audioName) || (prefs.mode === 'custom' && prefs.mediaType.startsWith('video/'));

  function applyControls() {
    const root = document.documentElement;
    root.style.setProperty('--ambient-dim', String(prefs.dim / 100));
    root.style.setProperty('--ambient-blur', `${prefs.blur}px`);
    root.style.setProperty('--ambient-paper', String(prefs.paper / 100));
    root.style.setProperty('--ambient-veil', String(prefs.veil / 100));
    root.dataset.surface = prefs.surface;
    root.classList.toggle('ambience-cover', Boolean(prefs.cover) && prefs.mode !== 'original');
    one('#ambientDim').value = prefs.dim;
    one('#ambientPaper').value = prefs.paper;
    one('#ambientBlur').value = prefs.blur;
    one('#ambientVolume').value = prefs.volume;
    one('#ambientVeil').value = prefs.veil;
    one('#ambientDimValue').textContent = `${AR(prefs.dim)}٪`;
    one('#ambientPaperValue').textContent = `${AR(prefs.paper)}٪`;
    one('#ambientBlurValue').textContent = `${AR(prefs.blur)}px`;
    one('#ambientVolumeValue').textContent = `${AR(prefs.volume)}٪`;
    one('#ambientVeilValue').textContent = `${AR(prefs.veil)}٪`;
    one('#ambientMotion').classList.toggle('on', prefs.motion);
    one('#ambientCover').classList.toggle('on', prefs.cover);
    backdrop.classList.toggle('motion', prefs.motion);
    many('[data-only]').forEach((node) => { node.hidden = !node.dataset.only.split(' ').includes(prefs.surface); });
    video.volume = prefs.volume / 100;
    audio.volume = prefs.volume / 100;
    engineVolume();
  }

  function renderLabels() {
    const info = SCENES[prefs.mode] || SCENES.original;
    one('#ambienceNow').textContent = info.title;
    one('#ambienceNowSub').textContent = info.hint;
    one('#ambiencePrefStatus').textContent = prefs.mode === 'original' ? 'الخلفية الأصلية' : `${info.title} · ${SURFACES[prefs.surface][0]}`;
    one('#ambienceMediaName').textContent = prefs.mediaName || 'PNG · JPG · MP4 · MOV';
    one('#ambienceAudioName').textContent = prefs.audioName || 'صوت البحر أو المطر مثلًا';
    many('[data-mode]').forEach((button) => button.classList.toggle('on', button.dataset.mode === prefs.mode));
    many('[data-surface]').forEach((button) => button.classList.toggle('on', button.dataset.surface === prefs.surface));
    const sound = activeSound();
    many('[data-sound]').forEach((button) => {
      const value = button.dataset.sound;
      button.classList.toggle('on', prefs.sound === 'auto' ? value === (sound || 'none') : prefs.sound === value);
    });
    one('#ambienceSoundFile').classList.toggle('ready', hasFileSound());
    one('#ambientSound').classList.toggle('on', runtimeSound);
    one('#ambientSoundLabel').textContent = runtimeSound ? 'إيقاف الصوت' : 'تشغيل الصوت';
    one('#ambientSoundHint').textContent = sound === 'file'
      ? (prefs.audioName ? `ملفك: ${prefs.audioName}` : 'صوت الفيديو المرفوع')
      : sound ? `${SOUNDS[sound]} — يُولَّد داخل جهازك بلا تنزيل` : 'اختر صوتًا من القائمة أعلاه';
    const dock = one('#ambientSoundDock');
    dock.classList.toggle('on', Boolean(sound) && prefs.mode !== 'original');
    dock.classList.toggle('playing', runtimeSound);
    one('i', dock).textContent = runtimeSound ? '🔊' : '🔇';
    one('span', dock).textContent = runtimeSound ? 'إيقاف الصوت' : 'تشغيل الصوت';
  }

  function stopSound() {
    runtimeSound = false;
    engineStop(0.45);
    video.muted = true;
    audio.pause();
    renderLabels();
  }

  async function loadUploadedAudio() {
    const record = await getMedia('ambience:audio').catch(() => null);
    if (!record?.blob) return false;
    if (soundUrl) URL.revokeObjectURL(soundUrl);
    soundUrl = URL.createObjectURL(record.blob);
    audio.src = soundUrl;
    audio.volume = prefs.volume / 100;
    return true;
  }

  async function toggleSound() {
    if (runtimeSound) { stopSound(); return; }
    const sound = activeSound();
    if (!sound) { toast('اختر صوتًا من قائمة «الصوت المصاحب»'); return; }
    try {
      if (sound === 'file') {
        if (prefs.audioName && await loadUploadedAudio()) { video.muted = true; await audio.play(); }
        else if (prefs.mode === 'custom' && prefs.mediaType.startsWith('video/')) { video.muted = false; video.volume = prefs.volume / 100; await video.play(); }
        else { toast('ارفع ملف صوت أو فيديو يحتوي على صوت أولًا'); return; }
        runtimeSound = true;
      } else if (!await engineStart(sound)) { toast('تشغيل الصوت غير مدعوم في هذا المتصفح'); return; }
      renderLabels();
    } catch (_) { stopSound(); toast('اضغط مرة أخرى للسماح بتشغيل الصوت'); }
  }

  async function applyAmbience() {
    const wasPlaying = runtimeSound;
    const previousSound = activeSound();
    video.pause();
    video.removeAttribute('src');
    image.removeAttribute('src');
    image.classList.remove('on');
    video.classList.remove('on');
    scene.innerHTML = '';
    if (backdropUrl) URL.revokeObjectURL(backdropUrl);
    backdropUrl = '';

    const info = SCENES[prefs.mode] || SCENES.original;
    const active = prefs.mode !== 'original';
    /* أول مرة يختار فيها القارئ مشهدًا: اجعل السطح زجاجيًا ليظهر المشهد خلف الكلمات فعلًا. */
    if (active && !prefs.surfaceTouched && prefs.surface === 'paper') prefs.surface = 'glass';
    document.documentElement.classList.toggle('ambience-active', active);
    backdrop.dataset.scene = active ? prefs.mode : '';
    /* إظهار الطبقة قبل رسم المشهد يضمن بدء التلاشي من أول مرة في كل المتصفحات. */
    if (active) { backdrop.style.visibility = 'visible'; void backdrop.offsetHeight; }
    backdrop.classList.toggle('on', active);
    if (!active) backdrop.style.visibility = '';
    applyControls();
    renderLabels();
    if (!active) { if (wasPlaying) stopSound(); return; }

    if (info.kind === 'photo') { image.src = info.file; image.classList.add('on'); }
    else if (info.kind === 'live') { scene.innerHTML = liveScene(prefs.mode); }
    else if (info.kind === 'custom') {
      const record = await getMedia('ambience:background').catch(() => null);
      if (!record?.blob) { setPref('mode', 'original'); await applyAmbience(); toast('اختر صورة أو فيديو من جهازك أولًا'); return; }
      backdropUrl = URL.createObjectURL(record.blob);
      if (record.type.startsWith('video/')) { video.src = backdropUrl; video.muted = true; video.classList.add('on'); video.play().catch(() => {}); }
      else { image.src = backdropUrl; image.classList.add('on'); }
    }

    /* الصوت يتبع المشهد ما لم يختر القارئ صوتًا بعينه. */
    const nextSound = activeSound();
    if (wasPlaying && nextSound && nextSound !== previousSound) { stopSound(); await toggleSound(); }
    else if (wasPlaying && !nextSound) stopSound();
    else renderLabels();
  }

  /* ══════════ الربط ══════════ */
  const openAmbience = () => {
    autoScrollPause(true);
    applyControls();
    renderLabels();
    one('#ambienceShade').classList.add('on');
    one('#ambienceShade').setAttribute('aria-hidden', 'false');
    closeDrawer();
  };
  const closeAmbience = () => { one('#ambienceShade').classList.remove('on'); one('#ambienceShade').setAttribute('aria-hidden', 'true'); };
  one('#ambienceOpen').onclick = openAmbience;
  one('#drawerAmbience').onclick = openAmbience;
  one('#ambienceClose').onclick = closeAmbience;
  one('#ambienceDone').onclick = closeAmbience;
  one('#ambienceShade').onclick = (event) => { if (event.target === one('#ambienceShade')) closeAmbience(); };

  many('[data-mode]').forEach((button) => { button.onclick = async () => { setPref('mode', button.dataset.mode); await applyAmbience(); }; });
  many('[data-surface]').forEach((button) => { button.onclick = () => { setPref('surfaceTouched', true); setPref('surface', button.dataset.surface); applyControls(); renderLabels(); }; });
  many('[data-sound]').forEach((button) => {
    button.onclick = async () => {
      const value = button.dataset.sound;
      if (value === 'file' && !hasFileSound()) { one('#ambiencePickAudio').click(); return; }
      setPref('sound', value);
      renderLabels();
      if (value === 'none') { stopSound(); return; }
      if (runtimeSound) { stopSound(); await toggleSound(); }
    };
  });
  one('#ambienceOriginal').onclick = async () => { setPref('mode', 'original'); setPref('cover', false); setPref('surfaceTouched', false); setPref('surface', 'paper'); await applyAmbience(); toast('عادت خلفية الكتاب الأصلية ✓'); };
  one('#ambiencePickMedia').onclick = () => one('#ambienceMediaInput').click();
  one('#ambiencePickAudio').onclick = () => one('#ambienceAudioInput').click();

  one('#ambienceMediaInput').onchange = async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (!/^(image|video)\//.test(file.type)) { toast('اختر صورة أو فيديو صالحًا'); return; }
    if (file.size > 150 * 1024 * 1024) { toast('حجم الخلفية يجب ألا يتجاوز ١٥٠ م.ب'); return; }
    toast('يتم حفظ الخلفية على جهازك…');
    await putMedia({ id: 'ambience:background', markId: '__ambience__', name: file.name, type: file.type, size: file.size, createdAt: Date.now(), blob: file });
    prefs = { ...prefs, mode: 'custom', mediaName: file.name, mediaType: file.type };
    S.set('ambiencePrefs', prefs);
    await applyAmbience();
    toast('تم تطبيق خلفيتك الخاصة ✓');
  };
  one('#ambienceAudioInput').onchange = async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('audio/')) { toast('اختر ملفًا صوتيًا صالحًا'); return; }
    if (file.size > 60 * 1024 * 1024) { toast('حجم الصوت يجب ألا يتجاوز ٦٠ م.ب'); return; }
    toast('يتم حفظ الصوت على جهازك…');
    await putMedia({ id: 'ambience:audio', markId: '__ambience__', name: file.name, type: file.type, size: file.size, createdAt: Date.now(), blob: file });
    setPref('audioName', file.name);
    setPref('sound', 'file');
    renderLabels();
    if (runtimeSound) stopSound();
    await toggleSound();
  };

  const slider = (id, key, output, suffix = '') => {
    one(id).oninput = (event) => { setPref(key, +event.target.value); one(output).textContent = `${AR(event.target.value)}${suffix}`; applyControls(); };
  };
  slider('#ambientDim', 'dim', '#ambientDimValue', '٪');
  slider('#ambientPaper', 'paper', '#ambientPaperValue', '٪');
  slider('#ambientVeil', 'veil', '#ambientVeilValue', '٪');
  slider('#ambientBlur', 'blur', '#ambientBlurValue', 'px');
  slider('#ambientVolume', 'volume', '#ambientVolumeValue', '٪');
  one('#ambientMotion').onclick = () => { setPref('motion', !prefs.motion); applyControls(); };
  one('#ambientCover').onclick = () => { setPref('cover', !prefs.cover); applyControls(); };
  one('#ambientSound').onclick = toggleSound;
  one('#ambientSoundDock').onclick = toggleSound;
  document.addEventListener('visibilitychange', () => { if (document.hidden && runtimeSound) stopSound(); });
  addEventListener('keydown', (event) => { if (event.key === 'Escape') closeAmbience(); });

  /* ══════════ بطاقة الاقتباس ذات الملاءمة التلقائية ══════════ */
  const canvas = one('#quoteCanvas');
  const ctx = canvas?.getContext('2d');
  function wrappedLines(text, maxWidth) {
    const words = String(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }
  function fitQuote(text, maxWidth, maxHeight, largest, smallest) {
    for (let size = largest; size >= smallest; size -= 2) {
      ctx.font = `700 ${size}px "Geeza Pro","SF Arabic",Tahoma,serif`;
      const lines = wrappedLines(text, maxWidth);
      if (lines.length * size * 1.58 <= maxHeight) return { size, lines, lineHeight: size * 1.58 };
    }
    ctx.font = `700 ${smallest}px "Geeza Pro","SF Arabic",Tahoma,serif`;
    const maxLines = Math.max(3, Math.floor(maxHeight / (smallest * 1.58)));
    const lines = wrappedLines(text, maxWidth);
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.،؛…\s]+$/g, '')}…`; }
    return { size: smallest, lines, lineHeight: smallest * 1.58 };
  }
  function drawBeautifulCard() {
    if (!ctx) return;
    const sizeMode = one('#cardSize').value;
    const theme = one('#cardTheme').value;
    const dimensions = sizeMode === 'story' ? [1080, 1920] : sizeMode === 'wide' ? [1600, 900] : [1080, 1080];
    canvas.width = dimensions[0];
    canvas.height = dimensions[1];
    const [width, height] = dimensions;
    const palettes = { navy: ['#0a1930', '#3b2b63', '#e9c37c', '#ffffff'], paper: ['#f7f0e3', '#e4d4b5', '#9c7137', '#33271d'], aurora: ['#103d57', '#713a72', '#ffd17f', '#ffffff'], minimal: ['#ffffff', '#edf1f5', '#b4894a', '#18243a'] };
    const p = palettes[theme] || palettes.navy;
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, p[0]);
    gradient.addColorStop(1, p[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    const pad = width * 0.06;
    ctx.strokeStyle = p[2];
    ctx.lineWidth = Math.max(4, width * 0.0045);
    ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = p[2];
    ctx.beginPath(); ctx.arc(width * 0.82, height * 0.17, width * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(width * 0.18, height * 0.8, width * 0.11, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.fillStyle = p[2];
    ctx.font = `700 ${Math.max(24, width * 0.025)}px "SF Arabic",Tahoma,sans-serif`;
    ctx.fillText(D.meta.title, width / 2, height * 0.13);
    ctx.fillRect(width * 0.43, height * 0.155, width * 0.14, Math.max(3, width * 0.0025));
    const quote = one('#cardText').value.trim() || D.meta.title;
    const top = height * 0.23;
    const bottom = height * 0.76;
    const fit = fitQuote(quote, width * 0.76, bottom - top, sizeMode === 'story' ? 76 : Math.min(68, width * 0.06), sizeMode === 'story' ? 42 : 34);
    ctx.font = `700 ${fit.size}px "Geeza Pro","SF Arabic",Tahoma,serif`;
    ctx.fillStyle = p[3];
    let y = top + (bottom - top - fit.lines.length * fit.lineHeight) / 2 + fit.size;
    for (const line of fit.lines) { ctx.fillText(line, width / 2, y); y += fit.lineHeight; }
    ctx.fillStyle = p[2];
    ctx.globalAlpha = 0.34;
    ctx.font = `700 ${Math.max(90, width * 0.1)}px Georgia,serif`;
    ctx.fillText('”', width * 0.84, top);
    ctx.globalAlpha = 1;
    ctx.fillStyle = p[2];
    ctx.fillRect(width * 0.37, height * 0.82, width * 0.26, Math.max(4, height * 0.004));
    ctx.font = `600 ${Math.max(25, width * 0.024)}px "SF Arabic",Tahoma,sans-serif`;
    ctx.fillText(D.meta.author, width / 2, height * 0.88);
    one('#cardTextCounter').textContent = `${AR(quote.length)} حرفًا · ضبط تلقائي`;
  }
  if (canvas) {
    const textarea = one('#cardText');
    const label = textarea.closest('label');
    [...label.childNodes].filter((node) => node.nodeType === 3).forEach((node) => node.remove());
    label.insertAdjacentHTML('afterbegin', '<span class="card-text-head"><b>نص البطاقة</b><small id="cardTextCounter">ضبط تلقائي</small></span>');
    textarea.oninput = drawBeautifulCard;
    one('#cardSize').onchange = drawBeautifulCard;
    one('#cardTheme').onchange = drawBeautifulCard;
    one('#qCard').addEventListener('click', () => setTimeout(drawBeautifulCard, 0));
    drawBeautifulCard();
  }

  applyAmbience();
  window.__MAFATEEH_AMBIENCE__ = { version: 13, apply: applyAmbience, open: openAmbience, toggleSound, scenes: SCENES };
})();
