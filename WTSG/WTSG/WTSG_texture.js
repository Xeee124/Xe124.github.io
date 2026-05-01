// === WTSG_texture.js ===
  function mergeTextureProfiles(reference, harmonicsCount) {
    const items = referenceList(reference);
    const profiles = items.map(r => r.texture).filter(Boolean);
    if (!profiles.length) return null;

    const H = harmonicsCount;
    const ampMean      = new Float32Array(H);
    const ampStd       = new Float32Array(H);
    const phaseVel     = new Float32Array(H);
    const phaseVelStd  = new Float32Array(H);
    let ampSimilarity  = 0;

    for (const p of profiles) {
      for (let h = 0; h < H; h++) {
        ampMean[h]     += (p.ampMean[h]     || 0) / profiles.length;
        ampStd[h]      += (p.ampStd[h]      || 0) / profiles.length;
        phaseVel[h]    += (p.phaseVel[h]    || 0) / profiles.length;
        phaseVelStd[h] += (p.phaseVelStd[h] || 0) / profiles.length;
      }
      ampSimilarity += (p.ampSimilarity || 0.7) / profiles.length;
    }
    return { ampMean, ampStd, phaseVel, phaseVelStd, ampSimilarity };
  }

  // 質感プロファイルから初期ベクトルを作る
  function initVectorFromTexture(tex, harmonicsCount, ampNoise) {
    const amps   = new Array(harmonicsCount);
    const phases = new Array(harmonicsCount);
    for (let h = 0; h < harmonicsCount; h++) {
      const base = tex.ampMean[h] || 0;
      const std  = tex.ampStd[h]  || 0;
      amps[h]   = clamp(base + randn() * std * ampNoise, 0, 1);
      phases[h] = wrapPhase((rand() * 2 - 1) * Math.PI); // 初期位相はランダム
    }
    return normalizeVector({ amps, phases });
  }

  // 前のベクトルから次のベクトルを自己回帰で作る
  // ampNoise: 振幅ノイズの強さ（0=完全固定, 1=プロファイル通り）
  // phaseScale: 位相変化速度のスケール（1=リファレンスと同じ速さ）
  function stepVectorAutoregressive(prevVec, tex, harmonicsCount, ampNoise, phaseScale) {
    const amps   = new Array(harmonicsCount);
    const phases = new Array(harmonicsCount);
    for (let h = 0; h < harmonicsCount; h++) {
      // 振幅: 平均に向けて引き戻しながら小さなノイズ
      const prevAmp = prevVec.amps[h]   || 0;
      const prevPh  = prevVec.phases[h] || 0;
      const target  = tex.ampMean[h]    || 0;
      const std     = tex.ampStd[h]     || 0;
      // 平均回帰（ampSimilarity が高いほど戻りが遅い）
      const pull    = 1 - tex.ampSimilarity;  // 0(変化なし)〜1(すぐ平均に戻る)
      amps[h] = clamp(
        prevAmp + pull * (target - prevAmp) + randn() * std * ampNoise,
        0, 1
      );

      // 位相: リファレンスの速度でランダムウォーク
      const vel     = tex.phaseVel[h]    || 0;
      const velStd  = tex.phaseVelStd[h] || 0.3;
      const step    = (vel + randn() * velStd) * phaseScale;
      phases[h] = wrapPhase(prevPh + step);
    }
    return { amps, phases }; // normalizeしない（質感を保つため）
  }

  // 自己回帰でwaveSize*segmentCount分のバッファを作る
  function synthAutoregressiveBuffer(tex, harmonicsCount, waveSize, segmentCount, ampNoise, phaseScale) {
    const buffer = new Float32Array(segmentCount * waveSize);
    let vec = initVectorFromTexture(tex, harmonicsCount, ampNoise);
    for (let seg = 0; seg < segmentCount; seg++) {
      if (seg > 0) vec = stepVectorAutoregressive(vec, tex, harmonicsCount, ampNoise, phaseScale);
      const wave = synthWaveFromVector(vec, waveSize, harmonicsCount);
      buffer.set(wave, seg * waveSize);
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
    const blockAlign = bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 3, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 32, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 4) {
      view.setFloat32(offset, clamp(samples[i], -1, 1), true);
    }
    return buffer;
  }

  function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  // ================================================================
  // 自己回帰ループ — WebAudio APIでリアルタイム再生
  // ================================================================
