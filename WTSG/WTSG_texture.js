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
