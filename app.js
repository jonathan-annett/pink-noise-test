(() => {
  const REF_DB = -20;                 // all buffers are rendered at this RMS
  const MUSIC_URL = 'music.mp3';      // place your track next to this file
  const MODE_NAMES = {pink:'Pink', white:'White', tone:'1 kHz', music:'Music'};

  const $ = id => document.getElementById(id);
  const db2g = d => Math.pow(10, d / 20);
  const g2db = g => 20 * Math.log10(Math.max(g, 1e-9));
  const fmt = d => (d < 0 ? '−' : d > 0 ? '+' : '') + Math.abs(Math.round(d));

  const state = { mode:'pink', level:REF_DB, ch:'both', invert:false, playing:false };
  let ctx, gL, gR, levelGain, anL, anR, current = null, wakeLock = null;
  const buffers = {}, crest = {};         // crest = peak dB above RMS for each buffer
  let music = { buf:null, norm:1, crest:0, name:'', loading:false };

  // ---------- Audio setup ----------
  function initAudio(){
    if (ctx) return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch(e){}
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint:'playback' });
    const split = ctx.createChannelSplitter(2);
    const merge = ctx.createChannelMerger(2);
    gL = ctx.createGain(); gR = ctx.createGain();
    levelGain = ctx.createGain(); levelGain.gain.value = 0;
    split.connect(gL, 0); split.connect(gR, 1);
    gL.connect(merge, 0, 0); gR.connect(merge, 0, 1);
    merge.connect(levelGain);
    levelGain.connect(ctx.destination);
    const mSplit = ctx.createChannelSplitter(2);
    levelGain.connect(mSplit);
    anL = ctx.createAnalyser(); anR = ctx.createAnalyser();
    anL.fftSize = anR.fftSize = 2048;
    mSplit.connect(anL, 0); mSplit.connect(anR, 1);
    ctx._in = split;
    applyChannels(true);
    requestAnimationFrame(meterLoop);
  }

  function finishBuffer(data){
    // normalise to REF RMS, measure crest, return stereo AudioBuffer (identical L/R)
    let s = 0, pk = 0;
    for (let i = 0; i < data.length; i++){ s += data[i]*data[i]; }
    const k = db2g(REF_DB) / Math.sqrt(s / data.length);
    for (let i = 0; i < data.length; i++){ data[i] *= k; const a = Math.abs(data[i]); if (a > pk) pk = a; }
    const b = ctx.createBuffer(2, data.length, ctx.sampleRate);
    b.copyToChannel(data, 0); b.copyToChannel(data, 1);
    return { buf:b, crest:g2db(pk) - REF_DB };
  }

  function makeNoise(type){
    const sr = ctx.sampleRate, n = sr * 12, m = Math.floor(sr * 0.25);
    const d = new Float32Array(n);
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for (let i = -sr; i < n; i++){              // 1 s warm-up for the filter
      const w = Math.random() * 2 - 1, v = w;
      let out = w;
      if (type === 'pink'){
        b0 = 0.99886*b0 + w*0.0555179; b1 = 0.99332*b1 + w*0.0750759;
        b2 = 0.96900*b2 + w*0.1538520; b3 = 0.86650*b3 + w*0.3104856;
        b4 = 0.55000*b4 + w*0.5329522; b5 = -0.7616*b5 - w*0.0168980;
        out = b0+b1+b2+b3+b4+b5+b6 + w*0.5362; b6 = w*0.115926;
      }
      if (i >= 0) d[i] = out;
    }
    // seamless loop: crossfade the tail into the head
    const out = new Float32Array(n - m);
    for (let i = 0; i < n - 2*m; i++) out[i] = d[i + m];
    for (let j = 0; j < m; j++){
      const t = j / m;
      out[n - 2*m + j] = d[n - m + j] * Math.cos(t*Math.PI/2) + d[j] * Math.sin(t*Math.PI/2);
    }
    return finishBuffer(out);
  }

  function makeTone(freq){
    const sr = ctx.sampleRate, n = sr;          // 1 s holds an exact number of cycles
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) d[i] = Math.sin(2*Math.PI*freq*i/sr);
    return finishBuffer(d);
  }

  function getBuffer(mode){
    if (mode === 'music') return music.buf;
    if (!buffers[mode]){
      const r = mode === 'tone' ? makeTone(1000) : makeNoise(mode);
      buffers[mode] = r.buf; crest[mode] = r.crest;
    }
    return buffers[mode];
  }

  async function decodeMusic(arrayBuf, name){
    initAudio();
    setStatus('Decoding ' + name + '…');
    const buf = await new Promise((res, rej) => {
      const p = ctx.decodeAudioData(arrayBuf, res, rej);
      if (p && p.then) p.then(res, rej);
    });
    let s = 0, pk = 0, count = 0;
    for (let c = 0; c < buf.numberOfChannels; c++){
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++){ s += d[i]*d[i]; const a = Math.abs(d[i]); if (a > pk) pk = a; }
      count += d.length;
    }
    const rms = Math.sqrt(s / count) || 1e-6;
    music = { buf, norm: db2g(REF_DB) / rms, crest: g2db(pk) - g2db(rms), name, loading:false };
    $('musicInfo').textContent = `${name} · ${Math.round(buf.duration)} s · loudness-matched`;
    updatePeak();
    setStatus(state.playing ? '' : 'Track ready. Tap to play.');
  }

  // Returns a promise that resolves once the default track is decoded (or fails).
  // Repeat calls share the same in-flight load.
  let musicLoad = null;
  function loadDefaultMusic(){
    if (music.buf) return Promise.resolve(true);
    if (musicLoad) return musicLoad;
    music.loading = true;
    $('musicInfo').textContent = 'Loading the test track…';
    setStatus('Loading music track…');
    musicLoad = (async () => {
      try {
        const r = await fetch(MUSIC_URL);
        if (!r.ok) throw 0;
        await decodeMusic(await r.arrayBuffer(), MUSIC_URL);
        return true;
      } catch(e){
        music.loading = false;
        $('musicInfo').textContent = 'No default track found. Choose a file from this device.';
        if (state.mode === 'music') setStatus('Choose a music file to play.');
        return false;
      } finally {
        musicLoad = null;
      }
    })();
    return musicLoad;
  }

  // Make sure the music buffer exists before starting it. Returns false if
  // it couldn't be loaded or the user moved to another mode meanwhile.
  async function ensureMusic(){
    if (music.buf) return true;
    const ok = await loadDefaultMusic();
    return ok && state.mode === 'music';
  }

  // ---------- Playback ----------
  function startSource(){
    const buf = getBuffer(state.mode);
    if (!buf) return null;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buf; src.loop = true;
    g.gain.value = state.mode === 'music' ? music.norm : 1;
    src.connect(g); g.connect(ctx._in);
    src.start();
    return { src, g };
  }

  function stopSource(s, when){
    if (!s) return;
    try { s.src.stop(when); } catch(e){}
    setTimeout(() => { try { s.g.disconnect(); } catch(e){} }, 300);
  }

  function rampLevel(target, time = 0.04){
    const t = ctx.currentTime;
    levelGain.gain.cancelScheduledValues(t);
    levelGain.gain.setValueAtTime(levelGain.gain.value, t);
    levelGain.gain.linearRampToValueAtTime(target, t + time);
  }

  async function play(){
    initAudio();
    if (ctx.state !== 'running') await ctx.resume();
    if (state.mode === 'music' && !music.buf){
      if (!(await ensureMusic())) return;
      if (state.playing) return;           // a second tap already started it
    }
    current = startSource();
    if (!current) return;
    state.playing = true;
    rampLevel(db2g(state.level - REF_DB), 0.05);
    requestWake();
    render();
  }

  function stop(){
    if (!ctx) return;
    rampLevel(0, 0.05);
    stopSource(current, ctx.currentTime + 0.06);
    current = null;
    state.playing = false;
    releaseWake();
    render();
  }

  async function switchSource(){
    if (!state.playing) return;
    const old = current, t = ctx.currentTime;
    rampLevel(0, 0.03);
    stopSource(old, t + 0.035);
    current = null;
    if (state.mode === 'music' && !music.buf){
      const ok = await ensureMusic();
      if (!state.playing) return;
      if (!ok){
        if (state.mode === 'music'){ state.playing = false; releaseWake(); render(); setStatus('Choose a music file to play.'); }
        return;
      }
    } else {
      await new Promise(r => setTimeout(r, 40));
    }
    if (!state.playing || current) return;
    current = startSource();
    rampLevel(db2g(state.level - REF_DB), 0.04);
    render();
  }

  function applyChannels(instant){
    if (!ctx) return;
    const l = state.ch === 'R' ? 0 : 1;
    const r = (state.ch === 'L' ? 0 : 1) * (state.invert ? -1 : 1);
    const t = ctx.currentTime, tc = instant ? 0.001 : 0.015;
    gL.gain.setTargetAtTime(l, t, tc);
    gR.gain.setTargetAtTime(r, t, tc);
  }

  function setLevel(v){
    state.level = Math.max(-60, Math.min(0, Math.round(v)));
    if (ctx && state.playing) rampLevel(db2g(state.level - REF_DB), 0.03);
    render();
  }

  // ---------- Wake lock ----------
  async function requestWake(){
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch(e){}
  }
  function releaseWake(){ try { wakeLock && wakeLock.release(); } catch(e){} wakeLock = null; }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.playing) requestWake();
  });

  // ---------- Meters ----------
  const tmp = new Float32Array(2048);
  const hold = { L:{pk:-90,t:0}, R:{pk:-90,t:0} };
  const pos = d => Math.max(0, Math.min(100, (d + 60) / 60 * 100));
  function readMeter(an, key){
    an.getFloatTimeDomainData(tmp);
    let s = 0, pk = 0;
    for (let i = 0; i < tmp.length; i++){ s += tmp[i]*tmp[i]; const a = Math.abs(tmp[i]); if (a > pk) pk = a; }
    const rms = g2db(Math.sqrt(s / tmp.length)), p = g2db(pk), h = hold[key], now = performance.now();
    if (p > h.pk || now - h.t > 1200){ h.pk = p; h.t = now; }
    $('f'+key).style.width = pos(rms) + '%';
    $('f'+key).style.setProperty('--w', (100 / Math.max(pos(rms), 1) * 100) + '%');
    $('p'+key).style.left = `calc(${pos(h.pk)}% - 1px)`;
    $('v'+key).textContent = rms < -80 ? '—' : rms.toFixed(1);
    $('v'+key).style.color = h.pk > -0.1 ? 'var(--bad)' : '';
  }
  function meterLoop(){
    readMeter(anL, 'L'); readMeter(anR, 'R');
    requestAnimationFrame(meterLoop);
  }

  // ---------- UI ----------
  function setStatus(t){ $('status').textContent = t; }

  function updatePeak(){
    const c = state.mode === 'music' ? (music.buf ? music.crest : null)
            : (crest[state.mode] ?? ({pink:12, white:12.5, tone:3.01})[state.mode]);
    const el = $('peak');
    if (c == null){ el.textContent = 'Peaks depend on the track.'; el.className = 'peak'; return; }
    const p = state.level + c;
    el.textContent = p > -0.1
      ? `Peaks ≈ ${fmt(p)} dBFS — will clip. Lower the level for a clean signal.`
      : `Peaks ≈ ${fmt(p)} dBFS`;
    el.className = 'peak' + (p > -0.1 ? ' clip' : '');
  }

  function render(){
    document.querySelectorAll('#modes button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === state.mode));
    document.querySelectorAll('#chans button').forEach(b => b.setAttribute('aria-pressed', b.dataset.ch === state.ch));
    document.querySelectorAll('#presets button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.l === state.level));
    $('levelVal').textContent = fmt(state.level);
    $('level').value = state.level;
    $('musicCard').classList.toggle('show', state.mode === 'music');
    $('playLabel').textContent = `${MODE_NAMES[state.mode]} · ${fmt(state.level)}`;
    $('play').classList.toggle('on', state.playing);
    $('play').setAttribute('aria-label', state.playing ? 'Stop' : 'Play');
    $('playIcon').innerHTML = state.playing
      ? '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor"/>'
      : '<path fill="currentColor" d="M8 5.5v13l11-6.5z"/>';
    if (state.playing){
      const ch = state.ch === 'both' ? 'both channels' : (state.ch === 'L' ? 'left only' : 'right only');
      setStatus(`Playing on ${ch}${state.invert && state.ch !== 'L' ? ', right inverted' : ''}.`);
    } else if (!$('status').textContent || $('status').textContent.startsWith('Playing')){
      setStatus('Stopped.');
    }
    updatePeak();
  }

  $('play').addEventListener('click', () => state.playing ? stop() : play());

  $('modes').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.dataset.mode === state.mode) return;
    state.mode = b.dataset.mode;
    if (state.mode === 'music') loadDefaultMusic();
    else if (ctx) getBuffer(state.mode);
    switchSource();
    render();
  });

  $('chans').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.ch = b.dataset.ch; applyChannels(); render();
  });

  $('invert').addEventListener('change', e => { state.invert = e.target.checked; applyChannels(); render(); });
  $('level').addEventListener('input', e => setLevel(+e.target.value));
  $('presets').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setLevel(+b.dataset.l); });
  $('up').addEventListener('click', () => setLevel(state.level + 1));
  $('down').addEventListener('click', () => setLevel(state.level - 1));

  $('musicFile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      await decodeMusic(await f.arrayBuffer(), f.name);
      if (state.playing && state.mode === 'music') switchSource();
    } catch(err){
      $('musicInfo').textContent = 'Could not decode that file. Try an MP3 or WAV.';
    }
  });

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
    if (e.code === 'Space'){ e.preventDefault(); state.playing ? stop() : play(); }
    if (e.key === 'ArrowUp'){ e.preventDefault(); setLevel(state.level + 1); }
    if (e.key === 'ArrowDown'){ e.preventDefault(); setLevel(state.level - 1); }
  });

  render();
  setStatus('Tap to start. Turn your device volume down first.');

  // ---------- PWA ----------
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if ('serviceWorker' in navigator && location.protocol !== 'file:'){
    navigator.serviceWorker.register('/sw.js').then(async () => {
      // Installed app: cache the music track too so every mode works offline
      if (standalone){
        const reg = await navigator.serviceWorker.ready;
        reg.active && reg.active.postMessage('cache-music');
      }
    }).catch(() => {});
  }

  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); installEvt = e;
    $('install').classList.add('show');
  });
  $('install').addEventListener('click', async () => {
    if (installEvt){
      installEvt.prompt();
      await installEvt.userChoice.catch(() => {});
      installEvt = null;
      $('install').classList.remove('show');
    } else {
      $('iosHint').classList.toggle('show');
    }
  });
  window.addEventListener('appinstalled', () => $('install').classList.remove('show'));
  // iOS Safari has no install prompt — offer instructions instead
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS && !standalone) $('install').classList.add('show');
})();
