// === WTSG_vector.js ===
  function averageVectors(vectors) {
    if (!vectors.length) return null;
    const len = vectors[0].amps.length;
    const amps = Array(len).fill(0);
    const phases = Array(len).fill(0);
    for (const v of vectors) {
      for (let i = 0; i < len; i++) {
        amps[i] += v.amps[i] || 0;
        phases[i] += v.phases[i] || 0;
      }
    }
    for (let i = 0; i < len; i++) {
      amps[i] /= vectors.length;
      phases[i] /= vectors.length;
    }
    return normalizeVector({ amps, phases });
  }

  function vectorDiff(a, b) {
    if (!a || !b) return null;
    const len = Math.min(a.amps.length, b.amps.length);
    const amps = Array(len);
    const phases = Array(len);
    for (let i = 0; i < len; i++) {
      amps[i] = (a.amps[i] || 0) - (b.amps[i] || 0);
      phases[i] = wrapPhase((a.phases[i] || 0) - (b.phases[i] || 0));
    }
    return { amps, phases };
  }

  function applyDiff(base, diff, amount) {
    if (!base || !diff) return base;
    const len = Math.min(base.amps.length, diff.amps.length);
    const amps = Array(len);
    const phases = Array(len);
    for (let i = 0; i < len; i++) {
      amps[i] = clamp((base.amps[i] || 0) + (diff.amps[i] || 0) * amount, 0, 1);
      phases[i] = wrapPhase((base.phases[i] || 0) + (diff.phases[i] || 0) * amount);
    }
    return { amps, phases };
  }
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

    // ---- 倍音ごとのぼかし（ampStdを使って質感を保つ） ----
    // リファレンスのtextureがあればampStdを使い、なければ均一なsigmaにフォールバック
    const texList = referenceProfile ? referenceList(referenceProfile).map(r => r.texture).filter(Boolean) : [];
    const hasTex = texList.length > 0;
    const uniformSigma = 0.10 + bandwidth * 0.45;

    const amps   = new Array(harmonicsCount);
    const phases = new Array(harmonicsCount);
    for (let h = 0; h < harmonicsCount; h++) {
      const v = base.amps[h] || 0;
      let sigma;
      if (hasTex) {
        // ampStdの平均を「ぼかしの自然な幅」として使い、bandwidthで倍率をかける
        let stdSum = 0;
        for (const tex of texList) stdSum += (tex.ampStd[h] || 0);
        const naturalStd = stdSum / texList.length;
        // 固定成分が強い倍音（std小さい）はぼかしを弱く、変化する倍音はぼかしを強く
        sigma = naturalStd * (0.5 + bandwidth * 1.5);
      } else {
        // フォールバック: 高次倍音ほど少し強くぼかす（元の挙動）
        sigma = uniformSigma * (0.35 + h / Math.max(1, harmonicsCount - 1));
      }
      amps[h]   = clamp(v + randn() * sigma, 0, 1);
      phases[h] = wrapPhase((base.phases[h] || 0) + randn() * uniformSigma * 0.65);
    }

    let out = { amps, phases };
    if (referenceFrames.length && refMix > 0) {
      const refVec = pickReferenceFrame(referenceProfile, timeBias, harmonicsCount);
      out = {
        amps:   lerpArray(out.amps, refVec.amps, refMix),
        phases: lerpArray(out.phases, refVec.phases, refMix).map(wrapPhase),
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
        phases: lerpArray(base.phases, refVec.phases, refMix2).map(wrapPhase),
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
      amps:   (frame.amps || []).slice(0, harmonicsCount),
      phases: (frame.phases || []).slice(0, harmonicsCount),
    };
  }

  function randomVector(harmonicsCount) {
    const amps = [];
    const phases = [];
    for (let i = 0; i < harmonicsCount; i++) {
      amps.push(Math.pow(rand(), 1.6) * (1 - i / (harmonicsCount * 1.15)));
      phases.push((rand() * 2 - 1) * Math.PI);
    }
    return normalizeVector({ amps, phases });
  }

