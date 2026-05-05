// File: RealImager_core.js
// 共通DSPコア：M/S分解・ヒルベルトFIR係数生成・SO(2)回転

const RICore = {
  // M/S 分解
  msSplit(L, R) {
    const len = L.length;
    const M = new Float32Array(len);
    const S = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      M[i] = 0.5 * (L[i] + R[i]);
      S[i] = 0.5 * (L[i] - R[i]);
    }
    return { M, S };
  },

  // M/S → L/R 再構成
  msMerge(M, S) {
    const len = M.length;
    const L = new Float32Array(len);
    const R = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      L[i] = M[i] + S[i];
      R[i] = M[i] - S[i];
    }
    return { L, R };
  },

  // ヒルベルトFIR係数（Type III/IV、Blackman窓）
  // N = 2K+1（奇数長）
  hilbertFIR(K, windowType = 'blackman') {
    const N = 2 * K + 1;
    const h = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const k = i - K; // [-K, K]
      if (k === 0 || k % 2 === 0) {
        h[i] = 0;
      } else {
        h[i] = 2 / (Math.PI * k);
      }
      // 窓
      const w = this._window(i, N, windowType);
      h[i] *= w;
    }
    return h;
  },

  _window(i, N, type) {
    const x = (2 * Math.PI * i) / (N - 1);
    switch (type) {
      case 'hamming':
        return 0.54 - 0.46 * Math.cos(x);
      case 'blackman':
        return 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x);
      case 'hann':
        return 0.5 * (1 - Math.cos(x));
      default:
        return 1.0;
    }
  },

  // FIR畳み込み（Sのヒルベルト変換 ≈ Ŝ）
  // 出力は Sと同じ長さ。先頭K サンプルは過渡（0埋め前提）
  convolveFIR(x, h) {
    const N = h.length;
    const len = x.length;
    const y = new Float32Array(len);
    for (let n = 0; n < len; n++) {
      let acc = 0;
      for (let k = 0; k < N; k++) {
        const idx = n - k;
        if (idx >= 0) acc += h[k] * x[idx];
      }
      y[n] = acc;
    }
    return y;
  },

  // 純遅延（Mサンプル）
  delay(x, M) {
    const len = x.length;
    const y = new Float32Array(len);
    for (let n = 0; n < len; n++) {
      y[n] = (n - M >= 0) ? x[n - M] : 0;
    }
    return y;
  },

  // SO(2)回転：S' = cosθ·S + sinθ·Ŝ
  rotate(S, Shat, theta) {
    const len = S.length;
    const out = new Float32Array(len);
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    for (let i = 0; i < len; i++) {
      out[i] = c * S[i] + s * Shat[i];
    }
    return out;
  },

  // 不変量計算
  // Mid誤差: 20*log10(||M' - M|| / ||M||)
  midError(M, Mp) {
    let num = 0, den = 0;
    for (let i = 0; i < M.length; i++) {
      const d = Mp[i] - M[i];
      num += d * d;
      den += M[i] * M[i];
    }
    if (den < 1e-20) return -200;
    return 10 * Math.log10(num / den);
  },

  // パワー誤差: 20*log10(|P' - P| / P)
  powerError(L, R, Lp, Rp) {
    let p = 0, pp = 0;
    for (let i = 0; i < L.length; i++) {
      p += L[i] * L[i] + R[i] * R[i];
      pp += Lp[i] * Lp[i] + Rp[i] * Rp[i];
    }
    if (p < 1e-20) return -200;
    return 10 * Math.log10(Math.abs(pp - p) / p + 1e-20);
  },

  // LR相関係数
  correlation(L, R) {
    let sumL = 0, sumR = 0, sumLR = 0, sumLL = 0, sumRR = 0;
    const n = L.length;
    for (let i = 0; i < n; i++) {
      sumL += L[i]; sumR += R[i];
      sumLR += L[i] * R[i];
      sumLL += L[i] * L[i];
      sumRR += R[i] * R[i];
    }
    const mL = sumL / n, mR = sumR / n;
    const cov = sumLR / n - mL * mR;
    const vL = sumLL / n - mL * mL;
    const vR = sumRR / n - mR * mR;
    const denom = Math.sqrt(vL * vR);
    if (denom < 1e-20) return 0;
    return cov / denom;
  }
};