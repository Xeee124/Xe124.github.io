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
