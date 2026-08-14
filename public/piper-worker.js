/* مفاتيح الثروة — Piper Worker
   Piper يعمل محليًا في المتصفح بعد تنزيل نموذج ar_JO-kareem-medium.
   النص لا يُرسل إلى خادم التطبيق أو مزود سحابي في هذا الوضع. */
const MODULE_URL = 'https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.5/+esm';
const DEFAULT_VOICE = 'ar_JO-kareem-medium';
let ttsPromise;
const load = () => ttsPromise || (ttsPromise = import(MODULE_URL));
const answer = (id, ok, data = {}) => postMessage({ id, ok, ...data });

self.onmessage = async (event) => {
  const { id, action, text, voiceId = DEFAULT_VOICE } = event.data || {};
  try {
    const tts = await load();
    if (action === 'status') {
      const stored = typeof tts.stored === 'function' ? await tts.stored() : [];
      return answer(id, true, { stored, voiceId });
    }
    if (action === 'prepare') {
      if (typeof tts.download !== 'function') throw new Error('piper_download_unavailable');
      await tts.download(voiceId, (progress) => {
        const loaded = Number(progress?.loaded || 0), total = Number(progress?.total || 0);
        postMessage({ id, progress: true, url: progress?.url || '', loaded, total, percent: total ? Math.round(loaded * 100 / total) : 0 });
      });
      const stored = typeof tts.stored === 'function' ? await tts.stored() : [voiceId];
      return answer(id, true, { stored, voiceId });
    }
    if (action === 'speak') {
      const value = String(text || '').trim();
      if (!value) throw new Error('empty_text');
      if (typeof tts.predict !== 'function') throw new Error('piper_predict_unavailable');
      const blob = await tts.predict({ text: value, voiceId });
      return answer(id, true, { blob, voiceId });
    }
    if (action === 'remove') {
      if (typeof tts.remove === 'function') await tts.remove(voiceId);
      return answer(id, true, { voiceId });
    }
    throw new Error('unknown_action');
  } catch (error) {
    answer(id, false, { error: error?.message || String(error) || 'piper_failed' });
  }
};
