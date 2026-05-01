// === WTSG_dsp.js ===
  function frameToVector(frame, harmonicsCount) {
    const N = frame.length;
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, N - 1));
      re[i] = frame[i] * win;
    }
    fft(re, im);
    const amps = [];
    const phases = [];
    // Strict Anti-Aliasing limit
    const maxBin = Math.min(harmonicsCount, Math.floor(N / 2) - 1);
    let maxMag = 1e-9;
    const mags = new Float64Array(maxBin);
    for (let h = 1; h <= maxBin; h++) {
      const mag = Math.hypot(re[h], im[h]);
      mags[h - 1] = mag;
      if (mag > maxMag) maxMag = mag;
    }
    for (let h = 0; h < maxBin; h++) {
      // アンチエイリアシング: 高域(ナイキスト限界付近)の緩やかな減衰
      let rollOff = 1.0;
      const nyquistProximity = h / maxBin;
      if (nyquistProximity > 0.85) {
        rollOff = Math.cos((nyquistProximity - 0.85) / 0.15 * (Math.PI / 2));
      }
      amps.push(clamp((mags[h] / maxMag) * rollOff, 0, 1));
      phases.push(wrapPhase(Math.atan2(im[h + 1], re[h + 1])));
    }
    while (amps.length < harmonicsCount) { amps.push(0); phases.push(0); }
    return normalizeVector({ amps, phases });
  }

  function fft(re, im) {
    const n = re.length;
    if (n <= 1) return;
    const levels = Math.log2(n);
    if (Math.round(levels) !== levels) throw new Error('FFT size must be power of 2');
    let j = 0;
    for (let i = 0; i < n; i++) {
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
      let m = n >> 1;
      while (j >= m && m >= 2) { j -= m; m >>= 1; }
      j += m;
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const tableStep = Math.PI * 2 / size;
      for (let i = 0; i < n; i += size) {
        for (let k = 0; k < half; k++) {
          const angle = k * tableStep;
          const tpre =  re[i+k+half] * Math.cos(angle) + im[i+k+half] * Math.sin(angle);
          const tpim = -re[i+k+half] * Math.sin(angle) + im[i+k+half] * Math.cos(angle);
          re[i+k+half] = re[i+k] - tpre;
          im[i+k+half] = im[i+k] - tpim;
          re[i+k] += tpre;
          im[i+k] += tpim;
        }
      }
    }
  }

  function synthVectorToBuffer(vector, waveSize, durationSeconds, sampleRate, harmonicsCount, timeBias = 0.5) {
    const totalSamples = Math.max(waveSize, Math.floor(durationSeconds * sampleRate));
    const aligned = Math.floor(totalSamples / waveSize) * waveSize;
    const segmentCount = Math.max(1, Math.floor(aligned / waveSize));
    
    // フェーズ・ロック処理：クロスフェード用に1セグメント多く生成する
    const segments = [];
    for (let seg = 0; seg <= segmentCount; seg++) {
      const t = segmentCount <= 1 ? 0.5 : seg / segmentCount;
      const drift = 0.08 * Math.sin(t * Math.PI * 2 + timeBias * Math.PI * 2);
      const segVec = {
        amps: vector.amps.map((v, i) => clamp(v + drift * (0.25 - i / Math.max(1, harmonicsCount * 1.1)), 0, 1)),
        phases: vector.phases.map((p, i) => wrapPhase(p + drift * (1.4 + i * 0.05)))
      };
      segments.push(synthWaveFromVector(segVec, waveSize, harmonicsCount));
    }
    
    const buffer = new Float32Array(aligned);
    for (let seg = 0; seg < segmentCount; seg++) {
      const waveCurrent = segments[seg];
      const waveNext = segments[seg + 1];
      const startIdx = seg * waveSize;
      
      // サンプル単位でのリニアクロスフェード（波形の不連続性を排除）
      for (let i = 0; i < waveSize; i++) {
        const fade = i / waveSize; // 0.0 to 1.0
        buffer[startIdx + i] = waveCurrent[i] * (1 - fade) + waveNext[i] * fade;
      }
    }
    return { buffer, url: bufferToWavUrl(buffer, sampleRate) };
  }

  function synthWaveFromVector(vector, waveSize, harmonicsCount) {
    const re = new Float64Array(waveSize);
    const im = new Float64Array(waveSize);
    const maxBin = Math.min(harmonicsCount, Math.floor(waveSize / 2) - 1);
    for (let h = 1; h <= maxBin; h++) {
      // アンチエイリアシング: 生成時にも高次倍音をロールオフ
      let rollOff = 1.0;
      if (h > maxBin * 0.85) {
        rollOff = Math.cos((h - maxBin * 0.85) / (maxBin * 0.15) * (Math.PI / 2));
      }
      const a = (vector.amps[h - 1] || 0) * (waveSize / 2) * rollOff;
      const p = vector.phases[h - 1] || 0;
      re[h] = -a * Math.sin(p);
      im[h] = a * Math.cos(p);
      re[waveSize - h] = re[h];
      im[waveSize - h] = -im[h];
    }
    ifft(re, im);
    const out = new Float32Array(waveSize);
    for (let i = 0; i < waveSize; i++) out[i] = Math.tanh(re[i] * 1.15);
    return out;
  }

  function ifft(re, im) {
    for (let i = 0; i < re.length; i++) im[i] = -im[i];
    fft(re, im);
    const n = re.length;
    for (let i = 0; i < n; i++) { re[i] /= n; im[i] = -im[i] / n; }
  }

