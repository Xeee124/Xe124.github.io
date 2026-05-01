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

  function estimateEnvelope(vector) {
    const steps = 8;
    const env = [];
    let base = 0;
    for (let i = 0; i < vector.amps.length; i++) base += vector.amps[i] || 0;
    base /= Math.max(1, vector.amps.length);
    for (let i = 0; i < steps; i++) {
      const t = i / Math.max(1, steps - 1);
      env.push(clamp(base * (0.85 + 0.3 * Math.sin(t * Math.PI)), 0, 1));
    }
    return env;
  }

