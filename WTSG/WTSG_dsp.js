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
