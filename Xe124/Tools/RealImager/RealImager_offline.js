// File: RealImager_offline.js
// 式3：FFTベース・全通過フィルタ H_θ[k] = exp(-jθ·sgn_N[k])

const RIOffline = {
  // 基数2 FFT（in-place、複素数 re/im 配列）
  fft(re, im, inverse = false) {
    const n = re.length;
    if ((n & (n - 1)) !== 0) throw new Error('FFT length must be power of 2');

    // ビット反転
    let j = 0;
    for (let i = 1; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }

    // バタフライ
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const ang = (inverse ? 2 : -2) * Math.PI / len;
      const wRe = Math.cos(ang), wIm = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let curRe = 1, curIm = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k, b = a + half;
          const tRe = curRe * re[b] - curIm * im[b];
          const tIm = curRe * im[b] + curIm * re[b];
          re[b] = re[a] - tRe;
          im[b] = im[a] - tIm;
          re[a] += tRe;
          im[a] += tIm;
          const nRe = curRe * wRe - curIm * wIm;
          const nIm = curRe * wIm + curIm * wRe;
          curRe = nRe; curIm = nIm;
        }
      }
    }

    if (inverse) {
      for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
    }
  },

  // 次の2の冪
  nextPow2(n) {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
  },

  // Side に H_θ[k] = exp(-jθ·sgn_N[k]) を適用
  applyAllpass(S, theta) {
    const len = S.length;
    const N = this.nextPow2(len);
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < len; i++) re[i] = S[i];

    this.fft(re, im, false);

    const c = Math.cos(theta);
    const s = Math.sin(theta);
    // sgn_N[k]: 1≤k<N/2 → +1, k=0 or N/2 → 0, N/2<k≤N-1 → -1
    // H[k] = cos(θ·sgn) - j·sin(θ·sgn)
    for (let k = 0; k < N; k++) {
      let sgn = 0;
      if (k > 0 && k < N / 2) sgn = 1;
      else if (k > N / 2) sgn = -1;
      // k=0, k=N/2 は sgn=0 → H=1
      if (sgn === 0) continue;
      const hRe = c;
      const hIm = -s * sgn;
      const xRe = re[k], xIm = im[k];
      re[k] = xRe * hRe - xIm * hIm;
      im[k] = xRe * hIm + xIm * hRe;
    }

    this.fft(re, im, true);

    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) out[i] = re[i];
    return out;
  },

  // 全長処理：L,R → L',R'
  process(L, R, theta) {
    const { M, S } = RICore.msSplit(L, R);
    const Sp = this.applyAllpass(S, theta);
    return RICore.msMerge(M, Sp);
  },

  // AudioBuffer → 処理済みAudioBuffer
  processAudioBuffer(audioCtx, srcBuf, theta) {
    const len = srcBuf.length;
    const sr = srcBuf.sampleRate;
    const ch = srcBuf.numberOfChannels;
    const L = srcBuf.getChannelData(0);
    const R = ch > 1 ? srcBuf.getChannelData(1) : L;
    const { L: Lp, R: Rp } = this.process(L, R, theta);
    const out = audioCtx.createBuffer(2, len, sr);
    out.copyToChannel(Lp, 0);
    out.copyToChannel(Rp, 1);
    return out;
  },

  // WAV エンコード（16bit PCM）
  encodeWAV(audioBuffer) {
    const numCh = audioBuffer.numberOfChannels;
    const sr = audioBuffer.sampleRate;
    const len = audioBuffer.length;
    const buffer = new ArrayBuffer(44 + len * numCh * 2);
    const view = new DataView(buffer);

    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + len * numCh * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * numCh * 2, true);
    view.setUint16(32, numCh * 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, len * numCh * 2, true);

    const chans = [];
    for (let c = 0; c < numCh; c++) chans.push(audioBuffer.getChannelData(c));

    let off = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < numCh; c++) {
        let s = Math.max(-1, Math.min(1, chans[c][i]));
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        off += 2;
      }
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }
};