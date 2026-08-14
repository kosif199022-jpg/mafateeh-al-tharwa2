/* مفاتيح الثروة — Professional Multi-Layer Audio Mixer v22 */
(function(){
  'use strict';
  const $=(s,r=document)=>r.querySelector(s);
  const LAYERS={
    rain:{icon:'🌧️',name:'مطر',kind:'rain',level:38},
    waves:{icon:'🌊',name:'أمواج',kind:'waves',level:42},
    wind:{icon:'💨',name:'رياح',kind:'wind',level:24},
    river:{icon:'💧',name:'نهر',kind:'river',level:28},
    fire:{icon:'🔥',name:'نار',kind:'fire',level:22},
    forest:{icon:'🌲',name:'غابة',kind:'forest',level:25},
    thunder:{icon:'⛈️',name:'رعد',kind:'thunder',level:32},
    lightning:{icon:'⚡',name:'برق',kind:'lightning',level:18}
  };
  const saved=(()=>{try{return JSON.parse(localStorage.getItem('mafateehMixerV22')||'{}')}catch{return {}}})();
  const state={
    context:null, master:null, active:new Map(), timers:new Map(),
    masterLevel:Number.isFinite(+saved.masterLevel)?+saved.masterLevel:75,
    narratorLevel:Number.isFinite(+saved.narratorLevel)?+saved.narratorLevel:100,
    ducking:saved.ducking!==false, duckLevel:Number.isFinite(+saved.duckLevel)?+saved.duckLevel:28,
    levels:{...Object.fromEntries(Object.entries(LAYERS).map(([k,v])=>[k,v.level])),...(saved.levels||{})},
    enabled:new Set(Array.isArray(saved.enabled)?saved.enabled:[]), narration:false
  };
  function persist(){
    localStorage.setItem('mafateehMixerV22',JSON.stringify({masterLevel:state.masterLevel,narratorLevel:state.narratorLevel,ducking:state.ducking,duckLevel:state.duckLevel,levels:state.levels,enabled:[...state.enabled]}));
  }
  function ensureContext(){
    if(state.context) return state.context;
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) throw new Error('Web Audio غير مدعوم على هذا الجهاز');
    state.context=new AC();
    state.master=state.context.createGain();
    state.master.connect(state.context.destination);
    applyMaster(true);
    return state.context;
  }
  function resume(){const c=ensureContext();if(c.state==='suspended') return c.resume();return Promise.resolve();}
  function noiseBuffer(kind='white',seconds=8){
    const c=ensureContext(),len=Math.floor(c.sampleRate*seconds),b=c.createBuffer(1,len,c.sampleRate),d=b.getChannelData(0);
    let last=0,b0=0,b1=0,b2=0;
    for(let i=0;i<len;i++){
      const w=Math.random()*2-1;
      if(kind==='brown'){last=(last+0.02*w)/1.02;d[i]=last*3.2;}
      else if(kind==='pink'){b0=.99765*b0+w*.099046;b1=.963*b1+w*.2965164;b2=.57*b2+w*1.0526913;d[i]=(b0+b1+b2+w*.1848)*.2;}
      else d[i]=w*.48;
    }
    return b;
  }
  function noise(kind='white'){const c=ensureContext(),s=c.createBufferSource();s.buffer=noiseBuffer(kind);s.loop=true;return s;}
  function chain(nodes,gain){
    const c=ensureContext(),g=c.createGain();g.gain.value=gain;
    let last=nodes[0];for(let i=1;i<nodes.length;i++){last.connect(nodes[i]);last=nodes[i];}
    last.connect(g).connect(state.master);return g;
  }
  function periodicBurst(layerKey,{min=6,max=16,thunder=false,lightning=false}={}){
    const schedule=()=>{
      if(!state.enabled.has(layerKey)) return;
      const delay=(min+Math.random()*(max-min))*1000;
      const id=setTimeout(()=>{burst();schedule();},delay);state.timers.set(layerKey,id);
    };
    const burst=()=>{
      if(!state.enabled.has(layerKey)) return;
      const c=ensureContext(),now=c.currentTime;
      if(thunder){
        const s=noise('brown'),f=c.createBiquadFilter(),g=c.createGain();f.type='lowpass';f.frequency.value=260+Math.random()*180;
        const level=(state.levels[layerKey]||30)/100*.8;g.gain.setValueAtTime(.001,now);g.gain.exponentialRampToValueAtTime(Math.max(.01,level),now+.08);g.gain.exponentialRampToValueAtTime(.001,now+2.6+Math.random()*1.8);
        s.connect(f).connect(g).connect(state.master);s.start(now);s.stop(now+4.8);
      }
      if(lightning){
        const s=noise('white'),hi=c.createBiquadFilter(),g=c.createGain();hi.type='highpass';hi.frequency.value=2200;
        const level=(state.levels[layerKey]||18)/100*.45;g.gain.setValueAtTime(.001,now);g.gain.exponentialRampToValueAtTime(Math.max(.008,level),now+.008);g.gain.exponentialRampToValueAtTime(.001,now+.12);
        s.connect(hi).connect(g).connect(state.master);s.start(now);s.stop(now+.18);
      }
    };
    burst();schedule();
  }
  function createLayer(key){
    const c=ensureContext(),level=(state.levels[key]||30)/100;
    if(key==='thunder'){periodicBurst(key,{min:9,max:22,thunder:true});return {nodes:[],gain:null};}
    if(key==='lightning'){periodicBurst(key,{min:7,max:19,lightning:true});return {nodes:[],gain:null};}
    const nodes=[];let gainNode;
    if(key==='rain'){
      const a=noise('white'),hp=c.createBiquadFilter(),lp=c.createBiquadFilter();hp.type='highpass';hp.frequency.value=900;lp.type='lowpass';lp.frequency.value=7600;gainNode=chain([a,hp,lp],level*.58);nodes.push(a);a.start();
    } else if(key==='waves'){
      const a=noise('brown'),lp=c.createBiquadFilter(),g=c.createGain(),osc=c.createOscillator(),lfo=c.createGain();lp.type='lowpass';lp.frequency.value=650;g.gain.value=.55;osc.frequency.value=.075;lfo.gain.value=.35;osc.connect(lfo).connect(g.gain);gainNode=chain([a,lp,g],level*.9);nodes.push(a,osc);a.start();osc.start();
    } else if(key==='wind'){
      const a=noise('pink'),bp=c.createBiquadFilter();bp.type='bandpass';bp.frequency.value=580;bp.Q.value=.65;gainNode=chain([a,bp],level*.65);nodes.push(a);a.start();
    } else if(key==='river'){
      const a=noise('white'),bp=c.createBiquadFilter(),lp=c.createBiquadFilter();bp.type='bandpass';bp.frequency.value=1450;bp.Q.value=.35;lp.type='lowpass';lp.frequency.value=5200;gainNode=chain([a,bp,lp],level*.48);nodes.push(a);a.start();
    } else if(key==='fire'){
      const a=noise('brown'),bp=c.createBiquadFilter();bp.type='bandpass';bp.frequency.value=720;bp.Q.value=.7;gainNode=chain([a,bp],level*.45);nodes.push(a);a.start();
    } else if(key==='forest'){
      const a=noise('pink'),lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=2100;gainNode=chain([a,lp],level*.28);nodes.push(a);a.start();
      const chirp=()=>{if(!state.enabled.has(key))return;const o=c.createOscillator(),g=c.createGain(),now=c.currentTime;o.type='sine';o.frequency.setValueAtTime(1400+Math.random()*900,now);o.frequency.exponentialRampToValueAtTime(2200+Math.random()*1000,now+.12);g.gain.setValueAtTime(.001,now);g.gain.exponentialRampToValueAtTime(level*.09+.002,now+.02);g.gain.exponentialRampToValueAtTime(.001,now+.22);o.connect(g).connect(state.master);o.start(now);o.stop(now+.25);state.timers.set(key,setTimeout(chirp,3000+Math.random()*7000));};chirp();
    }
    return {nodes,gain:gainNode};
  }
  function stopLayer(key){
    const item=state.active.get(key);if(item){for(const n of item.nodes||[]){try{n.stop?.()}catch{}try{n.disconnect?.()}catch{}}try{item.gain?.disconnect()}catch{}state.active.delete(key);}
    const t=state.timers.get(key);if(t){clearTimeout(t);state.timers.delete(key);}
  }
  async function setLayer(key,on){
    if(!LAYERS[key])return;
    if(on){
      await resume();
      const wasEnabled=state.enabled.has(key);state.enabled.add(key);
      if(!state.active.has(key) && key!=='thunder' && key!=='lightning') state.active.set(key,createLayer(key));
      else if((key==='thunder'||key==='lightning')&&!wasEnabled) createLayer(key);
    } else {state.enabled.delete(key);stopLayer(key);}
    persist();render();
  }
  function setLayerLevel(key,value){state.levels[key]=+value;const item=state.active.get(key);if(item?.gain){const scale=key==='rain'?.58:key==='waves'?.9:key==='wind'?.65:key==='river'?.48:key==='fire'?.45:key==='forest'?.28:1;item.gain.gain.setTargetAtTime((+value/100)*scale,state.context.currentTime,.05);}persist();renderValues();}
  function applyMaster(immediate=false){
    if(!state.master)return;const target=(state.masterLevel/100)*(state.narration&&state.ducking?state.duckLevel/100:1);const now=state.context.currentTime;
    if(immediate) state.master.gain.setValueAtTime(target,now); else state.master.gain.setTargetAtTime(target,now,state.narration?.08:.45);
  }
  function applyNarratorVolume(){const a=$('#audioElement');if(a)a.volume=Math.max(0,Math.min(1,state.narratorLevel/100));}
  function setNarrationActive(active){state.narration=!!active;applyMaster();document.dispatchEvent(new CustomEvent('mafateeh:mixer-duck',{detail:{active:state.narration,ducking:state.ducking}}));}
  function renderValues(){
    $('#mxMasterVal')&&($('#mxMasterVal').textContent=state.masterLevel+'%');$('#mxNarratorVal')&&($('#mxNarratorVal').textContent=state.narratorLevel+'%');$('#mxDuckVal')&&($('#mxDuckVal').textContent=state.duckLevel+'%');
    for(const key of Object.keys(LAYERS)){const el=$(`[data-mx-val="${key}"]`);if(el)el.textContent=state.levels[key]+'%';}
  }
  function render(){
    for(const key of Object.keys(LAYERS)){const b=$(`[data-mx-toggle="${key}"]`);if(b){b.classList.toggle('on',state.enabled.has(key));b.setAttribute('aria-pressed',String(state.enabled.has(key)));}}
    $('#mxDucking')?.classList.toggle('on',state.ducking);renderValues();
  }
  function open(){shade.classList.add('on');shade.setAttribute('aria-hidden','false');document.documentElement.classList.add('mixer-open');render();}
  function close(){shade.classList.remove('on');shade.setAttribute('aria-hidden','true');document.documentElement.classList.remove('mixer-open');}

  const rows=Object.entries(LAYERS).map(([key,l])=>`<div class="mx-layer"><button type="button" class="mx-toggle" data-mx-toggle="${key}" aria-pressed="false"><span>${l.icon}</span><b>${l.name}</b><i></i></button><label><input data-mx-range="${key}" type="range" min="0" max="100" step="1" value="${state.levels[key]}"><small data-mx-val="${key}">${state.levels[key]}%</small></label></div>`).join('');
  document.body.insertAdjacentHTML('beforeend',`<button id="mixerDock" class="mixer-dock" type="button"><span>🎚️</span><b>Mix</b></button><div id="mixerShade" class="mixer-shade" aria-hidden="true"><section class="mixer-sheet" role="dialog" aria-modal="true"><div class="mixer-handle"></div><header><div><h2>🎚️ Mixer الصوت</h2><p>شغّل أكثر من مؤثر في نفس الوقت وتحكم في كل طبقة بصورة مستقلة.</p></div><button id="mixerClose" type="button" aria-label="إغلاق">✕</button></header><div class="mx-master"><label><span>صوت الكتاب <b id="mxNarratorVal">${state.narratorLevel}%</b></span><input id="mxNarrator" type="range" min="0" max="100" value="${state.narratorLevel}"></label><label><span>مستوى الأجواء <b id="mxMasterVal">${state.masterLevel}%</b></span><input id="mxMaster" type="range" min="0" max="100" value="${state.masterLevel}"></label></div><div class="mx-grid">${rows}</div><div class="mx-duck"><button id="mxDucking" type="button"><span><b>🎙️ Ducking احترافي</b><small>اخفض المؤثرات تلقائيًا أثناء كلام الراوي ثم أعدها بسلاسة.</small></span><i></i></button><label><span>الأجواء أثناء الكلام <b id="mxDuckVal">${state.duckLevel}%</b></span><input id="mxDuck" type="range" min="8" max="70" value="${state.duckLevel}"></label></div><div class="mx-foot"><button id="mxStopAll" type="button">إيقاف كل المؤثرات</button><button id="mxDone" class="primary" type="button">تم</button></div></section></div>`);
  const shade=$('#mixerShade');
  const oldAmbiencePlay=$('#ambientSound');if(oldAmbiencePlay&&!$('#openProfessionalMixer')){oldAmbiencePlay.insertAdjacentHTML('afterend','<button id="openProfessionalMixer" type="button" class="ambience-play" style="margin-top:8px"><i>🎚️</i><span>فتح Mixer متعدد الطبقات</span><small>مطر + أمواج + رياح + رعد… معًا</small></button>');$('#openProfessionalMixer').onclick=open;}
  $('#mixerDock').onclick=open;$('#mixerClose').onclick=close;$('#mxDone').onclick=close;shade.onclick=e=>{if(e.target===shade)close();};
  document.addEventListener('click',e=>{const b=e.target.closest('[data-mx-toggle]');if(b)setLayer(b.dataset.mxToggle,!state.enabled.has(b.dataset.mxToggle));});
  document.addEventListener('input',e=>{
    if(e.target.matches('[data-mx-range]'))setLayerLevel(e.target.dataset.mxRange,e.target.value);
    if(e.target.id==='mxMaster'){state.masterLevel=+e.target.value;applyMaster();persist();renderValues();}
    if(e.target.id==='mxNarrator'){state.narratorLevel=+e.target.value;applyNarratorVolume();persist();renderValues();}
    if(e.target.id==='mxDuck'){state.duckLevel=+e.target.value;applyMaster();persist();renderValues();}
  });
  $('#mxDucking').onclick=()=>{state.ducking=!state.ducking;applyMaster();persist();render();};
  $('#mxStopAll').onclick=()=>{for(const key of [...state.enabled]){state.enabled.delete(key);stopLayer(key);}persist();render();};

  const bookAudio=$('#audioElement');
  if(bookAudio){bookAudio.addEventListener('playing',()=>{applyNarratorVolume();setNarrationActive(true)});bookAudio.addEventListener('pause',()=>setNarrationActive(false));bookAudio.addEventListener('ended',()=>setNarrationActive(false));applyNarratorVolume();}
  document.addEventListener('mafateeh:narration',e=>setNarrationActive(!!e.detail?.active));
  window.MafateehMixer={open,close,setNarrationActive,getNarratorVolume:()=>state.narratorLevel/100,setNarratorVolume:v=>{state.narratorLevel=Math.round(Math.max(0,Math.min(1,+v))*100);applyNarratorVolume();persist();renderValues();},layers:LAYERS};

  // Restore previously enabled layers only after first user gesture (iOS audio rule).
  if(state.enabled.size){const wanted=[...state.enabled];state.enabled.clear();const restore=async()=>{document.removeEventListener('pointerdown',restore,true);for(const key of wanted)await setLayer(key,true).catch(()=>{});};document.addEventListener('pointerdown',restore,true);}
})();
