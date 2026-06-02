(function () {
  'use strict';
  const {
    N, BIN_MAX, TAU, MAX_LAYERS,
    clamp, clamp01, lerp, smoothstep,
    phaseLerp,
    blankFrame, cloneFrame, blendFrames,
    fft, fftInPlace,
    getAudioCtx,
  } = window.WT;

  let activePlayback = null;

  function applyLayer(frames, effect, strength, layerIndex, seed) {
    const EFFECTS = window.WT.EFFECTS || {};
    if (effect === 'random') {
      const keys = Object.keys(EFFECTS).filter(function (x) { return x !== 'random'; });
      if (keys.length) effect = keys[(Math.random() * keys.length) | 0];
    }
    const def = EFFECTS[effect];
    if (!def || (!def.applyFrame && !def.applyLayer)) return frames.map(cloneFrame);
    if (def.applyLayer) return def.applyLayer(frames, strength, layerIndex, seed);
    return frames.map(function (frame, i) {
      return def.applyFrame(frame, strength, i, frames.length, seed + i * 0.53);
    });
  }

  function createBaseKeyframe(pos, coreType) {
    const cores = window.WT.CORES || {};
    const core  = cores[coreType] || cores['metaai'];
    return core.fn(pos);
  }

  function makeKeyframes(depth, coreType) {
    const segs    = 8;
    const posList = [];
    for (let i = 0; i <= segs; i++) {
      let p = Math.round(i * depth / segs);
      if (p >= depth) p = depth - 1;
      if (!posList.includes(p)) posList.push(p);
    }
    return posList.map(function (pos) { return { pos: pos, frame: createBaseKeyframe(pos, coreType) }; });
  }

  function sealLoop(frames) {
    if (frames.length < 2) return frames;
    const n    = frames.length;
    const edge = Math.min(3, Math.floor(n / 2));
    const common = blendFrames(frames[0], frames[n - 1], 0.5);
    frames[0]     = cloneFrame(common);
    frames[n - 1] = cloneFrame(common);
    for (let i = 1; i < edge; i++) {
      const t = i / edge;
      frames[i]         = blendFrames(common, frames[i], t);
      frames[n - 1 - i] = blendFrames(common, frames[n - 1 - i], t);
    }
    return frames;
  }

  function framesToAudio(frames, sr) {
    //const depth  = frames.length;
    const depth  = 256;
    const total  = depth * N;
    const data   = new Float32Array(total);
    const re     = new Float64Array(N);
    const im     = new Float64Array(N);
    let maxAbs   = 0;
    const sumAmp = new Float64Array(BIN_MAX + 1);
    for (let z = 0; z < depth; z++) {
      const f = frames[z];
      re.fill(0); im.fill(0);
      for (let k = 1; k <= BIN_MAX; k++) {
        sumAmp[k] += f.amp[k];
        re[k] = f.amp[k] * Math.cos(f.phase[k]);
        im[k] = f.amp[k] * Math.sin(f.phase[k]);
      }
      fft(re, im, true);
      const off = z * N;
      for (let n = 0; n < N; n++) {
        const v = N * im[n];
        data[off + n] = v;
        const av = Math.abs(v);
        if (av > maxAbs) maxAbs = av;
      }
    }
    const scale = maxAbs > 0 ? 0.9 / maxAbs : 1;
    for (let i = 0; i < data.length; i++) data[i] *= scale;
    const avgAmp = new Float32Array(BIN_MAX + 1);
    for (let k = 1; k <= BIN_MAX; k++) avgAmp[k] = (sumAmp[k] / Math.max(1, depth)) * scale;
    return { data: data, avgAmp: avgAmp };
  }

  async function decodeAudioFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const tmpCtx      = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await tmpCtx.decodeAudioData(arrayBuffer.slice(0));
    const fileSR      = audioBuffer.sampleRate;
    tmpCtx.close();
    const len  = audioBuffer.length;
    const data = new Float32Array(len);
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const chData = audioBuffer.getChannelData(ch);
      const w = 1 / audioBuffer.numberOfChannels;
      for (let i = 0; i < len; i++) data[i] += chData[i] * w;
    }
    return { data: data, sr: fileSR, originalSamples: len };
  }

  function audioToFrames(data, depth) {
    const half      = N >> 1;
    const frames    = [];
    const usableLen = Math.max(data.length, N);
    for (let fi = 0; fi < depth; fi++) {
      const t     = depth <= 1 ? 0.5 : fi / (depth - 1);
      const start = Math.min(Math.floor((usableLen - N) * t), Math.max(0, data.length - N));
      const re    = new Float64Array(N);
      const im    = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        const win = 0.5 - 0.5 * Math.cos(TAU * i / N);
        re[(i + half) % N] = (data[start + i] || 0) * win * 2.0;
      }
      fftInPlace(re, im);
      let maxAmp = 1e-12;
      for (let k = 1; k <= BIN_MAX; k++) {
        const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
        if (m > maxAmp) maxAmp = m;
      }
      const f = blankFrame();
      for (let k = 1; k <= BIN_MAX; k++) {
        f.amp[k]   = clamp01(Math.sqrt(re[k] * re[k] + im[k] * im[k]) / maxAmp);
        f.phase[k] = Math.atan2(im[k], re[k]);
      }
      frames.push(f);
    }
    return frames;
  }

  function exportWav(data, sr) {
    const len    = data.length;
    const buffer = new ArrayBuffer(44 + len * 2);
    const view   = new DataView(buffer);
    const ws = function (o, s) { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); view.setUint32(4, 36 + len * 2, true);
    ws(8, 'WAVE'); ws(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);  view.setUint32(24, sr, true);
    view.setUint32(28, sr * 2, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); ws(36, 'data');
    view.setUint32(40, len * 2, true);
    let off = 44;
    for (let i = 0; i < len; i++) {
      let s = data[i];
      if (s > 1) s = 1; else if (s < -1) s = -1;
      view.setInt16(off, s < 0 ? s * 32768 : s * 32767, true);
      off += 2;
    }
    return new Blob([view], { type: 'audio/wav' });
  }

  function applySmoothToFrames(effFrames, depth, smooth) {
    if (smooth <= 0) return;
    for (let z = 1; z < depth - 1; z++) {
      for (let k = 1; k <= BIN_MAX; k++) {
        const prev = effFrames[z - 1], cur = effFrames[z], next = effFrames[z + 1];
        effFrames[z].amp[k] = lerp(cur.amp[k], lerp(prev.amp[k], next.amp[k], 0.5), smooth);
        const phx = (Math.cos(prev.phase[k]) + Math.cos(next.phase[k])) * 0.5;
        const phy = (Math.sin(prev.phase[k]) + Math.sin(next.phase[k])) * 0.5;
        effFrames[z].phase[k] = phaseLerp(cur.phase[k], Math.atan2(phy, phx), smooth);
      }
    }
  }

  async function generateWavetable(seconds, sr, layerDefs, baseEffect, coreType) {
    const EFFECTS       = window.WT.EFFECTS || {};
    const ALL_KEYS      = Object.keys(EFFECTS);
    const NON_RAND_KEYS = ALL_KEYS.filter(function (x) { return x !== 'random'; });
    const LABELS        = {};
    for (const k of ALL_KEYS) LABELS[k] = EFFECTS[k].label || k;
    function randEff() { return NON_RAND_KEYS[(Math.random() * NON_RAND_KEYS.length) | 0]; }

    //const depth     = Math.max(8, Math.round(seconds * sr / N));
    const depth  = 256;
    const keyframes = makeKeyframes(depth, coreType || 'metaai');
    const frames    = new Array(depth);
    let kfIdx       = 0;
    for (let z = 0; z < depth; z++) {
      while (kfIdx < keyframes.length - 2 && z > keyframes[kfIdx + 1].pos) kfIdx++;
      const k0   = keyframes[kfIdx];
      const k1   = keyframes[Math.min(kfIdx + 1, keyframes.length - 1)];
      const span = (k1.pos - k0.pos) || 1;
      const t    = clamp01((z - k0.pos) / span);
      frames[z]  = blendFrames(k0.frame, k1.frame, smoothstep(t));
    }

    const resolved = layerDefs.map(function (layer, idx) {
      const key = layer.key === 'random' ? randEff() : layer.key;
      return { key: key, label: (idx + 1) + ':' + (LABELS[key] || key), strength: layer.strength != null ? layer.strength : 1 };
    });

    const seedBase  = Math.random() * 10000 + 31.4159;
    const baseKey   = (!baseEffect || baseEffect === 'random') ? randEff() : baseEffect;
    const baseFrames = applyLayer(frames, baseKey, 1, -1, seedBase - 7.3);
    frames.splice(0, frames.length, ...baseFrames);

    for (let i = 0; i < resolved.length; i++) {
      const effFrames = applyLayer(frames, resolved[i].key, resolved[i].strength, i, seedBase + i * 13.7);
      const smooth    = layerDefs[i] ? (layerDefs[i].smooth || 0) : 0;
      applySmoothToFrames(effFrames, depth, smooth);
      frames.splice(0, frames.length, ...effFrames);
    }

    sealLoop(frames);
    const audio = framesToAudio(frames, sr);
    return { data: audio.data, depth: depth, sr: sr, avgAmp: audio.avgAmp, layers: resolved, baseKey: baseKey, coreType: coreType || 'metaai' };
  }

  async function generateFromAudioFile() {
    const EFFECTS       = window.WT.EFFECTS || {};
    const NON_RAND_KEYS = Object.keys(EFFECTS).filter(function (x) { return x !== 'random' && x !== 'clean'; });
    const LABELS        = {};
    for (const k of Object.keys(EFFECTS)) LABELS[k] = EFFECTS[k].label || k;

    const fileInput = document.getElementById('audioFileInput');
    if (!fileInput.files.length) { alert('音声ファイルを選択してください。'); return; }
    const btn  = document.getElementById('generateFromFile');
    const grid = document.getElementById('grid');
    if (activePlayback) stopPlayback(activePlayback);
    grid.innerHTML = '';
    btn.disabled   = true;
    btn.textContent = '処理中...';
    try {
      const count   = parseInt(document.getElementById('count').value) || 1;
      const sr      = parseInt(document.getElementById('sr').value) || 48000;
      const layers  = getSelectedLayers();
      const { data, originalSamples } = await decodeAudioFile(fileInput.files[0]);
      //const depth   = Math.max(8, Math.min(256, Math.round(originalSamples / N)));
      const depth  = 256;

      for (let ci = 0; ci < count; ci++) {
        const frames = audioToFrames(data, depth);
        const resolved = layers.map(function (layer, idx) {
          const key = layer.key === 'random'
            ? NON_RAND_KEYS[(Math.random() * NON_RAND_KEYS.length) | 0]
            : layer.key;
          return { key: key, label: (idx + 1) + ':' + (LABELS[key] || key), strength: layer.strength != null ? layer.strength : 1 };
        });
        const seedBase = Math.random() * 10000 + 31.4159;
        for (let i = 0; i < resolved.length; i++) {
          const effFrames = applyLayer(frames, resolved[i].key, resolved[i].strength, i, seedBase + i * 13.7);
          const smooth    = layers[i] ? (layers[i].smooth || 0) : 0;
          applySmoothToFrames(effFrames, depth, smooth);
          frames.splice(0, frames.length, ...effFrames);
        }
        const audio = framesToAudio(frames, sr);
        const wt    = { data: audio.data, depth: depth, sr: sr, avgAmp: audio.avgAmp, layers: resolved, baseKey: 'file', coreType: 'file' };
        const layerText = resolved.map(function (r) { return r.label; }).join(' -> ') || 'Clean';
        addCard(ci, wt, 'Core:file | ' + layerText);
        await new Promise(function (r) { setTimeout(r, 0); });
      }
    } catch (e) {
      console.error(e);
      alert('エラー: ' + e.message);
    } finally {
      btn.disabled    = false;
      btn.textContent = 'ファイルから生成';
    }
  }


    function drawPreview(canvas, data, depth) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#0b0b0f';
    ctx.fillRect(0, 0, w, h);
    const lines   = Math.min(depth, 180);
    const scaleX  = w / N * 0.65;  
    const scaleY  = h * 0.14;
    const baseY   = h * 0.78;
    const persp   = 0.20;          
    const xOffset = w * 0.08;      
    const gridPoints = [];
    for (let li = 0; li < lines; li++) {
      const depthRatio = (lines - 1 - li) / Math.max(1, lines - 1);
      const z          = Math.floor(depthRatio * (depth - 1));
      const yOff       = depthRatio * h * 0.55;
      const xShift     = depthRatio * w * persp;
      const offset     = z * N;
      const row = [];
      for (let i = 0; i < N; i += 2) {
        const s = data[offset + i];
        const x = (i - N / 2) * scaleX + w * 0.5 - xShift + xOffset;
        const y = baseY - yOff - s * scaleY * (1 - depthRatio * 0.3);
        row.push({ x: x, y: y });
      }
      gridPoints.push(row);
    }
    for (let li = 0; li < lines - 1; li++) {
      const depthRatio = (lines - 1 - li) / Math.max(1, lines - 1);
      const alpha = 0.08 + 0.4 * depthRatio; 
      ctx.fillStyle = 'rgba(168,85,247,' + alpha + ')';
      const rowCurrent = gridPoints[li];     
      const rowNext    = gridPoints[li + 1]; 
      ctx.beginPath();
      ctx.moveTo(rowCurrent[0].x, rowCurrent[0].y);
      for (let i = 1; i < rowCurrent.length; i++) {
        ctx.lineTo(rowCurrent[i].x, rowCurrent[i].y);
      }
      for (let i = rowNext.length - 1; i >= 0; i--) {
        ctx.lineTo(rowNext[i].x, rowNext[i].y);
      }
      ctx.closePath();
      ctx.fill();
    }
  }


  function drawSpectrum(canvas, avgAmp) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#050507';
    ctx.fillRect(0, 0, w, h);
    let max = 0;
    for (let k = 1; k <= BIN_MAX; k++) if (avgAmp[k] > max) max = avgAmp[k];
    if (max === 0) max = 1;
    ctx.fillStyle = '#a855f7';
    for (let k = 1; k <= BIN_MAX; k++) {
      const v  = avgAmp[k] / max;
      const bh = Math.max(1, v * h);
      ctx.fillRect(k - 1, h - bh, 1, bh);
    }
  }

  function stopPlayback(entry) {
    if (!entry) return;
    try { entry.source.stop(); } catch (_) {}
    if (entry.button) { entry.button.classList.remove('active'); entry.button.textContent = '再生'; }
    if (activePlayback === entry) activePlayback = null;
  }

  function addCard(index, wt, overrideLabel) {
    const card       = document.createElement('div');
    card.className   = 'card';
    const layerText  = wt.layers.map(function (x) { return x.label; }).join(' -> ');
    const titleLabel = overrideLabel || ('Core:' + wt.coreType + ' | Base:' + wt.baseKey + ' | ' + layerText);
    card.innerHTML = [
      '<h3>Vital1024 #' + (index + 1) + ' <span style="opacity:.6;font-size:11px">' + titleLabel + '</span></h3>',
      '<canvas class="preview" width="640" height="320"></canvas>',
      '<canvas class="spectrum" width="1024" height="64"></canvas>',
      '<div class="meta">' + wt.depth + ' frames x 2048 / ' + wt.sr + ' Hz<br>layers: ' + wt.layers.length + '</div>',
      '<div class="actions"><button class="play">再生</button><button class="dl">WAVダウンロード</button></div>',
    ].join('');
    document.getElementById('grid').appendChild(card);
    drawPreview(card.querySelector('.preview'), wt.data, wt.depth);
    drawSpectrum(card.querySelector('.spectrum'), wt.avgAmp);

    const playBtn = card.querySelector('.play');
    playBtn.onclick = async function () {
      const ctx = getAudioCtx();
      if (ctx.state === 'suspended') await ctx.resume();
      if (activePlayback && activePlayback.button !== playBtn) stopPlayback(activePlayback);
      if (activePlayback && activePlayback.button === playBtn) { stopPlayback(activePlayback); return; }
      const buf = ctx.createBuffer(1, wt.data.length, wt.sr);
      buf.copyToChannel(wt.data, 0);
      const source = ctx.createBufferSource();
      source.buffer = buf; source.loop = false; source.playbackRate.value = 1.0;
      source.connect(ctx.destination); source.start();
      activePlayback = { source: source, button: playBtn };
      playBtn.classList.add('active'); playBtn.textContent = '停止';
      source.onended = function () {
        if (activePlayback && activePlayback.source === source) activePlayback = null;
        playBtn.classList.remove('active'); playBtn.textContent = '再生';
      };
    };

    card.querySelector('.dl').onclick = function () {
      const blob = exportWav(wt.data, wt.sr);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'Vital1024_' + (index + 1) + '_' + wt.sr + 'hz.wav';
      a.click(); URL.revokeObjectURL(url);
    };
  }

  function createLayerRow(value, strength) {
    if (value    == null) value    = 'random';
    if (strength == null) strength = 1;
    const EFFECTS = window.WT.EFFECTS || {};
    const row     = document.createElement('div');
    row.className = 'layer-row';
    row.innerHTML = [
      '<span class="layer-tag"></span>',
      '<select></select>',
      '<button class="remove-layer" type="button">削除</button>',
      '<div class="layer-param-row">',
        '<span class="layer-param-label">MIX</span>',
        '<input class="strength layer-range" type="range" min="0" max="1" step="0.01" value="1">',
        '<span class="layer-param-readout mix-readout">100%</span>',
        '<span class="layer-param-label" style="margin-left:8px;">Smooth</span>',
        '<input class="smooth layer-range" type="range" min="0" max="1" step="0.01" value="0">',
        '<span class="layer-param-readout smooth-readout">0%</span>',
      '</div>',
    ].join('');
    const select = row.querySelector('select');
    for (const [key, def] of Object.entries(EFFECTS)) {
      const opt = document.createElement('option');
      opt.value = key; opt.textContent = def.label || key;
      select.appendChild(opt);
    }
    select.value = value;
    const strengthSlider = row.querySelector('.strength');
    strengthSlider.value = clamp(strength != null ? strength : 1, 0, 1);
    const mixReadout    = row.querySelector('.mix-readout');
    const smoothReadout = row.querySelector('.smooth-readout');
    mixReadout.textContent = Math.round((strength != null ? strength : 1) * 100) + '%';
    strengthSlider.addEventListener('input', function () {
      mixReadout.textContent = Math.round(parseFloat(strengthSlider.value) * 100) + '%';
    });
    row.querySelector('.smooth').addEventListener('input', function () {
      smoothReadout.textContent = Math.round(parseFloat(this.value) * 100) + '%';
    });
    row.querySelector('.remove-layer').onclick = function () {
      const list = document.getElementById('layerList');
      if (list.children.length <= 1) return;
      row.remove(); renumberLayers();
    };
    return row;
  }

  function renumberLayers() {
    const rows = document.querySelectorAll('#layerList .layer-row');
    rows.forEach(function (row, idx) {
      row.querySelector('.layer-tag').textContent = 'Layer ' + (idx + 1);
    });
  }

  function addLayer(value, strength) {
    if (value    == null) value    = 'random';
    if (strength == null) strength = 1;
    const list = document.getElementById('layerList');
    if (list.children.length >= MAX_LAYERS) return;
    list.appendChild(createLayerRow(value, strength));
    renumberLayers();
  }

  function getSelectedLayers() {
    const EFFECTS = window.WT.EFFECTS || {};
    return Array.from(document.querySelectorAll('#layerList .layer-row')).map(function (row, idx) {
      const key = row.querySelector('select').value;
      return {
        key:      key,
        strength: parseFloat(row.querySelector('.strength').value || '1'),
        smooth:   parseFloat(row.querySelector('.smooth').value   || '0'),
        label:    (idx + 1) + ':' + ((EFFECTS[key] && EFFECTS[key].label) || key),
      };
    });
  }

  function initUI() {
    const EFFECTS = window.WT.EFFECTS || {};
    const CORES   = window.WT.CORES   || {};

    // Core プルダウン
    const coreSelect = document.getElementById('coreType');
    coreSelect.innerHTML = '';
    for (const [key, def] of Object.entries(CORES)) {
      const opt = document.createElement('option');
      opt.value = key; opt.textContent = def.label;
      coreSelect.appendChild(opt);
    }
    if (CORES['metaai']) coreSelect.value = 'metaai';

    // Base Effect プルダウン
    const baseSelect = document.getElementById('baseEffect');
    baseSelect.innerHTML = '';
    for (const [key, def] of Object.entries(EFFECTS)) {
      const opt = document.createElement('option');
      opt.value = key; opt.textContent = def.label || key;
      baseSelect.appendChild(opt);
    }
    baseSelect.value = 'random';

    document.getElementById('addLayer').addEventListener('click', function () { addLayer('random', 1); });

    document.getElementById('generate').addEventListener('click', async function (e) {
      const btn     = e.currentTarget;
      const count   = Math.min(20, Math.max(1, parseInt(document.getElementById('count').value   || '10', 10)));
      const seconds = Math.min(10, Math.max(1, parseInt(document.getElementById('seconds').value || '5',  10)));
      const sr      = parseInt(document.getElementById('sr').value, 10);
      const layers  = getSelectedLayers();
      const grid    = document.getElementById('grid');
      if (activePlayback) stopPlayback(activePlayback);
      grid.innerHTML  = '';
      btn.disabled    = true;
      btn.textContent = '生成中...';
      try {
        for (let i = 0; i < count; i++) {
          const wt = await generateWavetable(seconds, sr, layers,
            document.getElementById('baseEffect').value,
            document.getElementById('coreType').value);
          addCard(i, wt);
          await new Promise(function (r) { setTimeout(r, 0); });
        }
      } finally {
        btn.disabled    = false;
        btn.textContent = '生成';
      }
    });

    document.getElementById('generateFromFile').addEventListener('click', generateFromAudioFile);

    addLayer('random', 0);
    addLayer('random', 0);
    addLayer('random', 0);
    addLayer('random', 0);
    addLayer('random', 0);
    addLayer('random', 0);
  }

  window.WT.initUI = initUI;
})();
