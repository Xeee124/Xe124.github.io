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

    // 位相速度：フレーム間diff（インライン、配列確保なし）
    if (frames.length >= 2) {
      const nDiff = frames.length - 1;
      const TWO_PI = 2 * Math.PI;
      for (let h = 0; h < H; h++) {
        let sumD = 0, sumD2 = 0;
        for (let fi = 1; fi < frames.length; fi++) {
          let d = (frames[fi].phases[h] || 0) - (frames[fi-1].phases[h] || 0);
          d -= TWO_PI * Math.round(d / TWO_PI);
          sumD += d; sumD2 += d * d;
        }
        phaseVel[h]    = sumD / nDiff;
        phaseVelStd[h] = Math.sqrt(Math.max(0, sumD2 / nDiff - phaseVel[h] * phaseVel[h]));
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

