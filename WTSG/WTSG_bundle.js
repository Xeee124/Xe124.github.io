(() => {
'use strict';
// === WTSG_utils.js ===
  function byId(id) { return document.getElementById(id); }

  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function nowIso() { return new Date().toISOString(); }

  function referenceList(reference) {
    if (!reference) return [];
    if (Array.isArray(reference)) return reference.filter(item => item && typeof item === 'object');
    if (Array.isArray(reference.items)) return reference.items.filter(item => item && typeof item === 'object');
    return [reference];
  }

  function referenceCount(reference) {
    return referenceList(reference).length;
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function rand() { return Math.random(); }

  function randn() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function normalizeVector(vec) {
    let maxAmp = 1e-6;
    for (let i = 0; i < vec.amps.length; i++) {
      const a = Math.abs(vec.amps[i]);
      if (a > maxAmp) maxAmp = a;
    }
    for (let i = 0; i < vec.amps.length; i++) vec.amps[i] = clamp(vec.amps[i] / maxAmp, 0, 1);
    for (let i = 0; i < vec.phases.length; i++) vec.phases[i] = wrapPhase(vec.phases[i]);
    return vec;
  }

  function wrapPhase(x) {
    return x - Math.PI * 2 * Math.floor((x + Math.PI) / (Math.PI * 2));
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function lerpArray(a, b, t) {
    const out = new Array(Math.min(a.length, b.length));
    for (let i = 0; i < out.length; i++) out[i] = lerp(a[i], b[i], t);
    return out;
  }

// === WTSG_vector.js ===

  // ----------------------------------------------------------------
  // averageVectors — 位相はcircular mean（複素数平均）で正確に計算
  // ----------------------------------------------------------------
  function averageVectors(vectors) {
    if (!vectors || !vectors.length) return null;
    const len = vectors[0].amps.length;
    const amps   = new Float64Array(len);
    const sinSum = new Float64Array(len); // 位相のsin成分の和
    const cosSum = new Float64Array(len); // 位相のcos成分の和
    for (const v of vectors) {
      for (let i = 0; i < len; i++) {
        amps[i]   += v.amps[i]   || 0;
        sinSum[i] += Math.sin(v.phases[i] || 0);
        cosSum[i] += Math.cos(v.phases[i] || 0);
      }
    }
    const n = vectors.length;
    const phArr = new Array(len);
    const ampArr = new Array(len);
    for (let i = 0; i < len; i++) {
      ampArr[i] = amps[i] / n;
      phArr[i]  = wrapPhase(Math.atan2(sinSum[i], cosSum[i]));
    }
    return normalizeVector({ amps: ampArr, phases: phArr });
  }

  function vectorDiff(a, b) {
    if (!a || !b) return null;
    const len = Math.min(a.amps.length, b.amps.length);
    const amps   = new Array(len);
    const phases = new Array(len);
    for (let i = 0; i < len; i++) {
      amps[i]   = (a.amps[i]   || 0) - (b.amps[i]   || 0);
      phases[i] = wrapPhase((a.phases[i] || 0) - (b.phases[i] || 0));
    }
    return { amps, phases };
  }

  function applyDiff(base, diff, amount) {
    if (!base || !diff) return base;
    const len = Math.min(base.amps.length, diff.amps.length);
    const amps   = new Array(len);
    const phases = new Array(len);
    for (let i = 0; i < len; i++) {
      amps[i]   = clamp((base.amps[i]   || 0) + (diff.amps[i]   || 0) * amount, 0, 1);
      phases[i] = wrapPhase((base.phases[i] || 0) + (diff.phases[i] || 0) * amount);
    }
    return { amps, phases };
  }

  // ----------------------------------------------------------------
  // lerpPhase — 位相補間もcircular（最短経路で補間）
  // ----------------------------------------------------------------
  function lerpPhase(a, b, t) {
    let d = wrapPhase(b - a);
    return wrapPhase(a + d * t);
  }

  function lerpPhasesArray(a, b, t) {
    const len = Math.min(a.length, b.length);
    const out = new Array(len);
    for (let i = 0; i < len; i++) out[i] = lerpPhase(a[i] || 0, b[i] || 0, t);
    return out;
  }

  // ----------------------------------------------------------------
  // sampleLabelVector — 振幅はampStdベース、位相はphaseVelStdベース
  // ----------------------------------------------------------------
  function sampleLabelVector(label, harmonicsCount, bandwidth, referenceProfile, refMix, timeBias) {
    const samples = label && label.samples ? label.samples : [];
    const modelId = state.currentModel ? state.currentModel.id : null;
    const referenceFrames = referenceFramePoolCached(referenceProfile, harmonicsCount, modelId);
    let base;

    if (samples.length) {
      const src = samples[Math.floor(rand() * samples.length)];
      base = {
        amps:   src.vector.amps.slice(0, harmonicsCount),
        phases: src.vector.phases.slice(0, harmonicsCount),
      };
      if (src.delta && rand() < 0.55) {
        base = applyDiff(base, src.delta, clamp(0.35 + bandwidth * 0.8, 0, 1));
      }
    } else if (referenceFrames.length) {
      const frame = referenceFrames[Math.floor(rand() * referenceFrames.length)];
      base = { amps: frame.amps.slice(0, harmonicsCount), phases: frame.phases.slice(0, harmonicsCount) };
    } else {
      base = randomVector(harmonicsCount);
    }

    // textureリスト（複数リファレンスの統合）
    const texList = referenceProfile
      ? referenceList(referenceProfile).map(r => r.texture).filter(Boolean)
      : [];
    const hasTex = texList.length > 0;
    const uniformSigma = 0.10 + bandwidth * 0.45;

    const amps   = new Array(harmonicsCount);
    const phases = new Array(harmonicsCount);
    for (let h = 0; h < harmonicsCount; h++) {
      const baseAmp = base.amps[h]   || 0;
      const basePh  = base.phases[h] || 0;

      if (hasTex) {
        // 振幅: textureのampStdを自然な幅として使用
        let ampStdSum = 0, phVelStdSum = 0;
        for (const tex of texList) {
          ampStdSum   += tex.ampStd[h]      || 0;
          phVelStdSum += tex.phaseVelStd[h] || 0;
        }
        const naturalAmpStd   = ampStdSum   / texList.length;
        const naturalPhVelStd = phVelStdSum / texList.length;
        amps[h]   = clamp(baseAmp + randn() * naturalAmpStd * (0.5 + bandwidth * 1.5), 0, 1);
        // 位相: phaseVelStd（実際の変動幅）でぼかす
        phases[h] = wrapPhase(basePh + randn() * naturalPhVelStd * (0.5 + bandwidth));
      } else {
        const sigma = uniformSigma * (0.35 + h / Math.max(1, harmonicsCount - 1));
        amps[h]   = clamp(baseAmp + randn() * sigma, 0, 1);
        phases[h] = wrapPhase(basePh + randn() * uniformSigma * 0.65);
      }
    }

    let out = { amps, phases };
    if (referenceFrames.length && refMix > 0) {
      const refVec = pickReferenceFrame(referenceProfile, timeBias, harmonicsCount);
      out = {
        amps:   lerpArray(out.amps, refVec.amps, refMix),
        phases: lerpPhasesArray(out.phases, refVec.phases, refMix),
      };
    }
    return normalizeVector(out);
  }

  function sampleBoundaryVector(boundary, harmonicsCount, bandwidth, referenceProfile, refMix, timeBias) {
    const samples = boundary && boundary.samples ? boundary.samples : [];
    if (!samples.length) return randomVector(harmonicsCount);
    const src = samples[Math.floor(rand() * samples.length)];
    let base = { amps: src.vector.amps.slice(0, harmonicsCount), phases: src.vector.phases.slice(0, harmonicsCount) };
    if (src.boundary && src.boundary.leftLabel && src.boundary.rightLabel) {
      const jitter = clamp(0.18 + bandwidth * 0.25, 0.05, 0.6);
      base = {
        amps:   base.amps.map(v => clamp(v + randn() * jitter * 0.15, 0, 1)),
        phases: base.phases.map(v => wrapPhase(v + randn() * jitter * 0.35)),
      };
    }
    const refMix2 = refMix * 0.35;
    const modelId = state.currentModel ? state.currentModel.id : null;
    if (refMix2 > 0 && referenceFramePoolCached(referenceProfile, harmonicsCount, modelId).length) {
      const refVec = pickReferenceFrame(referenceProfile, timeBias, harmonicsCount);
      base = {
        amps:   lerpArray(base.amps, refVec.amps, refMix2),
        phases: lerpPhasesArray(base.phases, refVec.phases, refMix2),
      };
    }
    return normalizeVector(base);
  }

  function pickReferenceFrame(referenceProfile, timeBias, harmonicsCount) {
    const modelId = state.currentModel ? state.currentModel.id : null;
    const pool = referenceFramePoolCached(referenceProfile, harmonicsCount, modelId);
    if (!pool.length) return randomVector(harmonicsCount);
    const idx = clamp(Math.floor(timeBias * pool.length), 0, pool.length - 1);
    const frame = pool[idx];
    return {
      amps:   (frame.amps   || []).slice(0, harmonicsCount),
      phases: (frame.phases || []).slice(0, harmonicsCount),
    };
  }

  function randomVector(harmonicsCount) {
    const amps   = new Array(harmonicsCount);
    const phases = new Array(harmonicsCount);
    for (let i = 0; i < harmonicsCount; i++) {
      amps[i]   = Math.pow(rand(), 1.6) * (1 - i / (harmonicsCount * 1.15));
      phases[i] = wrapPhase((rand() * 2 - 1) * Math.PI);
    }
    return normalizeVector({ amps, phases });
  }
// === WTSG_db.js ===
  function createDefaultModel(name) {
    return {
      id: uuid(),
      name: name || 'Untitled Model',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      settings: {
        sampleRate: SAMPLE_RATE,
        waveSize: 2048,
        durationSeconds: 5,
        candidateCount: 10,
        harmonicsCount: HARMONICS_DEFAULT,
        bandwidthMode: 'fixed',
        bandwidthValue: 0.35,
        bandwidthRange: [0.20, 0.50],
      },
      labels: {},
      boundary: { samples: [] },
      reference: [],
      meta: { notes: 'single-file browser model' },
    };
  }

  function createEmptyLabel(name) {
    return {
      name,
      samples: [],
      stats: { count: 0 },
      lastVector: null,
    };
  }

  async function openDb() {
    db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbGetAllModels() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      let result = [];
      req.onsuccess = () => { result = req.result || []; };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function saveModel(model) {
    model.updatedAt = nowIso();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(clone(model));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    await loadModels();
    if (state.currentModel && state.currentModel.id === model.id) state.currentModel = clone(model);
    syncCandidateLabels();
  }

  async function deleteModel(id) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    await loadModels();
  }

  async function loadModels() {
    state.models = await dbGetAllModels();
    const savedId = localStorage.getItem(ACTIVE_KEY);
    state.activeModelId = savedId && state.models.some(m => m.id === savedId) ? savedId : (state.models[0] ? state.models[0].id : null);
    state.currentModel = state.models.find(m => m.id === state.activeModelId) || null;
    persistActiveId();
  }

  function persistActiveId() {
    if (state.activeModelId) localStorage.setItem(ACTIVE_KEY, state.activeModelId);
  }

  function loadUiState() {
    try {
      const raw = localStorage.getItem(UI_KEY);
      if (raw) state.ui = Object.assign(state.ui, JSON.parse(raw));
    } catch (_) {}
  }

  function saveUiState() {
    localStorage.setItem(UI_KEY, JSON.stringify(state.ui));
  }

  function wireEvents() {
    els.newModelBtn.addEventListener('click', async () => {
// === WTSG_ui.js ===
      const name = els.newModelName.value.trim() || `Model ${state.models.length + 1}`;
      const model = createDefaultModel(name);
      await saveModel(model);
      state.activeModelId = model.id;
      state.currentModel = model;
      persistActiveId();
      renderAll();
      setStatus(`新規モデル「${name}」を作成しました。`);
    });

    els.saveModelBtn.addEventListener('click', async () => {
      if (!state.currentModel) return;
      syncModelFromUI();
      await saveModel(state.currentModel);
      renderAll();
      setStatus('モデルを保存しました。');
    });

    els.modelSelect.addEventListener('change', async () => {
      await selectActiveModel(els.modelSelect.value);
      renderAll();
    });

    document.querySelectorAll('.tabbar button').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        state.ui.activeTab = tab;
        saveUiState();
        document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
        byId('tab-' + tab).classList.remove('hidden');
      });
    });

    els.genCandidatesBtn.addEventListener('click', generateCandidates);
    els.importReferenceBtn.addEventListener('click', () => els.importReferenceInput.click());
    els.importReferenceBtn2.addEventListener('click', () => els.importReferenceInput2.click());
    els.importReferenceInput.addEventListener('change', handleReferenceImport);
    els.importReferenceInput2.addEventListener('change', handleReferenceImport);
    els.importModelBtn.addEventListener('click', () => els.importModelInput.click());
    els.importModelBtn2.addEventListener('click', () => els.importModelInput2.click());
    els.importModelInput.addEventListener('change', handleModelImport);
    els.importModelInput2.addEventListener('change', handleModelImport);
    els.exportModelBtn.addEventListener('click', exportModelJson);
    els.exportModelBtn2.addEventListener('click', exportModelJson);
    els.saveReferenceBtn.addEventListener('click', saveReferenceEditor);
    els.clearReferenceBtn.addEventListener('click', async () => {
      if (!state.currentModel) return;
      state.currentModel.reference = [];
      await saveModel(state.currentModel);
      renderAll();
      setStatus('リファレンスを解除しました。');
    });
    els.duplicateModelBtn.addEventListener('click', async () => {
      if (!state.currentModel) return;
      const copy = clone(state.currentModel);
      copy.id = uuid();
      copy.name = `${copy.name} copy`;
      copy.createdAt = nowIso();
      copy.updatedAt = nowIso();
      await saveModel(copy);
      state.activeModelId = copy.id;
      state.currentModel = copy;
      persistActiveId();
      renderAll();
      setStatus('モデルを複製しました。');
    });

    [els.bandwidthMode, els.bandwidthValue, els.bandwidthMin, els.bandwidthMax, els.waveSize, els.durationSeconds, els.harmonicsCount].forEach(el => {
      el.addEventListener('input', () => syncModelFromUI());
    });
    [els.candidateCount, els.genWaveSize, els.genDurationSeconds, els.genHarmonicsCount].forEach(el => {
      el.addEventListener('input', () => syncModelFromUI());
    });
    els.mixSlider.addEventListener('input', updateMixReadout);
    els.refInfluence.addEventListener('input', updateRefReadout);
    els.useBoundaryAuto.addEventListener('change', () => saveUiState());
    els.boundaryThreshold.addEventListener('input', () => { updateBoundaryReadout(); saveUiState(); });
    els.generateAudioBtn.addEventListener('click', generateFinalAudio);
    els.downloadWavBtn.addEventListener('click', downloadCurrentWav);

    // 質感モード UIの読み取り更新
    const updateTextureReadouts = () => {
      els.ampNoiseReadout.textContent   = (parseInt(els.ampNoise.value, 10) / 100).toFixed(2);
      els.phaseScaleReadout.textContent = '×' + (parseInt(els.phaseScale.value, 10) / 100).toFixed(2);
    };
    els.ampNoise.addEventListener('input', updateTextureReadouts);
    els.phaseScale.addEventListener('input', updateTextureReadouts);
    updateTextureReadouts();

    // 自己回帰ループ
    els.arLoopBtn.addEventListener('click', startArLoop);
    els.arStopBtn.addEventListener('click', stopArLoop);
    els.clearGeneratedBtn.addEventListener('click', () => {
      if (state.generatedBlobUrl) URL.revokeObjectURL(state.generatedBlobUrl);
      state.generatedBlobUrl = '';
      state.generatedArrayBuffer = null;
      els.generatedAudio.removeAttribute('src');
      els.generatedAudio.load();
      els.downloadWavBtn.disabled = true;
      els.clearGeneratedBtn.disabled = true;
      els.genInfo.textContent = 'まだ生成していません。';
      els.genMeter.style.width = '0%';
    });
    wireCandNav();

    // 画面リサイズ時にslide幅をpxで再計算
    window.addEventListener('resize', () => {
      const wrap = document.getElementById('candidateScrollWrap');
      const track = document.getElementById('candidateList');
      if (!wrap || !track || !state.candidateBatch.length) return;
      const slideW = wrap.offsetWidth;
      track.querySelectorAll('.cand-slide').forEach(slide => {
        slide.style.width    = slideW + 'px';
        slide.style.minWidth = slideW + 'px';
      });
      track.classList.remove('animating');
      track.style.transform = `translateX(-${candCurrentIdx * slideW}px)`;
    });
  }

  async function selectActiveModel(id) {
    if (!id) return;
    const model = state.models.find(m => m.id === id);
    if (!model) return;
    state.activeModelId = id;
    state.currentModel = clone(model);
    invalidateRefPoolCache();
    persistActiveId();
    syncUIFromModel();
  }

  function syncUIFromModel() {
    const m = state.currentModel;
    if (!m) return;
    const s = m.settings || {};
    els.modelSelect.value = m.id;
    els.bandwidthMode.value = s.bandwidthMode || 'fixed';
    els.bandwidthValue.value = s.bandwidthValue ?? 0.35;
    els.bandwidthMin.value = (s.bandwidthRange && s.bandwidthRange[0]) ?? 0.2;
    els.bandwidthMax.value = (s.bandwidthRange && s.bandwidthRange[1]) ?? 0.5;
    els.waveSize.value = String(s.waveSize || 2048);
    els.durationSeconds.value = s.durationSeconds || 5;
    els.candidateCount.value = s.candidateCount || 10;
    els.harmonicsCount.value = String(s.harmonicsCount || HARMONICS_DEFAULT);
    els.genWaveSize.value = String(s.waveSize || 2048);
    els.genDurationSeconds.value = s.durationSeconds || 5;
    els.genHarmonicsCount.value = String(s.harmonicsCount || HARMONICS_DEFAULT);
    els.genLabelA.innerHTML = labelsOptionsHtml(m, false);
    els.genLabelB.innerHTML = labelsOptionsHtml(m, true);
    els.trainLabelSelect.innerHTML = labelsOptionsHtml(m, true);
    if (!els.trainLabelSelect.value && Object.keys(m.labels).length) els.trainLabelSelect.value = Object.keys(m.labels)[0];
    if (!els.genLabelA.value && Object.keys(m.labels).length) els.genLabelA.value = Object.keys(m.labels)[0];
    if (!els.genLabelB.value) els.genLabelB.value = '';
    els.useBoundaryAuto.checked = !!state.ui.useBoundaryAuto;
    els.boundaryThreshold.value = String(state.ui.boundaryThreshold ?? 12);
    updateMixReadout();
    updateRefReadout();
    updateBoundaryReadout();
  }

  function syncModelFromUI() {
    if (!state.currentModel) return;
    const m = state.currentModel;
    m.settings.bandwidthMode = els.bandwidthMode.value;
    m.settings.bandwidthValue = clamp(parseFloat(els.bandwidthValue.value || '0.35'), 0.01, 1);
    m.settings.bandwidthRange = [
      clamp(parseFloat(els.bandwidthMin.value || '0.2'), 0.01, 2),
      clamp(parseFloat(els.bandwidthMax.value || '0.5'), 0.01, 2)
    ].sort((a,b) => a - b);
    m.settings.waveSize = parseInt(els.waveSize.value, 10) || 2048;
    m.settings.durationSeconds = parseFloat(els.durationSeconds.value) || 5;
    m.settings.candidateCount = Math.max(1, parseInt(els.candidateCount.value, 10) || 10);
    m.settings.harmonicsCount = Math.max(8, parseInt(els.harmonicsCount.value, 10) || HARMONICS_DEFAULT);
    const g = m.settings;
    els.genWaveSize.value = String(g.waveSize);
    els.genDurationSeconds.value = String(g.durationSeconds);
    els.genHarmonicsCount.value = String(g.harmonicsCount);
  }

  function labelsOptionsHtml(model, allowNone) {
    const names = Object.keys(model.labels || {}).sort((a,b)=>a.localeCompare(b, 'ja'));
    let html = allowNone ? '<option value="">（未選択）</option>' : '';
    for (const name of names) html += `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
    html += `<option value="__new__">＋山を追加する</option>`;
    return html;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function renderAll() {
    renderModelSelect();
    syncUIFromModel();
    renderStatus();
    renderLabels();
    renderReferenceSummary();
    renderDbList();
    els.useBoundaryAuto.checked = !!state.ui.useBoundaryAuto;
    els.boundaryThreshold.value = String(state.ui.boundaryThreshold ?? 12);
    updateMixReadout();
    updateRefReadout();
    updateBoundaryReadout();
    // アクティブなタブを復元（ページを開き直した時にタイムアウトしないよう、候補は再生成しない）
    if (state.ui.activeTab && state.ui.activeTab !== 'train') {
      document.querySelectorAll('.tabbar button').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === state.ui.activeTab));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      const tabEl = byId('tab-' + state.ui.activeTab);
      if (tabEl) tabEl.classList.remove('hidden');
    } else {
      // trainタブの場合のみ候補の表示を維持（renderCandidatesは候補生成時のみ呼ぶ）
      document.querySelectorAll('.tabbar button').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === (state.ui.activeTab || 'train')));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      const tabEl = byId('tab-train');
      if (tabEl) tabEl.classList.remove('hidden');
    }
  }

  function renderModelSelect() {
    els.modelSelect.innerHTML = state.models.map(m =>
      `<option value="${escapeAttr(m.id)}">${escapeHtml(m.name)}</option>`
    ).join('');
    if (state.activeModelId) els.modelSelect.value = state.activeModelId;
  }

    function renderStatus() {
    const m = state.currentModel;
    if (!m) {
      els.statusBox.textContent = 'モデルがありません。';
      els.modelSummary.textContent = '未作成です。';
      els.dataSummary.textContent = '未作成です。';
      return;
    }
    const labelCount = Object.keys(m.labels || {}).length;
    const sampleCount = Object.values(m.labels || {}).reduce((a, l) => a + (l.samples ? l.samples.length : 0), 0);
    const boundaryCount = (m.boundary_kde && m.boundary_kde.samples && m.boundary_kde.samples.length) || 0;
    const refCount = referenceCount(m.reference);
    els.statusBox.innerHTML = `モデル: <strong>${escapeHtml(m.name)}</strong><br>${labelCount}ラベル / ${sampleCount}サンプル / 境界 ${boundaryCount} / リファレンス ${refCount}`;
    els.modelSummary.innerHTML = `
      <strong>${escapeHtml(m.name)}</strong><br>
      ラベル数: ${labelCount}<br>
      学習済みサンプル: ${sampleCount}<br>
      境界KDEサンプル: ${boundaryCount}<br>
      リファレンス数: ${refCount}<br>
      ぼかし: ${escapeHtml(m.settings.bandwidthMode)} / ${m.settings.bandwidthValue.toFixed(2)}<br>
      波形長: ${m.settings.waveSize} / 時間: ${m.settings.durationSeconds}s
    `;
    els.dataSummary.innerHTML = `
      保存先: IndexedDB<br>
      モデル数: ${state.models.length}<br>
      現在のモデルID: <span class="mono">${escapeHtml(m.id)}</span><br>
      リファレンス: ${refCount}件
    `;
  }

  function renderLabels() {
    const m = state.currentModel;
    if (!m) return;
    const names = Object.keys(m.labels || {}).sort((a,b)=>a.localeCompare(b, 'ja'));
    const labelHtml = names.length ? names.map(name => {
      const label = m.labels[name];
      const count = label.samples ? label.samples.length : 0;
      return `<div class="card"><div class="card-head"><div><div class="card-title">${escapeHtml(name)}</div><div class="card-sub">${count} サンプル</div></div><button class="tiny danger" data-del-label="${escapeAttr(name)}">削除</button></div></div>`;
    }).join('') : '<div class="status">ラベルはまだありません。</div>';
    els.labelList.innerHTML = labelHtml;
    els.labelList.querySelectorAll('[data-del-label]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.getAttribute('data-del-label');
        if (!confirm(`ラベル「${name}」を削除しますか？`)) return;
        delete m.labels[name];
        await saveModel(m);
        state.currentModel = clone(m);
        renderAll();
      });
    });
  }

  function renderReferenceSummary() {
    const m = state.currentModel;
    const items = m ? referenceList(m.reference) : [];
    if (!m || !items.length) {
      els.referenceSummary.innerHTML = '未読み込みです。';
      if (els.referenceEditor) els.referenceEditor.value = '[]';
      return;
    }
    els.referenceSummary.innerHTML = `
      <strong>${items.length}件のリファレンス</strong><br>
      合計フレーム数: ${items.reduce((a, r) => a + ((r.frames && r.frames.length) || 0), 0)}<br>
      <div class="list" style="margin-top:8px;">${items.map((r, i) => `
        <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-top:1px solid var(--line);">
          <span style="flex:1;font-size:0.88rem;">${escapeHtml(r.name || r.fileName || `リファレンス ${i+1}`)}</span>
          <button class="tiny danger" data-del-ref="${i}">削除</button>
        </div>`).join('')}
      </div>
    `;
    els.referenceSummary.querySelectorAll('[data-del-ref]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.getAttribute('data-del-ref'), 10);
        const list = referenceList(state.currentModel.reference);
        list.splice(idx, 1);
        state.currentModel.reference = list;
        await saveModel(state.currentModel);
        state.currentModel = clone(state.currentModel);
        renderAll();
        setStatus('リファレンスを1件削除しました。');
      });
    });
    if (els.referenceEditor) {
      els.referenceEditor.value = JSON.stringify(items, null, 2);
    }
  }

  async function saveReferenceEditor() {
    if (!state.currentModel) return;
    let parsed;
    try {
      parsed = JSON.parse(els.referenceEditor.value || '[]');
    } catch (e) {
      alert('リファレンスJSONの読み込みに失敗しました。');
      return;
    }
    state.currentModel.reference = referenceList(parsed);
    await saveModel(state.currentModel);
    state.currentModel = clone(state.currentModel);
    renderAll();
    setStatus('リファレンスを反映しました。');
  }

  function renderDbList() {
    const items = state.models.slice().sort((a,b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    els.dbModelList.innerHTML = items.map(m => `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">${escapeHtml(m.name)}</div>
            <div class="card-sub">${escapeHtml(m.updatedAt || '')}</div>
          </div>
          <div class="chip">${Object.keys(m.labels || {}).length} labels</div>
        </div>
        <div class="card-actions">
          <button class="tiny secondary" data-load-model="${escapeAttr(m.id)}">開く</button>
          <button class="tiny danger" data-delete-model="${escapeAttr(m.id)}">削除</button>
        </div>
      </div>
    `).join('') || '<div class="status">保存済みモデルはありません。</div>';
    els.dbModelList.querySelectorAll('[data-load-model]').forEach(btn => btn.addEventListener('click', async () => {
      await selectActiveModel(btn.getAttribute('data-load-model'));
      renderAll();
      setStatus('モデルを切り替えました。');
    }));
    els.dbModelList.querySelectorAll('[data-delete-model]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-delete-model');
      const m = state.models.find(x => x.id === id);
      if (!confirm(`モデル「${m ? m.name : id}」を削除しますか？`)) return;
      await deleteModel(id);
      if (state.activeModelId === id) {
        state.currentModel = state.models[0] ? clone(state.models[0]) : null;
        state.activeModelId = state.currentModel ? state.currentModel.id : null;
        persistActiveId();
      }
      renderAll();
      setStatus('モデルを削除しました。');
    }));
  }

  function updateMixReadout() {
    const a = 100 - parseInt(els.mixSlider.value, 10);
    const b = parseInt(els.mixSlider.value, 10);
    els.mixReadout.textContent = `A ${a}% / B ${b}%`;
  }

  function updateRefReadout() {
    els.refReadout.textContent = `${parseInt(els.refInfluence.value, 10)}%`;
  }

  function updateBoundaryReadout() {
    els.boundaryReadout.textContent = `±${parseInt(els.boundaryThreshold.value, 10)}%`;
    state.ui.useBoundaryAuto = !!els.useBoundaryAuto.checked;
    state.ui.boundaryThreshold = parseInt(els.boundaryThreshold.value, 10) || 12;
    saveUiState();
  }

  function setStatus(text) {
    els.statusBox.textContent = text;
  }

// === WTSG_reference.js ===
  function referenceFramePool(reference, harmonicsCount) {
    const pool = [];
    for (const item of referenceList(reference)) {
      // framesが空の場合はmeanを代わりに使う
      const frames = Array.isArray(item.frames) && item.frames.length
        ? item.frames
        : (item.mean ? [item.mean] : []);
      for (const frame of frames) {
        if (!frame || !Array.isArray(frame.amps) || !Array.isArray(frame.phases)) continue;
        pool.push({
          amps:   frame.amps.slice(0, harmonicsCount),
          phases: frame.phases.slice(0, harmonicsCount),
        });
      }
    }
    return pool;
  }

  async function handleReferenceImport(ev) {
    const files = Array.from((ev.target.files || [])).filter(Boolean);
    ev.target.value = '';
    if (!files.length || !state.currentModel) return;
    invalidateRefPoolCache();
    const imported = [];
    for (let fi = 0; fi < files.length; fi++) {
      const file = files[fi];
      setStatus(`読み込み中 ${fi + 1} / ${files.length}: ${file.name}`);
      await yieldToUI();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await decodeAudio(arrayBuffer);
      const ref = await analyzeAudioToReference(audioBuffer, state.currentModel.settings.waveSize, state.currentModel.settings.harmonicsCount || HARMONICS_DEFAULT);
      ref.id = uuid();
      ref.name = file.name;
      ref.fileName = file.name;
      imported.push(ref);
    }
    const current = referenceList(state.currentModel.reference);
    state.currentModel.reference = current.concat(imported);
    state.referenceFileName = imported.map(r => r.fileName || r.name).join(', ');
    await saveModel(state.currentModel);
    state.currentModel = clone(state.currentModel);
    invalidateRefPoolCache();
    renderAll();
    setStatus(`リファレンスを ${imported.length} 件読み込みました。`);
  }
  async function decodeAudio(arrayBuffer) {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    try {
      return await ac.decodeAudioData(arrayBuffer.slice(0));
    } finally {
      if (ac && ac.close) ac.close();
    }
  }

  // referenceFramePoolのキャッシュ（重複計算防止）
  let _refPoolCache = null;
  let _refPoolModelId = null;
  function referenceFramePoolCached(reference, harmonicsCount, modelId) {
    if (_refPoolCache && _refPoolModelId === modelId) return _refPoolCache;
    _refPoolCache = referenceFramePool(reference, harmonicsCount);
    _refPoolModelId = modelId;
    return _refPoolCache;
  }
  function invalidateRefPoolCache() { _refPoolCache = null; _refPoolModelId = null; }

  // UIをブロックしないための息継ぎ
  function yieldToUI() { return new Promise(r => setTimeout(r, 0)); }

  async function analyzeAudioToReference(audioBuffer, waveSize, harmonicsCount) {
    const channelCount = audioBuffer.numberOfChannels;
    const totalLen = audioBuffer.length;

    // モノラルに落とす
    const data = new Float32Array(totalLen);
    for (let ch = 0; ch < channelCount; ch++) {
      const src = audioBuffer.getChannelData(ch);
      const w = 1 / channelCount;
      for (let i = 0; i < totalLen; i++) data[i] += src[i] * w;
    }

    // 均等サンプリングで最大32フレーム（精度を保ちつつ過剰分析を防ぐ）
    const MAX_FRAMES = 32;
    const maxFrames = Math.min(MAX_FRAMES, Math.max(2, Math.floor(totalLen / waveSize)));
    const frames = [];

    for (let i = 0; i < maxFrames; i++) {
      const t = maxFrames <= 1 ? 0.5 : i / (maxFrames - 1);
      const start = Math.min(Math.floor((totalLen - waveSize) * t), totalLen - waveSize);
      const frame = new Float32Array(waveSize);
      for (let j = 0; j < waveSize; j++) frame[j] = data[start + j];
      frames.push(frameToVector(frame, harmonicsCount));
      // 4フレームごとにUIに息継ぎ（タイムアウト防止）
      if (i % 4 === 3) await yieldToUI();
    }

    const mean = averageVectors(frames);
    const H = Math.min(harmonicsCount, frames[0].amps.length);

    // 統計ループ：fi外側・h内側（キャッシュ効率のよい順序）
    const ampSum  = new Float64Array(H);
    const ampSum2 = new Float64Array(H);
    for (let fi = 0; fi < frames.length; fi++) {
      const fa = frames[fi].amps;
      for (let h = 0; h < H; h++) {
        const v = fa[h] || 0;
        ampSum[h]  += v;
        ampSum2[h] += v * v;
      }
    }
    const ampMean     = new Float64Array(H);
    const ampStd      = new Float64Array(H);
    const phaseVel    = new Float64Array(H);
    const phaseVelStd = new Float64Array(H);
    const nF = frames.length;
    for (let h = 0; h < H; h++) {
      ampMean[h] = ampSum[h] / nF;
      ampStd[h]  = Math.sqrt(Math.max(0, ampSum2[h] / nF - ampMean[h] * ampMean[h]));
    }

    // 位相速度：circular meanで方向を、絶対値の標準偏差でばらつきを求める
    if (frames.length >= 2) {
      const nDiff = frames.length - 1;
      const TWO_PI = 2 * Math.PI;
      for (let h = 0; h < H; h++) {
        let sinSum = 0, cosSum = 0;
        const absDiffs = new Float64Array(nDiff);
        for (let fi = 1; fi < frames.length; fi++) {
          let d = (frames[fi].phases[h] || 0) - (frames[fi-1].phases[h] || 0);
          d -= TWO_PI * Math.round(d / TWO_PI);  // wrap to -π〜π
          sinSum += Math.sin(d);
          cosSum += Math.cos(d);
          absDiffs[fi - 1] = Math.abs(d);
        }
        // 方向: circular mean
        phaseVel[h] = Math.atan2(sinSum / nDiff, cosSum / nDiff);
        // ばらつき: 絶対値の標準偏差
        let absSum = 0, absSum2 = 0;
        for (let k = 0; k < nDiff; k++) { absSum += absDiffs[k]; absSum2 += absDiffs[k] ** 2; }
        const absMean = absSum / nDiff;
        phaseVelStd[h] = Math.sqrt(Math.max(0, absSum2 / nDiff - absMean ** 2));
      }
    }

    // 振幅類似度
    let ampSimilarity = 0.9;
    if (frames.length >= 2) {
      let simSum = 0;
      for (let fi = 1; fi < frames.length; fi++) {
        let dot = 0, na = 0, nb = 0;
        for (let h = 0; h < H; h++) {
          const a = frames[fi-1].amps[h] || 0, b = frames[fi].amps[h] || 0;
          dot += a * b; na += a * a; nb += b * b;
        }
        simSum += dot / (Math.sqrt(na * nb) + 1e-12);
      }
      ampSimilarity = simSum / (frames.length - 1);
    }

    return {
      waveSize, harmonicsCount,
      frames: [],   // DB肥大化防止のため保存しない。meanとtextureで代替。
      mean,
      texture: {
        ampMean:      Array.from(ampMean),
        ampStd:       Array.from(ampStd),
        phaseVel:     Array.from(phaseVel),
        phaseVelStd:  Array.from(phaseVelStd),
        ampSimilarity,
        frameCount: frames.length,
      },
      createdAt: nowIso(),
    };
  }

// === WTSG_dsp.js ===

  // ----------------------------------------------------------------
  // FFT twiddle factor cache（サイズごとに初回のみ計算）
  // ----------------------------------------------------------------
  const _twiddleCache = new Map();
  function getTwiddle(n) {
    if (_twiddleCache.has(n)) return _twiddleCache.get(n);
    const cos = new Float64Array(n / 2);
    const sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      const a = (2 * Math.PI * i) / n;
      cos[i] = Math.cos(a);
      sin[i] = Math.sin(a);
    }
    _twiddleCache.set(n, { cos, sin });
    return { cos, sin };
  }

  function fft(re, im) {
    const n = re.length;
    if (n <= 1) return;
    const levels = Math.log2(n);
    if (Math.round(levels) !== levels) throw new Error('FFT size must be power of 2');
    // bit-reversal
    let j = 0;
    for (let i = 1; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    // Cooley-Tukey butterfly（キャッシュ済みtwiddle使用）
    const { cos, sin } = getTwiddle(n);
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;          // twiddleテーブルのストライド
      for (let i = 0; i < n; i += size) {
        for (let k = 0; k < half; k++) {
          const ti = k * step;        // twiddleインデックス
          const ar = re[i+k], ai = im[i+k];
          const br = re[i+k+half], bi = im[i+k+half];
          const tpre =  br * cos[ti] + bi * sin[ti];
          const tpim = -br * sin[ti] + bi * cos[ti];
          re[i+k]      = ar + tpre;
          im[i+k]      = ai + tpim;
          re[i+k+half] = ar - tpre;
          im[i+k+half] = ai - tpim;
        }
      }
    }
  }

  function ifft(re, im) {
    for (let i = 0; i < re.length; i++) im[i] = -im[i];
    fft(re, im);
    const n = re.length;
    for (let i = 0; i < n; i++) { re[i] /= n; im[i] = -im[i] / n; }
  }

  // ----------------------------------------------------------------
  // frameToVector — ゼロ位相FFT + Hann窓 + 振幅補正
  // ゼロ位相化: 窓をかけた後にN/2だけ循環シフトしてFFT。
  // これにより位相がフレーム取得位置に依存しなくなる。
  // Hann窓の振幅補正係数: 0.5（窓の平均値）で割って絶対振幅を復元。
  // ----------------------------------------------------------------
  function frameToVector(frame, harmonicsCount) {
    const N = frame.length;
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    const half = N >> 1;
    // ゼロ位相: 窓をかけながら循環シフト（中心を原点へ）
    const HANN_CORRECTION = 2.0; // 1 / 0.5（Hann窓の正規化補正）
    for (let i = 0; i < N; i++) {
      const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
      re[(i + half) % N] = frame[i] * win * HANN_CORRECTION;
    }
    fft(re, im);
    const maxBin = Math.min(harmonicsCount, half - 1);
    let maxMag = 1e-12;
    const mags   = new Float64Array(maxBin);
    const phases = new Float64Array(maxBin);
    for (let h = 1; h <= maxBin; h++) {
      const mag = Math.hypot(re[h], im[h]);
      mags[h - 1]   = mag;
      phases[h - 1] = Math.atan2(im[h], re[h]); // ゼロ位相FFTなので補正不要
      if (mag > maxMag) maxMag = mag;
    }
    const amps = new Array(harmonicsCount).fill(0);
    const phArr = new Array(harmonicsCount).fill(0);
    const invMax = 1 / maxMag;
    for (let h = 0; h < maxBin; h++) {
      amps[h]  = clamp(mags[h] * invMax, 0, 1);
      phArr[h] = wrapPhase(phases[h]);
    }
    return normalizeVector({ amps, phases: phArr });
  }

  // ----------------------------------------------------------------
  // synthWaveFromVector — 線形正規化（tanhなし）
  // WaveTableは正確な波形を格納すべきでtanhによる歪みは不適切。
  // ----------------------------------------------------------------
  function synthWaveFromVector(vector, waveSize, harmonicsCount) {
    const re = new Float64Array(waveSize);
    const im = new Float64Array(waveSize);
    const maxBin = Math.min(harmonicsCount, Math.floor(waveSize / 2) - 1);
    for (let h = 1; h <= maxBin; h++) {
      const a = (vector.amps[h - 1] || 0) * (waveSize / 2);
      const p = vector.phases[h - 1] || 0;
      re[h] = a * Math.cos(p);
      im[h] = a * Math.sin(p);
      re[waveSize - h] =  re[h];
      im[waveSize - h] = -im[h];
    }
    ifft(re, im);
    // 線形正規化：最大絶対値で割る
    let mx = 0;
    for (let i = 0; i < waveSize; i++) { const v = Math.abs(re[i]); if (v > mx) mx = v; }
    const out = new Float32Array(waveSize);
    if (mx > 1e-12) {
      const inv = 1 / mx;
      for (let i = 0; i < waveSize; i++) out[i] = re[i] * inv;
    }
    return out;
  }

  // ----------------------------------------------------------------
  // synthVectorToBuffer — driftを除去。候補プレビュー用の静的な波形繰り返し。
  // textureがあればstepVectorAutoregressiveで変化を付ける。
  // ----------------------------------------------------------------
  function synthVectorToBuffer(vector, waveSize, durationSeconds, sampleRate, harmonicsCount, texture) {
    const totalSamples = Math.max(waveSize, Math.floor(durationSeconds * sampleRate));
    const aligned = Math.floor(totalSamples / waveSize) * waveSize;
    const segmentCount = Math.max(1, Math.floor(aligned / waveSize));
    const buffer = new Float32Array(aligned);
    let vec = vector;
    for (let seg = 0; seg < segmentCount; seg++) {
      if (seg > 0 && texture) {
        // textureがある場合は自己回帰で微小変化
        vec = stepVectorAutoregressive(vec, texture, harmonicsCount, 0.15, 0.5);
      }
      buffer.set(synthWaveFromVector(vec, waveSize, harmonicsCount), seg * waveSize);
    }
    return { buffer, url: bufferToWavUrl(buffer, sampleRate) };
  }
// === WTSG_texture.js ===

  // ----------------------------------------------------------------
  // mergeTextureProfiles — phaseVelも複素数平均でマージ
  // ----------------------------------------------------------------
  function mergeTextureProfiles(reference, harmonicsCount) {
    const items = referenceList(reference);
    const profiles = items.map(r => r.texture).filter(Boolean);
    if (!profiles.length) return null;

    const H  = harmonicsCount;
    const n  = profiles.length;
    const ampMean     = new Float64Array(H);
    const ampStd      = new Float64Array(H);
    const phaseVelSin = new Float64Array(H); // circular mean用
    const phaseVelCos = new Float64Array(H);
    const phaseVelStd = new Float64Array(H);
    let ampSimilarity = 0;

    for (const p of profiles) {
      for (let h = 0; h < H; h++) {
        ampMean[h]     += (p.ampMean[h]     || 0) / n;
        ampStd[h]      += (p.ampStd[h]      || 0) / n;
        phaseVelStd[h] += (p.phaseVelStd[h] || 0) / n;
        // phaseVelは複素数平均
        const v = p.phaseVel[h] || 0;
        phaseVelSin[h] += Math.sin(v) / n;
        phaseVelCos[h] += Math.cos(v) / n;
      }
      ampSimilarity += (p.ampSimilarity || 0.7) / n;
    }

    const phaseVel = new Float64Array(H);
    for (let h = 0; h < H; h++) {
      phaseVel[h] = Math.atan2(phaseVelSin[h], phaseVelCos[h]);
    }

    return { ampMean, ampStd, phaseVel, phaseVelStd, ampSimilarity };
  }

  // ----------------------------------------------------------------
  // initVectorFromTexture — 位相は-π〜πの一様乱数で初期化
  // ----------------------------------------------------------------
  function initVectorFromTexture(tex, harmonicsCount, ampNoise) {
    const amps   = new Array(harmonicsCount);
    const phases = new Array(harmonicsCount);
    for (let h = 0; h < harmonicsCount; h++) {
      const base = tex.ampMean[h] || 0;
      const std  = tex.ampStd[h]  || 0;
      amps[h]   = clamp(base + randn() * std * ampNoise, 0, 1);
      phases[h] = wrapPhase((rand() * 2 - 1) * Math.PI);
    }
    return normalizeVector({ amps, phases });
  }

  // ----------------------------------------------------------------
  // stepVectorAutoregressive — 位相速度の符号問題を修正
  // phaseVel は複素数でマージされているので符号は信頼できる。
  // ただし velStd は絶対値のばらつきなので符号なしで加算する。
  // ----------------------------------------------------------------
  function stepVectorAutoregressive(prevVec, tex, harmonicsCount, ampNoise, phaseScale) {
    const amps   = new Array(harmonicsCount);
    const phases = new Array(harmonicsCount);
    for (let h = 0; h < harmonicsCount; h++) {
      const prevAmp = prevVec.amps[h]   || 0;
      const prevPh  = prevVec.phases[h] || 0;
      const target  = tex.ampMean[h]    || 0;
      const std     = tex.ampStd[h]     || 0;
      const pull    = 1 - tex.ampSimilarity;
      amps[h] = clamp(prevAmp + pull * (target - prevAmp) + randn() * std * ampNoise, 0, 1);

      // 位相速度の方向はphaseVel（circular meanで正確）、
      // ばらつきはphaseVelStd（絶対値）、符号はランダムに付ける
      const vel    = tex.phaseVel[h]    || 0;
      const velStd = tex.phaseVelStd[h] || 0.1;
      const sign   = randn() >= 0 ? 1 : -1;
      const step   = (vel + sign * velStd * Math.abs(randn())) * phaseScale;
      phases[h] = wrapPhase(prevPh + step);
    }
    return { amps, phases };
  }

  // ----------------------------------------------------------------
  // synthAutoregressiveBuffer
  // ----------------------------------------------------------------
  function synthAutoregressiveBuffer(tex, harmonicsCount, waveSize, segmentCount, ampNoise, phaseScale) {
    const buffer = new Float32Array(segmentCount * waveSize);
    let vec = initVectorFromTexture(tex, harmonicsCount, ampNoise);
    for (let seg = 0; seg < segmentCount; seg++) {
      if (seg > 0) vec = stepVectorAutoregressive(vec, tex, harmonicsCount, ampNoise, phaseScale);
      buffer.set(synthWaveFromVector(vec, waveSize, harmonicsCount), seg * waveSize);
    }
    return buffer;
  }

  function bufferToWavUrl(buffer, sampleRate) {
    const wav = encodeWavFloat32(buffer, sampleRate);
    const blob = new Blob([wav], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  function encodeWavFloat32(samples, sampleRate) {
    const bytesPerSample = 4;
    const dataSize = samples.length * bytesPerSample;
    const buf = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buf);
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 3, true);   // IEEE float
    view.setUint16(22, 1, true);   // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 32, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 4) {
      view.setFloat32(offset, clamp(samples[i], -1, 1), true);
    }
    return buf;
  }

  function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }
// === WTSG_candidates.js ===
  async function generateCandidates() {

    if (!state.currentModel) return;
    syncModelFromUI();
    const m = state.currentModel;
    const harmonicsCount = m.settings.harmonicsCount || HARMONICS_DEFAULT;
    const count = m.settings.candidateCount || 10;
    const bwMode = m.settings.bandwidthMode || 'fixed';
    const range = m.settings.bandwidthRange || [0.2, 0.5];
    const minBw = range[0];
    const maxBw = range[1];
    const ref = referenceCount(m.reference) ? m.reference : null;
    const activeLabelName = els.trainLabelSelect.value && els.trainLabelSelect.value !== '__new__' ? els.trainLabelSelect.value : '';
    const activeLabel = activeLabelName ? ensureLabel(m, activeLabelName) : null;
    const samples = activeLabel && activeLabel.samples ? activeLabel.samples : [];
    const tex = ref ? mergeTextureProfiles(ref, harmonicsCount) : null;
    const generated = [];
    for (let i = 0; i < count; i++) {
      const t = count <= 1 ? 0.5 : i / (count - 1);
      const bw = bwMode === 'adjustable' ? lerp(minBw, maxBw, t) : m.settings.bandwidthValue;
      const mix = ref ? clamp(parseInt(els.refInfluence.value, 10) / 100, 0, 1) : 0;
      const vec = sampleLabelVector(activeLabel, harmonicsCount, bw, ref, mix, t);
      generated.push({
        id: uuid(),
        bandwidth: bw,
        vector: vec,
        wav: synthVectorToBuffer(vec, m.settings.waveSize, m.settings.durationSeconds, SAMPLE_RATE, harmonicsCount, tex),
        sourceLabel: activeLabelName || 'random',
      });
    }
    state.candidateBatch = generated;
    renderCandidates();
    setStatus(`候補を ${generated.length} 個生成しました。`);
  }

  // ---- アナライザー描画 ----
  const ANALYZER_VIEWS = ['3D', 'Bar', 'Det'];
  // 各候補のビューモード記憶
  const candViewMap = {};

  // 描画用に上位N本の倍音インデックスを取得（振幅の大きい順）
  function topHarmonicIndices(amps, maxH) {
    const H = Math.min(amps.length, maxH);
    const idx = [];
    for (let i = 0; i < H; i++) idx.push(i);
    idx.sort((a, b) => (amps[b] || 0) - (amps[a] || 0));
    return idx.slice(0, 64); // 上位64本
  }

  // 1波形を加算合成（描画専用、軽量版）
  function makeDisplayWave(amps, phases, topIdx, WAVE_PTS, phaseShift) {
    const wave = new Float32Array(WAVE_PTS);
    for (const h of topIdx) {
      const a = amps[h] || 0;
      if (a < 5e-4) continue;
      const ph = (phases[h] || 0) + phaseShift;
      const freq = h + 1;
      for (let i = 0; i < WAVE_PTS; i++) {
        wave[i] += a * Math.sin(2 * Math.PI * freq * i / WAVE_PTS + ph);
      }
    }
    let mx = 0;
    for (let i = 0; i < WAVE_PTS; i++) { const v = Math.abs(wave[i]); if (v > mx) mx = v; }
    if (mx > 1e-6) { const inv = 1 / mx; for (let i = 0; i < WAVE_PTS; i++) wave[i] *= inv; }
    return wave;
  }

  function drawAnalyzer(canvas, vec, viewMode) {
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || canvas.width || 320;
    const H = canvas.height || 160;
    canvas.width = W;
    canvas.height = H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#050b14';
    ctx.fillRect(0, 0, W, H);

    const amps = vec.amps;
    const phases = vec.phases;
    const n = amps.length;

    if (viewMode === '3D') {
      // ---- Vital スタイル 3D サーフェス ----
      // 斜視投影：X=時間軸、Y=振幅、Z=フレーム番号（手前→奥）
      // 隣接フレームの頂点を結んで「面」として描画
      const NUM_FRAMES = 20;    // フレーム数（奥行き）
      const WAVE_PTS   = 128;   // 1フレームの横解像度（軽量化）

      // 斜視パラメータ（Vital風: 画面下を手前、上を奥）
      const skewX  = W * 0.18;  // Z方向の横ずれ量（全体）
      const skewY  = H * 0.38;  // Z方向の縦ずれ量（全体）
      const waveH  = H * 0.30;  // 振幅の縦スケール
      const baseY  = H * 0.72;  // 最前面の基準Y

      // 投影関数：time(0-1), amp(-1〜1), frame(0=手前, 1=奥) → canvas座標
      function project(time, amp, frame) {
        const px = time * W * 0.88 + W * 0.06 + skewX * frame;
        const py = baseY - skewY * frame - amp * waveH;
        return [px, py];
      }

      // 上位倍音だけ使う（毎回計算しない）
      const topIdx = topHarmonicIndices(amps, n);

      // 全フレームの波形を事前計算
      const waves = [];
      for (let fi = 0; fi < NUM_FRAMES; fi++) {
        const shift = (fi / NUM_FRAMES) * Math.PI * 0.5; // フレームごとに位相をわずかにずらす
        waves.push(makeDisplayWave(amps, phases, topIdx, WAVE_PTS, shift));
      }

      // 奥から手前へ描画（painter's algorithm）
      for (let fi = NUM_FRAMES - 1; fi >= 0; fi--) {
        const t = 1 - fi / (NUM_FRAMES - 1); // 0=奥, 1=手前
        const wave = waves[fi];
        const alpha = 0.25 + 0.75 * t;
        const lw    = 0.5  + 0.8  * t;

        // フレーム間の面を塗る（このフレームと1つ手前のフレームを結ぶ）
        if (fi < NUM_FRAMES - 1) {
          const waveNext = waves[fi + 1];
          ctx.beginPath();
          const [sx, sy] = project(0, wave[0], fi / (NUM_FRAMES - 1));
          ctx.moveTo(sx, sy);
          for (let i = 1; i < WAVE_PTS; i++) {
            const [px, py] = project(i / (WAVE_PTS - 1), wave[i], fi / (NUM_FRAMES - 1));
            ctx.lineTo(px, py);
          }
          for (let i = WAVE_PTS - 1; i >= 0; i--) {
            const [px, py] = project(i / (WAVE_PTS - 1), waveNext[i], (fi + 1) / (NUM_FRAMES - 1));
            ctx.lineTo(px, py);
          }
          ctx.closePath();
          // 手前ほど明るい紫〜青
          const faceAlpha = 0.04 + 0.06 * t;
          ctx.fillStyle = `rgba(140,120,200,${faceAlpha})`;
          ctx.fill();
        }

        // 波形ライン
        ctx.beginPath();
        ctx.lineWidth = lw;
        // 手前=明るい白紫、奥=暗い青紫（Vital風）
        const light = Math.floor(140 + 115 * t);
        ctx.strokeStyle = `rgba(${light},${Math.floor(110+100*t)},${light+30},${alpha})`;
        for (let i = 0; i < WAVE_PTS; i++) {
          const [px, py] = project(i / (WAVE_PTS - 1), wave[i], fi / (NUM_FRAMES - 1));
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

    } else if (viewMode === 'Bar') {
    } else if (viewMode === 'Bar') {
      // ---- 棒グラフ（振幅上段 + 位相0〜360°下段）----
      const ampH = H * 0.50, phH = H * 0.36;
      const ampY = 4, phY = H * 0.58;
      const barW = Math.max(1, (W - 4) / n);

      // 振幅
      for (let i = 0; i < n; i++) {
        const bh = amps[i] * ampH;
        const x = 2 + i * barW;
        const g = ctx.createLinearGradient(0, ampY + ampH - bh, 0, ampY + ampH);
        g.addColorStop(0, '#ff7832'); g.addColorStop(1, '#ff3a00');
        ctx.fillStyle = g;
        ctx.fillRect(x, ampY + ampH - bh, Math.max(1, barW - 0.5), bh);
      }
      ctx.fillStyle = 'rgba(140,190,255,0.5)'; ctx.font = '8px system-ui';
      ctx.fillText('Amp', 3, ampY + 9);

      // 位相 0〜360°
      ctx.strokeStyle = 'rgba(100,160,255,0.18)'; ctx.lineWidth = 0.5;
      for (let deg = 90; deg < 360; deg += 90) {
        const ly = phY + phH - (deg / 360) * phH;
        ctx.beginPath(); ctx.moveTo(2, ly); ctx.lineTo(W - 2, ly); ctx.stroke();
      }
      for (let i = 0; i < n; i++) {
        const norm = ((phases[i] + Math.PI) / (2 * Math.PI));
        const bh = norm * phH;
        const x = 2 + i * barW;
        ctx.fillStyle = `hsla(${200 + 60 * norm},80%,65%,0.75)`;
        ctx.fillRect(x, phY + phH - bh, Math.max(1, barW - 0.5), bh);
      }
      ctx.fillStyle = 'rgba(140,190,255,0.5)';
      ctx.fillText('Phase 0–360°', 3, phY + 9);

    } else {
      // ---- Det（横スクロール詳細表示）----
      const BAR_W = 8, GAP = 2, UNIT = BAR_W + GAP;
      const totalW = n * UNIT;
      canvas.width = totalW;
      canvas.style.width = totalW + 'px';
      const ampH = H * 0.50, phH = H * 0.36;
      const ampY = 4, phY = H * 0.58;

      ctx.fillStyle = '#060d1a';
      ctx.fillRect(0, 0, totalW, H);

      for (let i = 0; i < n; i++) {
        const bh = amps[i] * ampH;
        const x = i * UNIT;
        const g = ctx.createLinearGradient(0, ampY + ampH - bh, 0, ampY + ampH);
        g.addColorStop(0, '#ff9050'); g.addColorStop(1, '#ff4010');
        ctx.fillStyle = g;
        ctx.fillRect(x, ampY + ampH - bh, BAR_W, bh);
      }
      ctx.strokeStyle = 'rgba(100,180,255,0.15)'; ctx.lineWidth = 0.5;
      for (let deg = 90; deg < 360; deg += 90) {
        const ly = phY + phH - (deg / 360) * phH;
        ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(totalW, ly); ctx.stroke();
      }
      for (let i = 0; i < n; i++) {
        const norm = ((phases[i] + Math.PI) / (2 * Math.PI));
        const bh = norm * phH;
        const x = i * UNIT;
        ctx.fillStyle = `hsla(${200 + 60 * norm},80%,65%,0.78)`;
        ctx.fillRect(x, phY + phH - bh, BAR_W, bh);
      }
      ctx.fillStyle = 'rgba(170,205,255,0.55)'; ctx.font = '9px system-ui';
      ctx.fillText('Amp', 2, ampY + 10);
      ctx.fillText('Phase 0–360°', 2, phY + 10);
    }
  }
  // (old drawAnalyzer code removed)

  function setupAnalyzer(container, vec, candId) {
    const viewMode = candViewMap[candId] || '3D';
    const canvas = container.querySelector('canvas');
    const wrap = container.querySelector('.det-wrap');

    if (viewMode === 'Det') {
      // Det: 横スクロールwrapの中にcanvasを置く
      wrap.style.display = 'block';
      canvas.style.display = 'none';
      const dc = wrap.querySelector('canvas');
      const H = 110;
      dc.height = H;
      drawAnalyzer(dc, vec, 'Det');
    } else {
      wrap.style.display = 'none';
      canvas.style.display = 'block';
      canvas.width = canvas.offsetWidth || 320;
      canvas.height = 160;
      drawAnalyzer(canvas, vec, viewMode);
    }

    // ビューボタンのactive更新
    container.querySelectorAll('.view-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === viewMode);
    });
  }

  // 現在表示中の候補インデックス
  let candCurrentIdx = 0;

  function updateCandNav() {
    const total = state.candidateBatch.length;
    const nav = document.getElementById('candidateNav');
    const counter = document.getElementById('candCounter');
    if (!nav || !counter) return;
    if (total === 0) { nav.classList.add('hidden'); return; }
    nav.classList.remove('hidden');
    counter.textContent = `${candCurrentIdx + 1} / ${total}`;
    const track = document.getElementById('candidateList');
    if (!track) return;
    // wrapのpx幅で計算（percentage基準だとtrack全体幅が基準になりバグる）
    const wrap = document.getElementById('candidateScrollWrap');
    const slideW = wrap ? wrap.offsetWidth : (track.firstElementChild ? track.firstElementChild.offsetWidth : 320);
    track.classList.add('animating');
    track.style.transform = `translateX(-${candCurrentIdx * slideW}px)`;
    clearTimeout(track._animTimer);
    track._animTimer = setTimeout(() => track.classList.remove('animating'), 360);
  }

  function renderCandidates() {
    if (!state.currentModel) return;
    const m = state.currentModel;
    const labels = Object.keys(m.labels || {}).sort((a,b) => a.localeCompare(b, 'ja'));
    const track = document.getElementById('candidateList');

    if (!state.candidateBatch.length) {
      track.innerHTML = '<div class="cand-slide"><div class="status" style="margin:8px 0;">まだ候補がありません。候補を生成してください。</div></div>';
      document.getElementById('candidateNav').classList.add('hidden');
      return;
    }

    track.innerHTML = state.candidateBatch.map((cand, idx) => {
      const selectOptions = labels.map(n => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join('') + (labels.length ? '' : '<option value="">（ラベルなし）</option>');
      return `
        <div class="cand-slide">
          <div class="card" data-cand-id="${escapeAttr(cand.id)}">
            <div class="cand-analyzer">
              <canvas style="display:block;width:100%;height:160px;"></canvas>
              <div class="det-wrap" style="display:none;height:160px;overflow-x:auto;-webkit-overflow-scrolling:touch;">
                <canvas height="160" style="height:160px;display:block;"></canvas>
              </div>
              <div class="view-btns">
                ${ANALYZER_VIEWS.map(v => `<button class="view-btn${v === (candViewMap[cand.id]||'3D') ? ' active':''}" data-view="${v}" data-cand-ref="${escapeAttr(cand.id)}">${v}</button>`).join('')}
              </div>
            </div>
            <div class="card-head" style="margin-bottom:6px;">
              <div>
                <div class="card-title">候補 ${idx + 1}</div>
                <div class="card-sub">${escapeHtml(cand.sourceLabel)} / ぼかし ${cand.bandwidth.toFixed(2)}</div>
              </div>
              <div class="chip">A1 ${(cand.vector.amps[0]||0).toFixed(2)} / P1 ${(cand.vector.phases[0]||0).toFixed(2)}</div>
            </div>
            <div class="cand-audio">
              <audio controls src="${cand.wav.url}"></audio>
            </div>
            <div class="card-actions" style="margin-top:8px;">
              <div style="min-width:160px;flex:1 1 160px;">
                <select data-target-label="${escapeAttr(cand.id)}">
                  <option value="">保存先ラベルを選ぶ</option>
                  ${selectOptions}
                  <option value="__new__">＋山を追加する</option>
                </select>
              </div>
              <button class="tiny good" data-add-label="${escapeAttr(cand.id)}">山に入れる</button>
              <button class="tiny warn" data-mark-boundary="${escapeAttr(cand.id)}">中間</button>
              <button class="tiny secondary" data-download-cand="${escapeAttr(cand.id)}">DL</button>
              <button class="tiny ghost" data-remove-cand="${escapeAttr(cand.id)}">破棄</button>
            </div>
            <div class="boundary-ui hidden" data-boundary-ui="${escapeAttr(cand.id)}">
              <div class="divider"></div>
              <div class="row">
                <div class="c-5"><span class="label">左の山</span>
                  <select data-boundary-a="${escapeAttr(cand.id)}">${labels.map(n => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join('')}</select></div>
                <div class="c-5"><span class="label">右の山</span>
                  <select data-boundary-b="${escapeAttr(cand.id)}">${labels.map(n => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join('')}</select></div>
                <div class="c-2"><span class="label">中間の強さ</span>
                  <input type="range" min="0" max="100" value="50" data-boundary-ratio="${escapeAttr(cand.id)}"></div>
              </div>
              <div class="card-actions">
                <button class="tiny good" data-save-boundary="${escapeAttr(cand.id)}">境界に入れる</button>
                <button class="tiny ghost" data-hide-boundary="${escapeAttr(cand.id)}">閉じる</button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');

    // アナライザー初期描画（requestAnimationFrameでレイアウト確定後）
    requestAnimationFrame(() => {
      // cand-slideの幅をwrapのpx幅に固定（percentage指定だとtrack全体幅が基準になりバグる）
    const wrap = document.getElementById('candidateScrollWrap');
    const slideW = wrap ? wrap.offsetWidth : 320;
    track.querySelectorAll('.cand-slide').forEach(slide => {
      slide.style.width = slideW + 'px';
      slide.style.minWidth = slideW + 'px';
    });

    track.querySelectorAll('.cand-slide').forEach((slide, idx) => {
        const cand = state.candidateBatch[idx];
        if (!cand) return;
        setupAnalyzer(slide.querySelector('.cand-analyzer'), cand.vector, cand.id);
      });
    });

    // ビューボタン
    track.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.candRef;
        candViewMap[id] = btn.dataset.view;
        const slide = btn.closest('.cand-slide');
        const cand = state.candidateBatch.find(c => c.id === id);
        if (cand) setupAnalyzer(slide.querySelector('.cand-analyzer'), cand.vector, id);
      });
    });

    // 山に入れる
    track.querySelectorAll('[data-add-label]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-add-label');
      const cand = state.candidateBatch.find(c => c.id === id);
      if (!cand) return;
      let target = track.querySelector(`[data-target-label="${cssEscape(id)}"]`).value;
      if (!target) { target = prompt('入れるラベル名を入力してください'); if (!target) return; }
      if (target === '__new__') { target = prompt('新しいラベル名を入力してください'); if (!target) return; }
      addCandidateToLabel(target.trim(), cand);
    }));

    track.querySelectorAll('[data-mark-boundary]').forEach(btn => btn.addEventListener('click', () => {
      const ui = track.querySelector(`[data-boundary-ui="${cssEscape(btn.getAttribute('data-mark-boundary'))}"]`);
      if (ui) ui.classList.remove('hidden');
    }));
    track.querySelectorAll('[data-hide-boundary]').forEach(btn => btn.addEventListener('click', () => {
      const ui = track.querySelector(`[data-boundary-ui="${cssEscape(btn.getAttribute('data-hide-boundary'))}"]`);
      if (ui) ui.classList.add('hidden');
    }));
    track.querySelectorAll('[data-save-boundary]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-save-boundary');
      const cand = state.candidateBatch.find(c => c.id === id);
      if (!cand) return;
      const a = track.querySelector(`[data-boundary-a="${cssEscape(id)}"]`).value;
      const b = track.querySelector(`[data-boundary-b="${cssEscape(id)}"]`).value;
      const ratio = parseInt(track.querySelector(`[data-boundary-ratio="${cssEscape(id)}"]`).value, 10) / 100;
      await addCandidateToBoundary(cand, a, b, ratio);
    }));
    track.querySelectorAll('[data-download-cand]').forEach(btn => btn.addEventListener('click', () => {
      const cand = state.candidateBatch.find(c => c.id === btn.getAttribute('data-download-cand'));
      if (cand) downloadBufferAsWav(cand.wav.buffer, `candidate_${cand.id}.wav`);
    }));
    track.querySelectorAll('[data-remove-cand]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-remove-cand');
      state.candidateBatch = state.candidateBatch.filter(c => c.id !== id);
      if (candCurrentIdx >= state.candidateBatch.length) candCurrentIdx = Math.max(0, state.candidateBatch.length - 1);
      renderCandidates();
      updateCandNav();
    }));

    setupCandSwipe();
    candCurrentIdx = Math.min(candCurrentIdx, state.candidateBatch.length - 1);
    // HTML再構築後はアニメーションなしで即座に位置をセット
    track.classList.remove('animating');
    const wrap2 = document.getElementById('candidateScrollWrap');
    const slideW2 = wrap2 ? wrap2.offsetWidth : 320;
    track.style.transform = `translateX(-${candCurrentIdx * slideW2}px)`;
    updateCandNav();
  }

  function setupCandSwipe() {
    const wrap = document.getElementById('candidateScrollWrap');
    if (!wrap || wrap._swipeReady) return;
    wrap._swipeReady = true;
    let startX = 0, startY = 0, isDragging = false;
    wrap.addEventListener('touchstart', e => {
      // Det横スクロール枠内のタッチは候補スワイプとして扱わない
      if (e.target.closest && e.target.closest('.det-wrap')) { isDragging = false; return; }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isDragging = true;
    }, { passive: true });
    wrap.addEventListener('touchmove', e => {
      if (!isDragging) return;
      if (e.target.closest && e.target.closest('.det-wrap')) { isDragging = false; return; }
      const dx = e.touches[0].clientX - startX;
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (dy > Math.abs(dx) * 1.2) { isDragging = false; return; }
      e.preventDefault();
    }, { passive: false });
    wrap.addEventListener('touchend', e => {
      if (!isDragging) return;
      isDragging = false;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) < 40) return;
      if (dx < 0 && candCurrentIdx < state.candidateBatch.length - 1) candCurrentIdx++;
      else if (dx > 0 && candCurrentIdx > 0) candCurrentIdx--;
      updateCandNav();
    });
  }

  // 矢印ボタンのイベント（wireEventsから呼ぶのでここで登録しない）
  function wireCandNav() {
    document.getElementById('candPrev').addEventListener('click', () => {
      if (candCurrentIdx > 0) { candCurrentIdx--; updateCandNav(); }
    });
    document.getElementById('candNext').addEventListener('click', () => {
      if (candCurrentIdx < state.candidateBatch.length - 1) { candCurrentIdx++; updateCandNav(); }
    });
  }

