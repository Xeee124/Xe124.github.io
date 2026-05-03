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
