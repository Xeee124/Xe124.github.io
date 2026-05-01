// === WTSG_generate.js ===
  function getTextureParams() {
    return {
      ampNoise:   parseInt(els.ampNoise.value, 10) / 100,
      phaseScale: parseInt(els.phaseScale.value, 10) / 100,
    };
  }

  async function startArLoop() {
    const m = state.currentModel;
    if (!m) { setStatus('モデルが選択されていません。'); return; }
    const ref = referenceCount(m.reference) ? m.reference : null;
    if (!ref) { setStatus('リファレンスが必要です。リファレンス音を読み込んでください。'); return; }

    const harmonicsCount = m.settings.harmonicsCount || HARMONICS_DEFAULT;
    const waveSize = parseInt(els.genWaveSize.value, 10) || 2048;
    const tex = mergeTextureProfiles(ref, harmonicsCount);
    if (!tex) { setStatus('リファレンスに質感データがありません。読み込み直してください。'); return; }

    stopArLoop();

    const acCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    state.arLoop = { running: true, acCtx, nextStartTime: acCtx.currentTime + 0.05, segmentsQueued: 0 };

    els.arLoopBtn.disabled = true;
    els.arStopBtn.disabled = false;
    els.arStatus.textContent = '再生中 — スライダーをリアルタイムで変更できます';
    setStatus('自己回帰ループ再生中。「停止」で止めます。');

    let currentVec = initVectorFromTexture(tex, harmonicsCount, getTextureParams().ampNoise);

    // プレビューキャンバスに現在の波形を描画
    function drawPreview(vec) {
      const cv = els.arPreviewCanvas;
      if (!cv) return;
      const W = cv.offsetWidth || 300;
      const H = 80;
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#060e1a';
      ctx.fillRect(0, 0, W, H);

      // 波形を時間軸に展開（軽量版: 64本まで）
      const WAVE_PTS = 256;
      const harmonics = Math.min(vec.amps.length, 64);
      const wave = new Float32Array(WAVE_PTS);
      for (let h = 0; h < harmonics; h++) {
        const a = vec.amps[h] || 0;
        if (a < 1e-5) continue;
        const ph = vec.phases[h] || 0;
        for (let i = 0; i < WAVE_PTS; i++) {
          wave[i] += a * Math.sin(2 * Math.PI * (h + 1) * i / WAVE_PTS + ph);
        }
      }
      let mx = 0;
      for (let i = 0; i < WAVE_PTS; i++) { const v = Math.abs(wave[i]); if (v > mx) mx = v; }
      if (mx < 1e-6) mx = 1;

      // グリッド
      ctx.strokeStyle = 'rgba(40,80,120,0.4)';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke();

      // 波形
      ctx.beginPath();
      ctx.strokeStyle = '#ff8040';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < WAVE_PTS; i++) {
        const x = (i / (WAVE_PTS - 1)) * W;
        const y = H / 2 - (wave[i] / mx) * (H / 2 - 4);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 塗りつぶし
      ctx.beginPath();
      ctx.moveTo(0, H/2);
      for (let i = 0; i < WAVE_PTS; i++) {
        const x = (i / (WAVE_PTS - 1)) * W;
        const y = H / 2 - (wave[i] / mx) * (H / 2 - 4);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H/2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,100,40,0.08)';
      ctx.fill();
    }

    const CHUNK_FRAMES = 8;
    const chunkDuration = (waveSize * CHUNK_FRAMES) / SAMPLE_RATE;

    function scheduleChunk() {
      if (!state.arLoop.running) return;

      const { ampNoise, phaseScale } = getTextureParams();
      const buffer = acCtx.createBuffer(1, waveSize * CHUNK_FRAMES, SAMPLE_RATE);
      const ch = buffer.getChannelData(0);

      for (let seg = 0; seg < CHUNK_FRAMES; seg++) {
        if (seg > 0 || state.arLoop.segmentsQueued > 0) {
          currentVec = stepVectorAutoregressive(currentVec, tex, harmonicsCount, ampNoise, phaseScale);
        }
        const wave = synthWaveFromVector(currentVec, waveSize, harmonicsCount);
        ch.set(wave, seg * waveSize);
      }

      // プレビュー描画（チャンクごとに最後のフレームで更新）
      drawPreview(currentVec);

      const src = acCtx.createBufferSource();
      src.buffer = buffer;
      src.connect(acCtx.destination);
      src.start(state.arLoop.nextStartTime);
      state.arLoop.nextStartTime += chunkDuration;
      state.arLoop.segmentsQueued += CHUNK_FRAMES;

      const lookahead = 0.15;
      const timeUntilNext = state.arLoop.nextStartTime - acCtx.currentTime - lookahead;
      if (state.arLoop.running) {
        setTimeout(scheduleChunk, Math.max(0, timeUntilNext * 1000));
      }

      els.arStatus.textContent = `再生中 — フレーム: ${state.arLoop.segmentsQueued} / ampNoise:${ampNoise.toFixed(2)} phaseScale:×${phaseScale.toFixed(2)}`;
    }

    drawPreview(currentVec);
    scheduleChunk();
  }

  function stopArLoop() {
    if (state.arLoop.acCtx) {
      try { state.arLoop.acCtx.close(); } catch(_) {}
    }
    state.arLoop = { running: false, acCtx: null, nextStartTime: 0, segmentsQueued: 0 };
    if (els.arLoopBtn) els.arLoopBtn.disabled = false;
    if (els.arStopBtn) els.arStopBtn.disabled = true;
    if (els.arStatus) els.arStatus.textContent = '停止中 — リファレンスを読み込んでから開始してください';
  }

  async function generateFinalAudio() {
    if (!state.currentModel) return;
    syncModelFromUI();
    const m = state.currentModel;
    const harmonicsCount = m.settings.harmonicsCount || HARMONICS_DEFAULT;
    const waveSize = parseInt(els.genWaveSize.value, 10) || m.settings.waveSize || 2048;
    const durationSeconds = parseFloat(els.genDurationSeconds.value) || m.settings.durationSeconds || 5;
    const totalSamples = Math.floor((durationSeconds * SAMPLE_RATE) / waveSize) * waveSize;
    const segmentCount = Math.max(1, totalSamples / waveSize);
    const ref = referenceCount(m.reference) ? m.reference : null;

    let out;

    // 質感モードが有効で、かつリファレンスの質感データがある場合
    let useTexture = els.textureModeOn.checked && ref;
    if (useTexture) {
      const tex = mergeTextureProfiles(ref, harmonicsCount);
      if (tex) {
        const { ampNoise, phaseScale } = getTextureParams();
        out = synthAutoregressiveBuffer(tex, harmonicsCount, waveSize, segmentCount, ampNoise, phaseScale);
      } else {
        useTexture = false;
      }
    }

    if (!useTexture || !out) {
      // 従来モード
      const aName = els.genLabelA.value;
      const bName = els.genLabelB.value;
      const mix = parseInt(els.mixSlider.value, 10) / 100;
      const refMix = parseInt(els.refInfluence.value, 10) / 100;
      const useBoundary = !!els.useBoundaryAuto.checked;
      const boundaryThreshold = parseInt(els.boundaryThreshold.value, 10) / 100;
      const labelA = aName ? m.labels[aName] : null;
      const labelB = bName ? m.labels[bName] : null;
      const bw = m.settings.bandwidthValue || 0.35;
      out = new Float32Array(totalSamples);
      for (let seg = 0; seg < segmentCount; seg++) {
        const t = segmentCount <= 1 ? 0.5 : seg / (segmentCount - 1);
        const vecA = sampleLabelVector(labelA, harmonicsCount, bw, ref, refMix, t);
        const vecB = labelB ? sampleLabelVector(labelB, harmonicsCount, bw, ref, refMix, t) : vecA;
        let blended = {
          amps:   lerpArray(vecA.amps,   vecB.amps,   mix),
          phases: lerpArray(vecA.phases, vecB.phases, mix).map(wrapPhase),
        };
        if (useBoundary && m.boundary && m.boundary.samples && m.boundary.samples.length && Math.abs(mix - 0.5) <= boundaryThreshold) {
          const boundaryVec = sampleBoundaryVector(m.boundary, harmonicsCount, bw, ref, refMix, t);
          const boundaryAmount = 1 - Math.min(1, Math.abs(mix - 0.5) / Math.max(boundaryThreshold, 0.0001));
          blended = {
            amps:   lerpArray(blended.amps,   boundaryVec.amps,   boundaryAmount * 0.65),
            phases: lerpArray(blended.phases, boundaryVec.phases, boundaryAmount * 0.65).map(wrapPhase),
          };
        }
        const frame = synthWaveFromVector(blended, waveSize, harmonicsCount);
        out.set(frame, seg * waveSize);
      }
    }

    const wav = encodeWavFloat32(out, SAMPLE_RATE);
    const blob = new Blob([wav], { type: 'audio/wav' });
    if (state.generatedBlobUrl) URL.revokeObjectURL(state.generatedBlobUrl);
    state.generatedBlobUrl = URL.createObjectURL(blob);
    state.generatedArrayBuffer = wav;
    els.generatedAudio.src = state.generatedBlobUrl;
    els.downloadWavBtn.disabled = false;
    els.clearGeneratedBtn.disabled = false;
    const modeLabel = (els.textureModeOn.checked && ref) ? '質感モード' : '通常モード';
    els.genInfo.innerHTML = `${modeLabel} / 出力長: ${out.length} サンプル / ${(out.length / SAMPLE_RATE).toFixed(3)} 秒 / ${waveSize}ごとに生成`;
    els.genMeter.style.width = '100%';
    setStatus('WAVを生成しました。');
  }

  async function downloadCurrentWav() {
    if (!state.generatedArrayBuffer) return;
    downloadArrayBuffer(state.generatedArrayBuffer, `wavetable_${Date.now()}.wav`, 'audio/wav');
  }

  function downloadBufferAsWav(buffer, filename) {
    const wav = encodeWavFloat32(buffer, SAMPLE_RATE);
    downloadArrayBuffer(wav, filename, 'audio/wav');
  }

  function downloadArrayBuffer(buffer, filename, mime) {
    const blob = new Blob([buffer], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function exportModelJson() {
    if (!state.currentModel) { alert('モデルが選択されていません。'); return; }
    syncModelFromUI();
    await saveModel(state.currentModel);
    const json = JSON.stringify(state.currentModel, null, 2);
    const name = (state.currentModel.name || 'model').replace(/[\\/:*?"<>|]/g, '_');
    downloadString(json, `${name}.json`, 'application/json');
    setStatus('モデルJSONを書き出しました。');
  }

  function downloadString(text, filename, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function handleModelImport(ev) {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    const text = await file.text();
    let obj;
    try { obj = JSON.parse(text); } catch (e) { alert('JSONの読み込みに失敗しました。'); return; }
    const model = sanitizeImportedModel(obj, file.name.replace(/\.json$/i, ''));
    await saveModel(model);
    state.currentModel = clone(model);
    state.activeModelId = model.id;
    persistActiveId();
    state.referenceFileName = referenceCount(model.reference) ? referenceList(model.reference).map(r => r.fileName || r.name).filter(Boolean).join(', ') : state.referenceFileName;
    renderAll();
    setStatus(`モデル「${model.name}」を読み込みました。`);
  }

  function sanitizeImportedModel(obj, fallbackName) {
    const m = createDefaultModel(obj && obj.name ? obj.name : fallbackName || 'Imported Model');
    if (obj && typeof obj === 'object') {
      m.id = obj.id || uuid();
      m.createdAt = obj.createdAt || nowIso();
      m.updatedAt = nowIso();
      m.name = obj.name || m.name;
      m.settings = Object.assign({}, m.settings, obj.settings || {});
      m.labels = obj.labels || {};
      m.boundary = obj.boundary || { samples: [] };
      m.reference = referenceList(obj.reference);
    }
    return m;
  }

  async function addCurrentModelMaybe() {
    if (!state.currentModel) return;
    syncModelFromUI();
    await saveModel(state.currentModel);
    renderAll();
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/(["\\\[\]#.:,>+~*^$|=\-()])/g, '\\$1');
  }

  function syncCandidateLabels() {
    if (!state.currentModel) return;
    const m = state.currentModel;
    const opts = labelsOptionsHtml(m, false);
    els.genLabelA.innerHTML = opts;
    els.genLabelB.innerHTML = labelsOptionsHtml(m, true);
    els.trainLabelSelect.innerHTML = labelsOptionsHtml(m, true);
  }

  // keep model updated on every save-related action