// === WTSG_train.js ===
  async function addCandidateToLabel(labelName, cand) {
    const m = state.currentModel;
    if (!m) return;
    const label = ensureLabel(m, labelName);
    const entry = makeFeatureEntry(cand.vector, label.samples.length ? label.samples[label.samples.length - 1].vector : null, 'candidate');
    label.samples.push(entry);
    label.stats.count = label.samples.length;
    label.lastVector = clone(cand.vector);
    if (m.settings.bandwidthMode === 'adjustable') {
      m.settings.bandwidthValue = cand.bandwidth;
      narrowBandwidthRangeAround(cand.bandwidth);
    }
    await saveModel(m);
    state.currentModel = clone(m);
    syncUIFromModel();
    renderAll();
    setStatus(`ラベル「${labelName}」に追加しました。`);
  }

  async function addCandidateToBoundary(cand, leftLabel, rightLabel, ratio) {
    const m = state.currentModel;
    if (!m) return;
    if (!m.boundary) m.boundary = { samples: [] };
    const entry = makeFeatureEntry(cand.vector, m.boundary.samples.length ? m.boundary.samples[m.boundary.samples.length - 1].vector : null, 'boundary');
    entry.boundary = { leftLabel, rightLabel, ratio };
    m.boundary.samples.push(entry);
    if (m.settings.bandwidthMode === 'adjustable') {
      m.settings.bandwidthValue = cand.bandwidth;
      narrowBandwidthRangeAround(cand.bandwidth);
    }
    await saveModel(m);
    state.currentModel = clone(m);
    syncUIFromModel();
    renderAll();
    setStatus('境界に記録しました。');
  }

  function narrowBandwidthRangeAround(value) {
    const m = state.currentModel;
    if (!m) return;
    const oldMin = m.settings.bandwidthRange[0];
    const oldMax = m.settings.bandwidthRange[1];
    const step = (oldMax - oldMin) / 9;
    const idx = Math.round((value - oldMin) / Math.max(step, 1e-6));
    const lo = clamp(oldMin + step * Math.max(0, idx - 1), 0.01, 2);
    const hi = clamp(oldMin + step * Math.min(9, idx + 1), 0.01, 2);
    m.settings.bandwidthRange = [Math.min(lo, hi), Math.max(lo, hi)];
  }

  function ensureLabel(model, name) {
    if (!model.labels[name]) model.labels[name] = createEmptyLabel(name);
    return model.labels[name];
  }

  function makeFeatureEntry(vector, prevVector, source) {
    const delta = prevVector ? vectorDiff(vector, prevVector) : null;
    return {
      id: uuid(),
      createdAt: nowIso(),
      vector: clone(vector),
      delta: delta ? clone(delta) : null,
      envelope: estimateEnvelope(vector),
      source,
    };
  }

  // estimateEnvelope: RMSと倍音重心を保存（実際に使える統計）
  function estimateEnvelope(vector) {
    const amps = vector.amps;
    const H = amps.length;
    // RMS振幅
    let rmsSum = 0;
    for (let i = 0; i < H; i++) rmsSum += (amps[i] || 0) ** 2;
    const rms = Math.sqrt(rmsSum / H);
    // スペクトル重心（低次〜高次の偏り）
    let wSum = 0, wTotal = 0;
    for (let i = 0; i < H; i++) { wSum += i * (amps[i] || 0); wTotal += (amps[i] || 0); }
    const centroid = wTotal > 1e-9 ? wSum / wTotal / H : 0.5;
    // 80%エネルギーに必要な倍音本数（スペクトル密度）
    const totalE = rmsSum;
    const sorted = Array.from(amps).sort((a, b) => b - a);
    let cumE = 0; let density = H;
    for (let i = 0; i < sorted.length; i++) {
      cumE += (sorted[i] || 0) ** 2;
      if (cumE >= totalE * 0.8) { density = i + 1; break; }
    }
    return { rms, centroid, density };
  }

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
          amps:   lerpArray(vecA.amps, vecB.amps, mix),
          phases: lerpPhasesArray(vecA.phases, vecB.phases, mix),
        };
        if (useBoundary && m.boundary && m.boundary.samples && m.boundary.samples.length && Math.abs(mix - 0.5) <= boundaryThreshold) {
          const boundaryVec = sampleBoundaryVector(m.boundary, harmonicsCount, bw, ref, refMix, t);
          const boundaryAmount = 1 - Math.min(1, Math.abs(mix - 0.5) / Math.max(boundaryThreshold, 0.0001));
          blended = {
            amps:   lerpArray(blended.amps, boundaryVec.amps, boundaryAmount * 0.65),
            phases: lerpPhasesArray(blended.phases, boundaryVec.phases, boundaryAmount * 0.65),
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

// === WTSG_main.js ===

  const DB_NAME = 'wavetable-training-db';
  const DB_VERSION = 1;
  const STORE = 'models';
  const ACTIVE_KEY = 'wavetable-active-model-id';
  const UI_KEY = 'wavetable-ui-settings';
  const SAMPLE_RATE = 48000;
  const HARMONICS_DEFAULT = 1024;

  const els = {
    modelSelect: byId('modelSelect'),
    newModelName: byId('newModelName'),
    newModelBtn: byId('newModelBtn'),
    saveModelBtn: byId('saveModelBtn'),
    statusBox: byId('statusBox'),
    candidateCount: byId('candidateCount'),
    bandwidthMode: byId('bandwidthMode'),
    bandwidthValue: byId('bandwidthValue'),
    bandwidthMin: byId('bandwidthMin'),
    bandwidthMax: byId('bandwidthMax'),
    waveSize: byId('waveSize'),
    durationSeconds: byId('durationSeconds'),
    harmonicsCount: byId('harmonicsCount'),
    trainLabelSelect: byId('trainLabelSelect'),
    newLabelName: byId('newLabelName'),
    genCandidatesBtn: byId('genCandidatesBtn'),
    candidateList: byId('candidateList'),
    modelSummary: byId('modelSummary'),
    labelList: byId('labelList'),
    referenceSummary: byId('referenceSummary'),
    referenceEditor: byId('referenceEditor'),
    saveReferenceBtn: byId('saveReferenceBtn'),
    importReferenceBtn: byId('importReferenceBtn'),
    importReferenceInput: byId('importReferenceInput'),
    importReferenceBtn2: byId('importReferenceBtn2'),
    importReferenceInput2: byId('importReferenceInput2'),
    genLabelA: byId('genLabelA'),
    genLabelB: byId('genLabelB'),
    mixSlider: byId('mixSlider'),
    mixReadout: byId('mixReadout'),
    refInfluence: byId('refInfluence'),
    refReadout: byId('refReadout'),
    useBoundaryAuto: byId('useBoundaryAuto'),
    boundaryThreshold: byId('boundaryThreshold'),
    boundaryReadout: byId('boundaryReadout'),
    genWaveSize: byId('genWaveSize'),
    genDurationSeconds: byId('genDurationSeconds'),
    genHarmonicsCount: byId('genHarmonicsCount'),
    generateAudioBtn: byId('generateAudioBtn'),
    generatedAudio: byId('generatedAudio'),
    downloadWavBtn: byId('downloadWavBtn'),
    clearGeneratedBtn: byId('clearGeneratedBtn'),
    genInfo: byId('genInfo'),
    genMeter: byId('genMeter'),
    importModelBtn: byId('importModelBtn'),
    importModelBtn2: byId('importModelBtn2'),
    importModelInput: byId('importModelInput'),
    importModelInput2: byId('importModelInput2'),
    exportModelBtn: byId('exportModelBtn'),
    exportModelBtn2: byId('exportModelBtn2'),
    clearReferenceBtn: byId('clearReferenceBtn'),
    duplicateModelBtn: byId('duplicateModelBtn'),
    dataSummary: byId('dataSummary'),
    dbModelList: byId('dbModelList'),
    textureModeOn: byId('textureModeOn'),
    ampNoise: byId('ampNoise'),
    ampNoiseReadout: byId('ampNoiseReadout'),
    phaseScale: byId('phaseScale'),
    phaseScaleReadout: byId('phaseScaleReadout'),
    arLoopBtn: byId('arLoopBtn'),
    arStopBtn: byId('arStopBtn'),
    arStatus: byId('arStatus'),
    arPreviewCanvas: byId('arPreviewCanvas'),
  };

  let db = null;
  let state = {
    models: [],
    activeModelId: null,
    currentModel: null,
    referenceFileName: '',
    generatedBlobUrl: '',
    generatedArrayBuffer: null,
    candidateBatch: [],
    playbackAudioCtx: null,
    ui: { activeTab: 'train', useBoundaryAuto: true, boundaryThreshold: 12 },
    arLoop: { running: false, acCtx: null, nextStartTime: 0, segmentsQueued: 0 },
  };

  init();

  async function init() {
    await openDb();
    loadUiState();
    await loadModels();
    wireEvents();
    updateBoundaryReadout();
    if (!state.models.length) {
      const model = createDefaultModel('Default Model');
      await saveModel(model);
      state.models = [model];
      state.activeModelId = model.id;
      persistActiveId();
    }
    renderModelSelect();
    await selectActiveModel(state.activeModelId || state.models[0].id);
    renderAll();
    setStatus('準備完了です。');
  }


})();
